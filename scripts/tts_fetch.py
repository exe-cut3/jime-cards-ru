"""
Download the card sheets of the Russian TTS workshop mod (id 3353638862 — scans of the
Hobby World edition) and cut them into single cards.

Input : data/raw/tts/mod_3353638862.decoded.json   (BSON save decoded to JSON)
Output: data/raw/tts/sheets/<sheet>.png             sprite sheets (face; back when unique)
        data/raw/tts/cards/<sheet>-<idx>.png        single cards
        data/raw/tts/cards.json                     one record per card object in the mod:
                                                     nickname (RU name), deck, sheet, index, file

Run:  uv run --with pillow python scripts/tts_fetch.py [--no-download]
Polite: 1 s between downloads; existing files are kept.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TTS = ROOT / "data" / "raw" / "tts"
SAVE = TTS / "mod_3353638862.decoded.json"
SHEETS = TTS / "sheets"
CARDS = TTS / "cards"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36"


def fetch(url, out):
    if out.exists() and out.stat().st_size > 0:
        return "cached"
    r = subprocess.run(["curl", "-s", "-L", "-A", UA, url, "-o", str(out), "-w", "%{http_code}"],
                       capture_output=True, text=True)
    time.sleep(1)
    return r.stdout.strip()


def main():
    save = json.loads(SAVE.read_text(encoding="utf-8"))
    SHEETS.mkdir(parents=True, exist_ok=True)
    CARDS.mkdir(parents=True, exist_ok=True)
    sheets = {}   # sheet id -> CustomDeck entry
    cards = []    # card objects

    def walk(objs, path):
        for o in objs:
            name = o.get("Name")
            nick = (o.get("Nickname") or "").strip()
            here = path + "/" + (nick or name or "")
            for k, v in (o.get("CustomDeck") or {}).items():
                sheets.setdefault(k, v)
            if name in ("Card", "CardCustom"):
                cid = o.get("CardID")
                if cid is not None:
                    cards.append({"nickname": nick, "deck": path.strip("/") or "(table)",
                                  "sheet": str(cid // 100), "index": cid % 100, "guid": o.get("GUID"),
                                  "description": (o.get("Description") or "").strip()})
            if name in ("Deck", "DeckCustom"):
                walk(o.get("ContainedObjects", []), here)
            elif o.get("ContainedObjects"):
                walk(o["ContainedObjects"], here)
            if o.get("States"):
                walk(list(o["States"].values()), here + "[state]")

    walk(save["ObjectStates"], "")
    print(f"{len(sheets)} sheets, {len(cards)} card objects", flush=True)
    # decks whose shared back is itself a card face (double-sided cards: Неволя / Побег!)
    two_sided = {c["sheet"] for c in cards if c["deck"].split("/")[-1] in ("Неволя",)}

    if "--no-download" not in sys.argv:
        for sid, s in sheets.items():
            st = fetch(s["FaceURL"], SHEETS / f"{sid}.png")
            print(f"  sheet {sid} face {st}", flush=True)
            # backs are only meaningful per card when unique, when the "sheet" is a single card,
            # or when the deck is double-sided
            if s.get("UniqueBack") or (s.get("NumWidth") == 1 and s.get("NumHeight") == 1) or sid in two_sided:
                st = fetch(s["BackURL"], SHEETS / f"{sid}-back.png")
                print(f"  sheet {sid} back {st}", flush=True)

    # cut cards
    opened = {}
    for c in cards:
        sid = c["sheet"]
        s = sheets.get(sid)
        if s is None or not (SHEETS / f"{sid}.png").exists():
            c["file"] = None
            continue
        out = CARDS / f"{sid}-{c['index']:02d}.png"
        back_out = CARDS / f"{sid}-{c['index']:02d}-back.png"
        nw, nh = s["NumWidth"], s["NumHeight"]
        col, row = c["index"] % nw, c["index"] // nw
        if not out.exists():
            im = opened.get(sid)
            if im is None:
                im = opened[sid] = Image.open(SHEETS / f"{sid}.png").convert("RGB")
            cw, ch = im.width // nw, im.height // nh
            im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)).save(out)
        if not back_out.exists() and (SHEETS / f"{sid}-back.png").exists():
            back = Image.open(SHEETS / f"{sid}-back.png").convert("RGB")
            bw, bh = back.width // nw, back.height // nh
            back.crop((col * bw, row * bh, (col + 1) * bw, (row + 1) * bh)).save(back_out)
        c["file"] = out.relative_to(TTS).as_posix()
        c["back_file"] = back_out.relative_to(TTS).as_posix() if back_out.exists() else None
    (TTS / "cards.json").write_text(json.dumps({"sheets": sheets, "cards": cards}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"done: {sum(1 for c in cards if c['file'])} card images -> {CARDS}", flush=True)


if __name__ == "__main__":
    main()
