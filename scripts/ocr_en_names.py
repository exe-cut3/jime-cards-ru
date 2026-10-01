"""
OCR the text of English TTS mod cards that carry no nickname (damage, fear, weakness, captured,
a few skills), so scripts/match_en_images.py can match them by name instead of by picture.

Output: data/raw/tts_en/ocr_names.json   {picture file: [text lines]}

Run:  uv run --with rapidocr-onnxruntime --with pillow python scripts/ocr_en_names.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = RAW / "tts_en" / "ocr_names.json"


def main() -> None:
    mod = json.loads((RAW / "tts_en" / "cards.json").read_text(encoding="utf-8"))["cards"]
    named = {r["file"] for r in mod if r["nickname"]}
    todo = sorted({r["file"] for r in mod} - named)
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    ocr = RapidOCR()
    for i, f in enumerate(todo):
        if f in done:
            continue
        im = Image.open(RAW / f).convert("RGB")
        res, _ = ocr(np.asarray(im))
        done[f] = [t for _, t, conf in (res or []) if conf > 0.5]
        if i % 20 == 0:
            print(i, len(todo), f, done[f][:3])
            OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(done)} pictures read")


if __name__ == "__main__":
    main()
