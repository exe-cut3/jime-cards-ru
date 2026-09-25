"""
Prepare static assets for the web app:
  data/raw/**/*.png  ->  app/public/img/**/*.webp   (kept out of git — FFG copyright)
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
QUALITY = 82


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
    done = skipped = 0
    src_bytes = dst_bytes = 0
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
    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(CARDS, PUBLIC / "data" / "cards.json")
    print(f"images: {done} converted, {skipped} up to date; "
          f"{src_bytes / 1e6:.1f} MB png -> {dst_bytes / 1e6:.1f} MB webp in {time.time() - t0:.0f}s")
    print(f"cards.json -> {PUBLIC / 'data' / 'cards.json'}")


if __name__ == "__main__":
    main()
