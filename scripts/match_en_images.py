"""
Match every card of data/cards.json to its scan in the English TTS mod (scripts/tts_en_fetch.py).

Many mod cards have no nickname (damage, fear, weakness decks) and some names carry typos, so the
match is made on the pictures: the card's current English scan (Google Site) and every mod card are
reduced to small blurred grey-level thumbnails and compared by correlation. A matching nickname is
used as a tie-breaker. Hero boards are compared only with landscape cards.

Output: data/en_images.json   {card id: {front, back?, score, margin, nickname}}
        data/en_images_report.md  low-confidence matches to check by eye

Run:  uv run --with pillow --with numpy python scripts/match_en_images.py
"""
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "en_images.json"
REPORT = ROOT / "data" / "en_images_report.md"
SIZE_P = (32, 50)  # portrait thumbnail
SIZE_L = (50, 30)  # landscape (hero boards)


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def vec(path: Path, landscape: bool) -> np.ndarray:
    im = Image.open(path).convert("L")
    w, h = im.size
    # trim a thin border: Google scans show the card edge and some background
    im = im.crop((int(w * 0.04), int(h * 0.03), int(w * 0.96), int(h * 0.97)))
    im = ImageOps.equalize(im).filter(ImageFilter.GaussianBlur(2))
    a = np.asarray(im.resize(SIZE_L if landscape else SIZE_P, Image.LANCZOS), dtype=float).ravel()
    a -= a.mean()
    n = np.linalg.norm(a)
    return a / n if n else a


def main() -> None:
    db = json.loads((ROOT / "data" / "cards.json").read_text(encoding="utf-8"))
    mod = json.loads((RAW / "tts_en" / "cards.json").read_text(encoding="utf-8"))["cards"]

    # one entry per distinct mod picture, with every nickname it carries
    pics: dict[str, dict] = {}
    for r in mod:
        p = pics.setdefault(r["file"], {"file": r["file"], "back": r.get("back_file"), "nicks": set()})
        if r["nickname"]:
            p["nicks"].add(norm(r["nickname"]))
    # pictures without a nickname: their OCR'd title lines stand in (scripts/ocr_en_names.py)
    ocr_path = RAW / "tts_en" / "ocr_names.json"
    ocr = json.loads(ocr_path.read_text(encoding="utf-8")) if ocr_path.exists() else {}
    for f, p in pics.items():
        if not p["nicks"]:
            p["nicks"] = {norm(t) for t in ocr.get(f, []) if 2 < len(t) <= 40}
    files = list(pics)
    land = {}
    for f in files:
        w, h = Image.open(RAW / f).size
        land[f] = w > h
    vecs = {f: vec(RAW / f, land[f]) for f in files}

    result, low = {}, []
    for c in db["cards"]:
        src = c["image"].get("front")
        if not src:
            continue
        is_land = c["kind"] == "hero"
        v = vec(RAW / src, is_land)
        cands = [f for f in files if land[f] == is_land]
        sims = sorted(((float(v @ vecs[f]), f) for f in cands), reverse=True)
        name = norm(c["name_en"])

        def name_sim(f: str) -> float:
            return max((SequenceMatcher(None, name, n).ratio() for n in pics[f]["nicks"]), default=0.0)

        # 1) the name decides (upgrade lines share one artwork, so pictures alone cannot tell
        #    "Evendim Ring Mail" from "Twice-Wrought Ring Mail"); typos in the mod are tolerated
        named = [(name_sim(f), s, f) for s, f in sims[:60] if name_sim(f) >= 0.85]
        if named:
            ns, best_s, best = max(named)
            how = "name"
        else:
            # 2) no name found at all: a clear picture match only
            best_s, best = sims[0]
            ns, how = 0.0, "picture"
        second = next((s for s, f in sims if f != best and not (pics[f]["nicks"] & pics[best]["nicks"] and pics[f]["nicks"])), 0.0)
        margin = best_s - second
        confident = (how == "name" and best_s >= 0.6) or (how == "picture" and best_s >= 0.72 and margin >= 0.1)
        rec = {"front": best, "score": round(best_s, 3), "margin": round(margin, 3), "by": how,
               "nickname": sorted(pics[best]["nicks"])[0] if pics[best]["nicks"] else ""}
        if c["kind"] == "hero" and pics[best]["back"]:
            rec["back"] = pics[best]["back"]
        if confident:
            result[c["id"]] = rec
        else:
            low.append((c["id"], c["name_en"], rec))

    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    lines = ["# English scans from the TTS mod", "", f"{len(result)} cards take the mod scan; {len(low)} keep the Google Site scan (no confident match):", ""]
    for cid, name, r in low:
        lines.append(f"- `{cid}` {name}: {r['front']} score {r['score']} margin {r['margin']} nick “{r['nickname']}”")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    scores = sorted(r["score"] for r in result.values())
    print(f"matched {len(result)}; kept old {len(low)}; score min {scores[0]} median {scores[len(scores)//2]}")


if __name__ == "__main__":
    main()
