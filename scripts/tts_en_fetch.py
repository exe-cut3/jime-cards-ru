"""
Download the card sheets of the English TTS workshop mod "Lord of the Rings: Journeys in Middle
Earth (ALL CURRENT EXPANSIONS)" (id 2166579047) and cut them into single cards. These scans are
much better than the ones on the Google Site (642x1000 px, full colour instead of 330x510 px
with a 256-colour palette), so they replace the English card images on the site.

Input : data/raw/tts_en/mod_2166579047.bin     the workshop save (BSON), see below
Output: data/raw/tts_en/sheets/<key>[-back].img sprite sheets
        data/raw/tts_en/cards/<key>-<idx>.png    single cards (+ -back.png for unique backs)
        data/raw/tts_en/cards.json               one record per card object: nickname, deck, file

Getting the save (public Steam API, no key):
  curl -X POST https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/ \
       -d "itemcount=1&publishedfileids[0]=2166579047"      -> response...file_url
  curl -L <file_url> -o data/raw/tts_en/mod_2166579047.bin

Run:  uv run --with pillow --with pymongo python scripts/tts_en_fetch.py
Polite: 1 s between downloads; existing files are kept.
"""
import json
import subprocess
import time
from pathlib import Path

import bson
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
TTS = ROOT / "data" / "raw" / "tts_en"
SAVE = TTS / "mod_2166579047.bin"
SHEETS = TTS / "sheets"
CARDS = TTS / "cards"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36"


def fetch(url: str, out: Path) -> str:
    if out.exists() and out.stat().st_size > 0:
        return "cached"
    r = subprocess.run(["curl", "-s", "-L", "-A", UA, url, "-o", str(out), "-w", "%{http_code}"], capture_output=True, text=True)
    time.sleep(1)
    return r.stdout.strip()


def collect(doc):
    """All card objects with the deck they sit in, and every CustomDeck sheet definition."""
    objs, sheets = [], {}

    def walk(o, deck=None):
        if isinstance(o, dict):
            for k, v in (o.get("CustomDeck") or {}).items():
                sheets[str(k)] = v
            name = o.get("Name")
            if name in ("Card", "CardCustom"):
                objs.append({"nickname": o.get("Nickname") or "", "card_id": int(o.get("CardID", 0)), "deck": deck, "guid": o.get("GUID")})
            sub = (o.get("Nickname") or name) if name in ("Deck", "DeckCustom", "Bag", "Custom_Model_Bag", "Infinite_Bag") else deck
            for v in o.values():
                walk(v, sub)
        elif isinstance(o, list):
            for x in o:
                walk(x, deck)

    walk(doc)
    return objs, sheets


def upright(card: Image.Image) -> Image.Image:
    """Hero boards are stored turned 90° clockwise (1000x1714): turn them back to landscape."""
    w, h = card.size
    return card.rotate(90, expand=True) if h > w * 1.65 else card


def cut(sheet_img: Image.Image, nw: int, nh: int, idx: int) -> Image.Image:
    w, h = sheet_img.size
    cw, ch = w // nw, h // nh
    x, y = idx % nw, idx // nw
    return upright(sheet_img.crop((x * cw, y * ch, (x + 1) * cw, (y + 1) * ch)))


def main() -> None:
    SHEETS.mkdir(parents=True, exist_ok=True)
    CARDS.mkdir(parents=True, exist_ok=True)
    doc = bson.decode_all(SAVE.read_bytes())[0]
    objs, sheets = collect(doc)
    print(f"{len(objs)} card objects on {len(sheets)} sheets")

    used = sorted({str(o["card_id"] // 100) for o in objs}, key=int)
    for key in used:
        s = sheets[key]
        print("sheet", key, "face", fetch(s["FaceURL"], SHEETS / f"{key}.img"))
        if s.get("UniqueBack") or (int(s.get("NumWidth", 1)) == 1 and int(s.get("NumHeight", 1)) == 1):
            print("sheet", key, "back", fetch(s["BackURL"], SHEETS / f"{key}-back.img"))

    records, done = [], set()
    opened = {}
    for o in objs:
        key, idx = str(o["card_id"] // 100), o["card_id"] % 100
        s = sheets[key]
        nw, nh = int(s.get("NumWidth", 1)), int(s.get("NumHeight", 1))
        face = CARDS / f"{key}-{idx:02d}.png"
        back = CARDS / f"{key}-{idx:02d}-back.png"
        rec = {**o, "sheet": key, "index": idx, "file": f"tts_en/cards/{face.name}"}
        if (key, idx) not in done:
            done.add((key, idx))
            if key not in opened:
                opened.clear()  # keep at most one big sheet in memory
                opened[key] = Image.open(SHEETS / f"{key}.img").convert("RGB")
            if not face.exists():
                cut(opened[key], nw, nh, idx).save(face)
            bpath = SHEETS / f"{key}-back.img"
            if bpath.exists() and not back.exists():
                bimg = Image.open(bpath).convert("RGB")
                # a unique back sheet has the same grid; a single back image is shared
                (cut(bimg, nw, nh, idx) if s.get("UniqueBack") else upright(bimg)).save(back)
        if back.exists():
            rec["back_file"] = f"tts_en/cards/{back.name}"
        records.append(rec)
    (TTS / "cards.json").write_text(json.dumps({"sheets": {k: {kk: sheets[k].get(kk) for kk in ("NumWidth", "NumHeight", "UniqueBack")} for k in used}, "cards": records}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(done)} distinct cards cut into {CARDS}")


if __name__ == "__main__":
    main()
