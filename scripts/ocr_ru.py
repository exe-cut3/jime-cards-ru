"""
OCR of the Russian (Hobby World) card scans cut from the TTS mod.

Hybrid: rapidocr (language-agnostic text *detection*) finds the text lines, then
tesseract with the `rus` model *recognises* them — twice:
  * `lines`  : every detected line on its own (psm 7)  -> names, footers, traits, numbers
  * `blocks` : vertically adjacent lines grouped into a block (psm 6) -> card text, where
               line context makes tesseract markedly more accurate
The Cyrillic recognition models of rapidocr read this serif font badly, tesseract reads it
well but loses lines when given the whole card — hence the split.

Input : data/raw/tts/cards.json           (from scripts/tts_fetch.py)
Output: data/raw/tts/ocr_ru.json          {file: {width, height, lines: [...], blocks: [...]}}

Run:  uv run --with rapidocr-onnxruntime --with pillow python scripts/ocr_ru.py [--only 232-00,228-00]
Needs: C:/Program Files/Tesseract-OCR/tesseract.exe and data/raw/tessdata/rus.traineddata
Resume-safe: files already in ocr_ru.json are skipped.
"""
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent.parent
TTS = ROOT / "data" / "raw" / "tts"
CARDS = TTS / "cards.json"
OUT = TTS / "ocr_ru.json"
TESS = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
TESSDATA = ROOT / "data" / "raw" / "tessdata"
DET_SCALE = 2      # upscale for detection
REC_SCALE = 3      # upscale for recognition
LINE_HEIGHT = 80   # normalised line height for single-line recognition


def run_tesseract(images, tmpdir, psm):
    """Recognise a list of PIL images in one tesseract call (image list -> pages split by \\f)."""
    if not images:
        return []
    paths = []
    for i, im in enumerate(images):
        p = Path(tmpdir) / f"p{psm}_{i:03d}.png"
        im.save(p)
        paths.append(str(p))
    lst = Path(tmpdir) / f"list{psm}.txt"
    lst.write_text("\n".join(paths), encoding="utf-8")
    r = subprocess.run([str(TESS), "--tessdata-dir", str(TESSDATA), str(lst), "stdout", "-l", "rus", "--psm", str(psm)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    pages = r.stdout.split("\f")
    out = [p.strip("\n") for p in pages[:len(images)]]
    while len(out) < len(images):
        out.append("")
    return out


def crop_line(im, r):
    x0, y0, x1, y1 = r
    crop = im.crop((x0, y0, x1, y1)).convert("L")
    scale = LINE_HEIGHT / max(1, y1 - y0)
    crop = crop.resize((max(1, int(crop.width * scale)), LINE_HEIGHT), Image.LANCZOS)
    return ImageOps.expand(crop, border=16, fill=255)


def crop_block(im, r):
    x0, y0, x1, y1 = r
    crop = im.crop((x0, y0, x1, y1)).convert("L")
    crop = crop.resize((crop.width * REC_SCALE, crop.height * REC_SCALE), Image.LANCZOS)
    return ImageOps.expand(crop, border=40, fill=255)


def group_blocks(rects, factor=0.7):
    """Group line rects (x0,y0,x1,y1) into blocks of vertically adjacent, horizontally overlapping lines."""
    rects = sorted(rects, key=lambda r: (r[1], r[0]))
    blocks = []
    for r in rects:
        if blocks:
            b = blocks[-1]
            h = r[3] - r[1]
            overlap = min(r[2], b[2]) - max(r[0], b[0])
            if r[1] - b[3] < factor * h and overlap > 0:
                blocks[-1] = (min(b[0], r[0]), min(b[1], r[1]), max(b[2], r[2]), max(b[3], r[3]))
                continue
        blocks.append(tuple(r))
    return blocks


def main():
    data = json.loads(CARDS.read_text(encoding="utf-8"))
    files = sorted({c["file"] for c in data["cards"] if c.get("file")} |
                   {c["back_file"] for c in data["cards"] if c.get("back_file")})
    if "--only" in sys.argv:
        keys = sys.argv[sys.argv.index("--only") + 1].split(",")
        files = [f for f in files if any(k in f for k in keys)]
    out_path = OUT
    if "--shard" in sys.argv:   # --shard 2/4 : process every 4th file starting at 2, write ocr_ru.part2.json
        i, n = map(int, sys.argv[sys.argv.index("--shard") + 1].split("/"))
        files = files[i::n]
        out_path = OUT.with_name(f"ocr_ru.part{i}.json")
    result = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    result = {k: v for k, v in result.items() if "blocks" in v}   # drop output of the old format
    todo = [f for f in files if f not in result]
    print(f"{len(files)} files, {len(todo)} to OCR", flush=True)
    det = RapidOCR()
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        for n, rel in enumerate(todo, 1):
            im = Image.open(TTS / rel).convert("RGB")
            big = im.resize((im.width * DET_SCALE, im.height * DET_SCALE), Image.LANCZOS)
            res, _ = det(np.array(big))
            rects = []
            for b, _t, _c in (res or []):
                xs = [p[0] / DET_SCALE for p in b]
                ys = [p[1] / DET_SCALE for p in b]
                x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
                w, h = x1 - x0, y1 - y0
                if h > 2.5 * w and h > 60:      # vertical "TM Lic. SZC to FFG" along the edge
                    continue
                pad = 6
                rects.append((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
            rects.sort(key=lambda r: (r[1], r[0]))
            line_imgs = [crop_line(im, r) for r in rects]
            line_txt = run_tesseract(line_imgs, tmp, 7)
            blocks = group_blocks(rects)
            block_imgs = [crop_block(im, r) for r in blocks]
            block_txt = run_tesseract(block_imgs, tmp, 6)
            result[rel] = {
                "width": im.width, "height": im.height,
                "lines": [{"x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1], "text": " ".join(t.split())}
                          for r, t in zip(rects, line_txt)],
                "blocks": [{"x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1],
                            "lines": [" ".join(l.split()) for l in t.splitlines() if l.strip()]}
                           for r, t in zip(blocks, block_txt)],
            }
            if n % 20 == 0 or n == len(todo):
                out_path.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
                rate = (time.time() - t0) / n
                print(f"  {n}/{len(todo)}  {rate:.2f}s/card  eta {rate * (len(todo) - n) / 60:.1f} min", flush=True)
            if "--only" in sys.argv:
                print(f"\n== {rel}")
                for l in result[rel]["lines"]:
                    print(f"   line y={l['y']:3d} h={l['h']:2d} {l['text']}")
                for b in result[rel]["blocks"]:
                    print(f"   block y={b['y']:3d}-{b['y'] + b['h']:3d}: " + " / ".join(b["lines"]))
    out_path.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"done -> {out_path}", flush=True)


if __name__ == "__main__":
    main()
