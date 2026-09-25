"""
Export proof-reading batches: for every card with an OCR'd Russian text, one line with the
English text (from the BGG sheet) and the raw Russian OCR, so the Russian can be corrected
against the English original and the glossary.

Output: data/raw/proofread/batch_NN.md   (N cards per batch)
Fixes go to data/translations_fixes.json  { "<card id>": {"text_ru": "...", ...}, ... }
and are applied by scripts/build_translations.py.

Run:  python scripts/export_proofread.py [--size 50]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TR = ROOT / "data" / "translations.json"
CARDS = ROOT / "data" / "cards.json"
FIXES = ROOT / "data" / "translations_fixes.json"
OUT = ROOT / "data" / "raw" / "proofread"


def main():
    size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 50
    tr = json.loads(TR.read_text(encoding="utf-8"))["cards"]
    en = {c["id"]: c for c in json.loads(CARDS.read_text(encoding="utf-8"))["cards"]}
    fixes = json.loads(FIXES.read_text(encoding="utf-8")) if FIXES.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("batch_*.md"):
        f.unlink()
    items = []
    for cid, t in tr.items():
        if cid in fixes or t.get("verified"):
            continue
        c = en.get(cid)
        if not c:
            continue
        ocr = t.get("text_ru_ocr") or t.get("text_ru") or ""
        bg = t.get("background_ru_ocr") or t.get("background_ru") or ""
        if not ocr and not bg:
            continue
        items.append((cid, c, t, ocr, bg))
    for b in range(0, len(items), size):
        lines = [f"# batch {b // size + 1}: cards {b + 1}-{min(b + size, len(items))} of {len(items)}", ""]
        for cid, c, t, ocr, bg in items[b:b + size]:
            lines.append(f"## {cid}")
            lines.append(f"EN name: {c['name_en']}" + (f" | traits: {', '.join(c['traits'])}" if c.get("traits") else ""))
            lines.append(f"RU name: {t.get('name_ru')}" + (f" | traits_ru: {t['traits_ru']}" if t.get("traits_ru") else ""))
            if c.get("text_en"):
                lines.append("EN: " + c["text_en"].replace("\n", " ⏎ "))
            if ocr:
                lines.append("RU-OCR: " + ocr.replace("\n", " ⏎ "))
            if bg:
                lines.append("EN-BG: " + (c.get("background_en") or "").replace("\n", " ⏎ "))
                lines.append("RU-BG-OCR: " + bg.replace("\n", " ⏎ "))
            lines.append("")
        (OUT / f"batch_{b // size + 1:02d}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(items)} cards -> {(len(items) + size - 1) // size} batches in {OUT}")


if __name__ == "__main__":
    main()
