"""
Prepare static assets for the web app:
  data/raw/**/*.png  ->  app/public/img/**/*.webp     full scans (kept out of git — FFG copyright)
                     ->  app/public/thumb/**/*.webp   grid thumbnails (320 px wide, 640 for landscape)
  data/cards.json    ->  app/public/data/cards.json

Run:  uv run --with pillow python scripts/prepare_app.py
Resume-safe: a .webp newer than its .png is skipped.
"""
import json
import shutil
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CARDS = ROOT / "data" / "cards.json"
PUBLIC = ROOT / "app" / "public"
IMG = PUBLIC / "img"
THUMB = PUBLIC / "thumb"
QUALITY = 82
THUMB_QUALITY = 78
THUMB_WIDTH = 320  # grid tiles are ~170 px wide, so 2x for retina
THUMB_WIDTH_LANDSCAPE = 640  # hero boards span two columns


def make_thumb(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    target = THUMB_WIDTH_LANDSCAPE if w > h else THUMB_WIDTH
    if w > target:
        im = im.resize((target, round(h * target / w)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=THUMB_QUALITY, method=6)


def main():
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    files = [(RAW / im["file"], Path(im["file"])) for im in manifest["images"] if im.get("file")]
    # Russian scans referenced by translations.json -> app/public/img/ru/...
    tr_path = ROOT / "data" / "translations.json"
    if tr_path.exists():
        tr = json.loads(tr_path.read_text(encoding="utf-8"))["cards"]
        ru_files = set()
        for t in tr.values():
            for key in ("image_ru", "image_ru_back"):
                if t.get(key):
                    ru_files.add(t[key])
            ru_files.update(t.get("image_ru_alternates", []))
        files += [(RAW / "tts" / f, Path("ru") / f) for f in sorted(ru_files)]
    done = skipped = thumbs = 0
    src_bytes = dst_bytes = thumb_bytes = 0
    t0 = time.time()
    for src, rel in files:
        dst = IMG / rel.with_suffix(".webp")
        dst.parent.mkdir(parents=True, exist_ok=True)
        src_bytes += src.stat().st_size
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
        else:
            Image.open(src).convert("RGB").save(dst, "WEBP", quality=QUALITY, method=6)
            done += 1
        dst_bytes += dst.stat().st_size
        th = THUMB / rel.with_suffix(".webp")
        th.parent.mkdir(parents=True, exist_ok=True)
        if not (th.exists() and th.stat().st_mtime >= src.stat().st_mtime):
            make_thumb(src, th)
            thumbs += 1
        thumb_bytes += th.stat().st_size
    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(CARDS, PUBLIC / "data" / "cards.json")
    print(f"images: {done} converted, {skipped} up to date; "
          f"{src_bytes / 1e6:.1f} MB png -> {dst_bytes / 1e6:.1f} MB webp in {time.time() - t0:.0f}s")
    print(f"thumbnails: {thumbs} made, {thumb_bytes / 1e6:.1f} MB total in {THUMB}")
    print(f"cards.json -> {PUBLIC / 'data' / 'cards.json'}")


if __name__ == "__main__":
    main()
