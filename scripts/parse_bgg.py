"""
Parse data/raw/bgg.xlsx ("Character, Equipment, and Skill Cards Spreadsheet V1.10"
by Birdman137, BGG fileid 434775) into data/bgg.json.

Text is kept verbatim (including the author's typos); only structure is normalised.
Custom (fan-made) content is kept in a separate "custom" bucket and never merged.
"""
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "bgg.xlsx"
FIXES = ROOT / "data" / "bgg_fixes.json"
OUT = ROOT / "data" / "bgg.json"

COLLECTIONS = {
    "base": ("core", "Core Set"),
    "sp": ("sp", "Shadowed Paths"),
    "sw": ("sw", "Spreading War"),
    "did": ("did", "Dwellers in Darkness"),
    "voe": ("voe", "Villains of Eriador"),
    "sotw": ("sotw", "Scourges of the Wastes"),
    "custom": ("custom", "Custom (fan-made)"),
}
STATS = ["Might", "Wisdom", "Agility", "Spirit", "Wit"]


def s(v):
    """Cell -> stripped string; '' for None or '-'."""
    if v is None:
        return ""
    v = str(v).strip()
    return "" if v == "-" else v


def num(v):
    v = s(v)
    if v == "":
        return None
    try:
        return int(float(v))
    except ValueError:
        return v


def collection(v):
    key = s(v).lower()
    if key not in COLLECTIONS:
        raise ValueError(f"unknown collection {v!r}")
    return COLLECTIONS[key][0]


def split_list(v, sep=","):
    return [x.strip() for x in s(v).split(sep) if x.strip()]


def rows(ws):
    hdr = None
    for row in ws.iter_rows(values_only=True):
        if hdr is None:
            hdr = [str(h).strip() if h is not None else None for h in row]
            continue
        if all(c is None for c in row):
            continue
        yield {h: c for h, c in zip(hdr, row) if h}


def parse_icon(v):
    """'1 Success / 1 Fate' -> {'success': 1, 'fate': 1}; '' -> {}"""
    out = {}
    for part in re.split(r"[\n,]+", s(v)):
        m = re.match(r"\s*(\d+)\s*(success|fate|fear)", part, flags=re.I)
        if m:
            key = m.group(2).lower()
            out[key] = out.get(key, 0) + int(m.group(1))
        elif part.strip():
            out.setdefault("unparsed", []).append(part.strip())
    return out


def parse_test(v):
    """'Might/Wit' -> stats ['Might','Wit']; 'Might\\nCreature' -> stats + traits."""
    stats, traits = [], []
    for tok in re.split(r"[/\n]+", s(v)):
        tok = tok.strip()
        if not tok:
            continue
        (stats if tok in STATS else traits).append(tok)
    return stats, traits


def apply_fixes(out):
    """Apply data/bgg_fixes.json: explicit, documented corrections of the sheet."""
    if not FIXES.exists():
        return
    fixes = json.loads(FIXES.read_text(encoding="utf-8"))["fixes"]
    for fix in fixes:
        bucket = fix["bucket"]
        pool = out[bucket] + out["custom"].get(bucket, [])
        hits = [r for r in pool if all(r.get(k) == v for k, v in fix["match"].items())]
        if len(hits) != 1:
            raise SystemExit(f"fix {fix['match']} matched {len(hits)} records, expected 1")
        rec = hits[0]
        rec.update(fix["set"])
        rec.setdefault("fixes", []).append(fix["reason"])
        # a collection change can move a record between the official and custom buckets
        if "collection" in fix["set"]:
            for lst in (out[bucket], out["custom"].get(bucket, [])):
                if rec in lst:
                    lst.remove(rec)
            (out["custom"][bucket] if rec["collection"] == "custom" else out[bucket]).append(rec)
    print(f"applied {len(fixes)} fixes from {FIXES.name}")


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    out = {
        "source": {"file": SRC.name, "title": "Character, Equipment, and Skill Cards Spreadsheet V1.10",
                   "author": "Birdman137", "bgg_fileid": 434775},
        "collections": {code: name for code, name in COLLECTIONS.values()},
        "heroes": [], "items": [], "skills": [], "damage_fear": [], "conditions": [],
        "terrain": [], "space_traits": [], "modifiers": [], "keywords": [],
        "custom": {"heroes": [], "skills": []},
    }

    # ---- Characters
    for r in rows(wb["Characters"]):
        rec = {
            "collection": collection(r["Collection"]),
            "name": s(r["Character"]),
            "race": s(r["Race"]),
            "suggested_role": s(r["Suggested Role"]),
            "stats": {st.lower(): num(r[st]) for st in STATS},
            "inspiration": num(r["Inspiration"]),
            "fear": num(r["Fear"]),
            "damage": num(r["Damage"]),
            "ability": s(r["Ability"]),
            "starting_gear": split_list(r["Suggested Starting Gear"]),
        }
        (out["custom"]["heroes"] if rec["collection"] == "custom" else out["heroes"]).append(rec)

    # ---- Equipment
    for r in rows(wb["Equipment"]):
        stats, traits = parse_test(r["Test/Trait"])
        out["items"].append({
            "collection": collection(r["Collection"]),
            "count": num(r["Count"]),
            "type": s(r["Type"]),            # Weapon / Support / Trinket / Armor / Mount
            "family": s(r["Item"]),          # upgrade line, e.g. "Battle Axe"
            "name": s(r["Name"]),
            "tier": s(r["Tier"]),            # I..IV or ''
            "test": stats,
            "traits": traits,
            "number": num(r["Upgrade"]),     # number printed on the card
            "hands_or_tokens": num(r["Handed/Depletion Tokens"]),
            "ranged": s(r["Ranged"]) != "",
            "text": s(r["Abilities & Type"]),
        })

    # ---- Skill Cards
    breakdown_cols = {
        "Ability Breakdown:\nLimit": "limit",
        "Ability Breakdown:\nTiming/trigger": "timing",
        "Ability Breakdown:\nAdditional Clause": "clause",
        "Ability Breakdown:\nCost": "cost",
        "Ability Breakdown:\nEffect": "effect",
    }
    keyword_cols = ["Strike", "Sprint", "Hide", "Guard", "Rest", "Scout"]
    for r in rows(wb["Skill Cards"]):
        rec = {
            "collection": collection(r["Collection"]),
            "count": num(r["Count"]),
            "type": s(r["Type"]),            # Hero / Role / Basic / Title / Weakness
            "owner": s(r["Hero/Role"]),      # hero or role name; 'Basic'/'Title'/'Weakness'
            "xp": num(r["XP"]),
            "name": s(r["Name"]),
            "number": num(r["Number"]),
            "traits": split_list(r["Trait"]),
            "icon": parse_icon(r["Icon"]),
            "rating": s(r["Reshyk Rating"]),
            "text": s(r["Ability"]),
            "keywords": {k.lower(): num(r[k]) for k in keyword_cols if s(r.get(k)) != ""},
            "breakdown": {v: s(r.get(k)) for k, v in breakdown_cols.items() if s(r.get(k)) != ""},
        }
        (out["custom"]["skills"] if rec["collection"] == "custom" else out["skills"]).append(rec)

    # ---- DamageFear
    for r in rows(wb["DamageFear"]):
        text = s(r["Description"])
        m = re.search(r"\((\d+) copies\)", text)
        out["damage_fear"].append({
            "kind": s(r["Damage/Fear"]).lower(),
            "name": s(r["Name"]),
            "text": re.sub(r"\s*\(\d+ copies\)", "", text).strip(),
            "copies": int(m.group(1)) if m else 1,
        })

    # ---- BoonsBanes (two blocks in one sheet)
    kind = "boon"
    for r in rows(wb["BoonsBanes"]):
        name, text = s(r["Boons"]), s(r["Description"])
        if name == "Banes" and text == "Description":
            kind = "bane"
            continue
        side = None
        m = re.match(r"(.*?)\s*\((Front|Back)\)\s*$", name, flags=re.S)
        if m:
            name, side = m.group(1).strip(), m.group(2).lower()
        out["conditions"].append({"kind": kind, "name": name, "side": side, "text": text})

    # ---- Terrain / space traits (two blocks)
    block = "terrain"
    for r in rows(wb["TerrainSpace Trait"]):
        if s(r["Terrain"]) == "Space Trait":
            block = "space_traits"
            continue
        out[block].append({
            "collections": [collection(c) for c in split_list(r["Collection"])],
            "name": s(r["Terrain"]),
            "text": s(r["Description"]),
        })

    # ---- Modifiers / keywords (two blocks)
    block = "modifiers"
    for r in rows(wb["Modifiers - Keywords"]):
        name, text = s(r["Modifiers"]), s(r["Description"])
        if name == "Keywords" and text == "Description":
            block = "keywords"
            continue
        out[block].append({"name": name, "text": text})

    apply_fixes(out)

    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    for k in ["heroes", "items", "skills", "damage_fear", "conditions", "terrain",
              "space_traits", "modifiers", "keywords"]:
        print(f"{k:13s} {len(out[k])}")
    print(f"custom        heroes={len(out['custom']['heroes'])} skills={len(out['custom']['skills'])}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
