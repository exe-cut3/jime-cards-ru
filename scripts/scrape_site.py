"""
Crawl the JiME Cards DB Google Site and download every card scan.

Output:
  data/raw/<section>/<subsection>/<subsection>-NN.<ext>   card images (original resolution)
  data/raw/_html/<slug>.html                              raw page HTML (for re-parsing offline)
  data/raw/manifest.json                                  file -> page/section/subsection/index mapping

Polite: ~1.5 s between page fetches, ~0.7 s between image fetches, 3 retries with backoff.
Resume-safe: existing non-empty files are not re-downloaded.
Image URLs are signed and expire after a few minutes, so a page's images are
downloaded right after the page itself is fetched.
Only the Python standard library is used.
"""
import hashlib
import html
import json
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
HTML_DIR = RAW / "_html"
BASE = "https://sites.google.com"
HOME = "/view/jime-carddb/home"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
PAGE_DELAY = 1.5
IMG_DELAY = 0.7

IMG_RE = re.compile(
    r"https://(?:sites\.google\.com/sitesv-images-rt/[A-Za-z0-9_-]+"
    r"|lh\d\.googleusercontent\.com/[A-Za-z0-9_./-]+)"
    r"(?:=[A-Za-z0-9_-]+)?"
)
LINK_RE = re.compile(r'href="(/view/jime-carddb/[^"#?]*)')


def fetch(url, binary=False, tries=3):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "")
                return (data if binary else data.decode("utf-8", "replace")), ctype
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            wait = 3 * (attempt + 1)
            print(f"    retry {attempt + 1} after error {e!r}; sleeping {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"failed to fetch {url}: {last!r}")


def image_dims(b):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", b[16:24])
        return "png", w, h
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return "jpg", w, h
            if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
                i += 2
                continue
            L = struct.unpack(">H", b[i + 2:i + 4])[0]
            i += 2 + L
        return "jpg", None, None
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "webp", None, None
    if b[:6] in (b"GIF87a", b"GIF89a"):
        w, h = struct.unpack("<HH", b[6:10])
        return "gif", w, h
    return "bin", None, None


def strip_image_size(url):
    return re.sub(r"=[A-Za-z0-9_-]+$", "", url)


def page_slug(path):
    rel = path[len(HOME):].strip("/")
    return rel.replace("/", "__") or "home"


def page_parts(path):
    rel = path[len(HOME):].strip("/")
    return [p for p in rel.split("/") if p]


def extract_image_urls(text):
    """Card image URLs from the page's main content, in document order, size suffix stripped."""
    m = re.search(r'<div[^>]*role="main"[^>]*>(.*)', text, flags=re.S)
    body = m.group(1) if m else text
    urls = []
    for u in IMG_RE.findall(body):
        u = strip_image_size(u)
        if u not in urls:
            urls.append(u)
    return urls


def fetch_image_with_refresh(p, idx, u):
    """Fetch one card image; on failure re-fetch the page (signed URLs expire) and retry once."""
    try:
        return fetch(u + "=s0", binary=True, tries=1)
    except RuntimeError:
        pass
    print(f"    refreshing page URLs for {p['slug']} #{idx}", flush=True)
    time.sleep(PAGE_DELAY)
    fresh = extract_image_urls(fetch(BASE + p["path"])[0])
    if len(fresh) != len(p["image_urls"]):
        raise RuntimeError(f"page now has {len(fresh)} images, expected {len(p['image_urls'])}")
    p["image_urls"] = fresh
    return fetch(fresh[idx - 1] + "=s0", binary=True)


def download_page_images(p, images, by_hash):
    parts = p["parts"]
    if not parts:
        section, sub = "home", None
    elif len(parts) == 1:
        section, sub = parts[0], None
    else:
        section, sub = parts[0], parts[1]
    out_dir = RAW / section / sub if sub else RAW / section
    out_dir.mkdir(parents=True, exist_ok=True)
    stem_base = sub or section

    for idx in range(1, len(p["image_urls"]) + 1):
        u = p["image_urls"][idx - 1]
        stem = f"{stem_base}-{idx:02d}"
        existing = [f for f in out_dir.glob(stem + ".*") if f.stat().st_size > 0]
        if existing:
            f = existing[0]
            data = f.read_bytes()
            status = "cached"
        else:
            try:
                data, _ = fetch_image_with_refresh(p, idx, u)
            except RuntimeError as e:
                print(f"  FAILED     {section}/{sub}/{stem}: {e}", flush=True)
                images.append({
                    "file": None, "section": section, "subsection": sub,
                    "page": p["path"], "page_title": p["title"], "index": idx,
                    "source_url": u, "error": str(e),
                })
                time.sleep(IMG_DELAY)
                continue
            ext, _, _ = image_dims(data)
            f = out_dir / f"{stem}.{ext}"
            f.write_bytes(data)
            status = "downloaded"
            time.sleep(IMG_DELAY)
        ext, w, h = image_dims(data)
        sha1 = hashlib.sha1(data).hexdigest()
        rel = f.relative_to(RAW).as_posix()
        dup_of = by_hash.get(sha1)
        by_hash.setdefault(sha1, rel)
        images.append({
            "file": rel,
            "section": section,
            "subsection": sub,
            "page": p["path"],
            "page_title": p["title"],
            "index": idx,
            "source_url": p["image_urls"][idx - 1],
            "width": w,
            "height": h,
            "bytes": len(data),
            "sha1": sha1,
            "duplicate_of": dup_of,
        })
        print(f"  {status:10s} {rel}  {w}x{h}  {len(data)} B"
              + (f"  DUP of {dup_of}" if dup_of else ""), flush=True)


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    HTML_DIR.mkdir(parents=True, exist_ok=True)

    queue = deque([HOME])
    seen_pages = {HOME}
    pages = []
    images = []
    by_hash = {}

    # NOTE: image URLs on Google Sites are signed and expire within minutes,
    # so each page's images are downloaded immediately after the page is fetched.
    while queue:
        path = queue.popleft()
        url = BASE + path
        slug = page_slug(path)
        print(f"page {path}", flush=True)
        text, _ = fetch(url)
        (HTML_DIR / f"{slug}.html").write_text(text, encoding="utf-8")

        for link in LINK_RE.findall(text):
            link = link.rstrip("/")
            if link.startswith(HOME) and link not in seen_pages:
                seen_pages.add(link)
                queue.append(link)

        urls = extract_image_urls(text)
        tm = re.search(r"<title>(.*?)</title>", text, flags=re.S)
        title = html.unescape(tm.group(1)).split(" - ")[0].strip() if tm else slug
        p = {"path": path, "slug": slug, "title": title,
             "parts": page_parts(path), "image_urls": urls}
        pages.append(p)
        print(f"    title={title!r} images={len(urls)} pages_known={len(seen_pages)}", flush=True)

        download_page_images(p, images, by_hash)
        time.sleep(PAGE_DELAY)

    failed = [i for i in images if i.get("error")]
    manifest = {
        "source": BASE + HOME,
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "pages": [{k: v for k, v in p.items() if k != "image_urls"} | {"image_count": len(p["image_urls"])}
                  for p in pages],
        "images": images,
    }
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n== done: {len(pages)} pages, {len(images) - len(failed)} images, {len(failed)} failed, "
          f"manifest at {RAW / 'manifest.json'} ==", flush=True)


if __name__ == "__main__":
    main()
