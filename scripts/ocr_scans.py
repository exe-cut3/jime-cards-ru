"""
OCR every scan listed in data/raw/manifest.json and store the recognised lines in
data/raw/ocr.json (kept out of git together with the scans).

Uses rapidocr-onnxruntime (pip-only, CPU). Scans are small (320-930 px), so each
image is upscaled 3x before recognition; coordinates are stored in original pixels.

Run:  uv run --with rapidocr-onnxruntime --with pillow python scripts/ocr_scans.py
Resume-safe: already processed files are skipped.
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "manifest.json"
OUT = RAW / "ocr.json"
SCALE = 3


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = [im["file"] for im in manifest["images"] if im.get("file")]
    if "--only" in sys.argv:  # e.g. --only items/hands
        prefix = sys.argv[sys.argv.index("--only") + 1]
        files = [f for f in files if f.startswith(prefix)]

    result = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    todo = [f for f in files if f not in result]
    print(f"{len(files)} files, {len(todo)} to OCR", flush=True)

    ocr = RapidOCR()
    t0 = time.time()
    for n, rel in enumerate(todo, 1):
        im = Image.open(RAW / rel).convert("RGB")
        big = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
        res, _ = ocr(np.array(big))
        lines = []
        for box, text, conf in (res or []):
            xs = [p[0] / SCALE for p in box]
            ys = [p[1] / SCALE for p in box]
            lines.append({
                "x": round(min(xs)), "y": round(min(ys)),
                "w": round(max(xs) - min(xs)), "h": round(max(ys) - min(ys)),
                "conf": round(float(conf), 3), "text": text,
            })
        lines.sort(key=lambda l: (l["y"], l["x"]))
        result[rel] = {"width": im.width, "height": im.height, "lines": lines}
        if n % 25 == 0 or n == len(todo):
            OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
            rate = (time.time() - t0) / n
            print(f"  {n}/{len(todo)}  {rate:.2f}s/img  eta {rate * (len(todo) - n) / 60:.1f} min", flush=True)
    print(f"done -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
