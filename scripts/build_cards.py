"""
Merge the site scans (data/raw/manifest.json + data/raw/ocr.json) with the BGG
spreadsheet data (data/bgg.json) into data/cards.json — one record per card.

Matching rules
  * hero pages:  930x545 scans are hero cards (front / back detected by the word
                 BACKGROUND); 330x510 scans are that hero's skills (footer "Beorn 1");
                 320x495 scans are the hero's own items (Snowbright, Hoary Coat ...).
  * role / basic / title pages: page index == printed number, verified by the
                 OCR footer ("Burglar 3", "Title 12").
  * weaknesses, items, terrain, damage, fear, conditions: OCR name -> best fuzzy
                 match among the spreadsheet names of that section.
Nothing is invented: every field missing from both sources is listed in "todo".

Run:  python scripts/build_cards.py
"""
import difflib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "manifest.json"
OCR = RAW / "ocr.json"
BGG = ROOT / "data" / "bgg.json"
OUT = ROOT / "data" / "cards.json"
REPORT = ROOT / "data" / "build_report.md"

STATS = ["Might", "Wisdom", "Agility", "Spirit", "Wit"]
SECTION_TYPE = {"armors": "Armor", "hands": ("Weapon", "Support"), "trinkets": "Trinket", "mounts": "Mount"}
ESCAPE_ORDER = ["Might", "Wisdom", "Agility", "Spirit", "Wit"]  # order of the 5 "Escape!" rows in the sheet


# ----------------------------------------------------------------------------- helpers
def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def norm(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def similarity(a, b):
    """Max of plain and token-sorted ratio, so 'Hunting Great Bow' ~ 'Great Hunting Bow'."""
    na, nb = norm(a), norm(b)
    plain = difflib.SequenceMatcher(None, na, nb).ratio()
    sa, sb = " ".join(sorted(na.split())), " ".join(sorted(nb.split()))
    return max(plain, difflib.SequenceMatcher(None, sa, sb).ratio())


NOISE = re.compile(r"(tm\s*lic|szc|ffg)", re.I)


def ocr_lines(ocr, rel):
    return [l for l in ocr.get(rel, {}).get("lines", []) if not NOISE.search(l["text"])]


def best_name_match(lines, candidates, min_score=0.6):
    """Best (candidate, ocr_text, score) over all OCR lines x candidate names."""
    best = (None, None, 0.0)
    for l in lines:
        if len(norm(l["text"])) < 3:
            continue
        for c in candidates:
            sc = similarity(l["text"], c)
            if sc > best[2]:
                best = (c, l["text"], sc)
    return best if best[2] >= min_score else (None, best[1], best[2])


def footer(lines, height):
    """'Burglar 3' / 'Title 12' style footer -> (owner, number).

    OCR often reads 1 as I / l / | and 0 as O in this small serif font ("Shieldmaiden I 1"),
    so the digit part is repaired before parsing.
    """
    for l in lines:
        if l["y"] < height * 0.9:
            continue
        m = re.match(r"^\s*(.*?[A-Za-z'\-])\s*([0-9Il|O ]{1,4})\s*$", l["text"])
        if m:
            digits = m.group(2).translate(str.maketrans("Il|O", "1110")).replace(" ", "")
            if digits.isdigit() and 1 <= int(digits) <= 40:
                return m.group(1).strip(), int(digits)
    return None, None


def add_or_alternate(cards, rec, report):
    """Append rec, or — when a card with the same id already exists — keep the new scan
    as an alternate image of the existing record (the site sometimes has two scans of one card)."""
    for existing in cards:
        if existing["id"] == rec["id"] and rec.get("image", {}).get("front"):
            existing["image"].setdefault("alternates", []).append(rec["image"]["front"])
            report["notes"].append(f"{rec['image']['front']}: second scan of {rec['id']} kept as alternate")
            return
    cards.append(rec)


def todo_fields(rec, fields):
    return [f for f in fields if rec.get(f) in (None, "", [], {})]


def ocr_background(lines):
    """Flavour text from the back of a hero card: everything between the BACKGROUND /
    ALTERNATE FORM header and SUGGESTED START / MANDATED EQUIPMENT, joined into paragraphs."""
    body, started = [], False
    for l in lines:
        t = l["text"].strip()
        up = t.upper().replace(" ", "")
        if max(similarity(up, "BACKGROUND"), similarity(up, "ALTERNATEFORM")) >= 0.8 and len(up) < 16:
            started = True
            continue
        if up.startswith(("SUGGESTEDSTART", "MANDATEDEQUIPMENT", "MANDATEDEOUIPMENT")):
            break
        if started and l["h"] >= 18:
            body.append(t)
    return " ".join(body) if body else None


def lookup_skill(skills_by_owner_num, owner_key, number, lines, im, report):
    """Sheet skill for (owner, printed number). If the OCR'd card name clearly belongs to a
    different number of the same owner, the card wins (the sheet has a few swapped numbers)."""
    s = skills_by_owner_num.get((owner_key, number))
    if not lines:
        return s
    def name_score(rec):
        return max((similarity(l["text"], rec["name"]) for l in lines), default=0)
    if s is not None and name_score(s) >= 0.6:
        return s
    siblings = [r for (o, n), r in skills_by_owner_num.items() if o == owner_key]
    alt = max(siblings, key=name_score, default=None)
    if alt is not None and name_score(alt) >= 0.8 and alt is not s:
        report["notes"].append(
            f"{im['file']}: card footer says {owner_key} {number} and card name is '{alt['name']}', "
            f"but the sheet lists '{alt['name']}' as number {alt['number']}"
            + (f" and '{s['name']}' as {number}" if s else "") + " -> card wins")
        alt = dict(alt, number=number, _sheet_number=alt["number"])
        return alt
    return s


def resolve_number(im, k, number, offset, owner, report):
    """Printed number of the k-th skill scan on a page.

    The footer is authoritative when readable. Otherwise the page order is used, shifted by
    the offset seen on the previous scans (a duplicate scan on the page shifts everything
    after it by one). Returns (number, new_offset).
    """
    if number is None:
        number = k + offset
        report["fuzzy"].append((im["file"], f"footer unreadable; number by page order -> {number}", 0))
        return number, offset
    if number != k + offset:
        report["order_mismatch"].append((im["file"], f"page index {k} but footer says {owner} {number}"))
        offset = number - k
    return number, offset


# ----------------------------------------------------------------------------- main
def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ocr = json.loads(OCR.read_text(encoding="utf-8")) if OCR.exists() else {}
    bgg = json.loads(BGG.read_text(encoding="utf-8"))

    scans = [im for im in manifest["images"] if im.get("file")]
    by_page = defaultdict(list)
    for im in scans:
        by_page[(im["section"], im["subsection"])].append(im)

    cards = []
    report = {"unmatched_scans": [], "fuzzy": [], "order_mismatch": [], "no_scan": [],
              "ambiguous": [], "notes": []}
    used_scans = set()

    # --- lookup tables from the spreadsheet
    heroes_by_slug = {slug(h["name"]): h for h in bgg["heroes"]}
    skills_by_owner_num = {(slug(s["owner"]), s["number"]): s for s in bgg["skills"] if s["number"]}
    custom_skills_by_owner_num = {(slug(s["owner"]), s["number"]): s for s in bgg["custom"]["skills"] if s["number"]}
    weaknesses = [s for s in bgg["skills"] if s["type"] == "Weakness"]
    items = bgg["items"]
    items_by_name = defaultdict(list)
    for it in items:
        items_by_name[norm(it["name"])].append(it)
    item_claimed = set()  # id(item) already assigned to a scan
    terrain = bgg["terrain"]
    damage_fear = bgg["damage_fear"]
    conditions = bgg["conditions"]

    def take_scan(im):
        used_scans.add(im["file"])
        return im["file"]

    # ------------------------------------------------------------------ heroes
    def hero_for(page_or_owner):
        """'calaminth' / 'Calaminth' -> the spreadsheet hero 'Calaminth Took'."""
        key = slug(page_or_owner or "")
        return next((h for h in bgg["heroes"] if slug(h["name"]).startswith(key)), None) if key else None

    for (section, sub), ims in sorted(by_page.items()):
        if section != "heroes":
            continue
        page_hero = hero_for(sub)
        page_owner_key = slug(page_hero["name"]) if page_hero else sub
        # 1) hero cards (large scans): group by OCR'd name; front/back by "BACKGROUND"
        large = [im for im in ims if im["width"] > 600]
        small = [im for im in ims if im["width"] <= 600]
        hero_names = [h["name"] for h in bgg["heroes"]]
        hero_sides = defaultdict(dict)
        for im in large:
            lines = ocr_lines(ocr, im["file"])
            top = [l for l in lines if l["y"] < im["height"] * 0.15]
            name, txt, sc = best_name_match(top or lines, hero_names)
            # the front lists the five stats; the back has BACKGROUND / ALTERNATE FORM text
            stat_hits = sum(any(st.lower() == norm(l["text"]) for l in lines) for st in STATS)
            side = "front" if stat_hits >= 3 else "back"
            if name is None:
                # page-level fallback: the page slug is the hero
                name = next((n for n in hero_names if slug(n).startswith(sub)), None)
                report["fuzzy"].append((im["file"], f"hero name by page slug -> {name}", round(sc, 2)))
            elif sc < 0.9:
                report["fuzzy"].append((im["file"], f"{txt!r} -> {name}", round(sc, 2)))
            if name and side in hero_sides[name]:
                report["notes"].append(f"{im['file']}: second {side} for {name}")
            hero_sides[name][side] = take_scan(im)
        for name, sides in hero_sides.items():
            h = heroes_by_slug.get(slug(name))
            background = ocr_background(ocr_lines(ocr, sides["back"])) if sides.get("back") else None
            rec = {
                "id": f"hero-{slug(name)}",
                "kind": "hero",
                "name_en": name,
                "name_ru": None,
                "race": h["race"] if h else None,
                "stats": h["stats"] if h else None,
                "inspiration": h["inspiration"] if h else None,
                "fear": h["fear"] if h else None,
                "damage": h["damage"] if h else None,
                "text_en": h["ability"] if h else None,
                "text_ru": None,
                "suggested_role": h["suggested_role"] if h else None,
                "starting_gear": h["starting_gear"] if h else None,
                "background_en": background,   # not in the spreadsheet: OCR of the back, to be proof-read
                "background_source": "ocr" if background else None,
                "expansion": h["collection"] if h else None,
                "page": sub,
                "image": {"front": sides.get("front"), "back": sides.get("back")},
            }
            rec["todo"] = todo_fields(rec, ["name_ru", "text_ru", "background_en", "stats", "text_en"])
            if background:
                rec["todo"].append("proofread_background_ocr")
            if not sides.get("front") or not sides.get("back"):
                rec["todo"].append("missing_side")
            cards.append(rec)

        # 2) small scans: the hero's skills (footer "Beorn 1") or the hero's own items
        #    (mount, Great Bear gear) — the site scales both to the same size, so decide by OCR.
        item_names = sorted({it["name"] for it in items})
        k, offset = 0, 0
        for im in small:
            lines = ocr_lines(ocr, im["file"])
            owner, number = footer(lines, im["height"])
            iname, itxt, isc = best_name_match(lines, item_names, min_score=0.9)
            if number is None and iname is not None:
                cards.append(item_record(im, items, item_claimed, ocr, report, take_scan, page=sub))
                continue
            k += 1
            owner_key = slug(hero_for(owner)["name"]) if owner and hero_for(owner) else page_owner_key
            number, offset = resolve_number(im, k, number, offset, owner, report)
            s = lookup_skill(skills_by_owner_num, owner_key, number, lines, im, report)
            add_or_alternate(cards, skill_record(s, owner_key, number, take_scan(im), im, lines, report), report)

    # ------------------------------------------------------------------ roles / basic / titles
    for (section, sub), ims in sorted(by_page.items()):
        if not (section == "roles" or (section == "common-cards" and sub in ("basic", "titles"))):
            continue
        owner_slug = {"basic": "basic", "titles": "title"}.get(sub, sub)
        item_names = sorted({it["name"] for it in items})
        k, offset = 0, 0
        for im in ims:
            lines = ocr_lines(ocr, im["file"])
            owner, number = footer(lines, im["height"])
            iname, itxt, isc = best_name_match(lines, item_names, min_score=0.9)
            if number is None and iname is not None:   # a role's item scanned on the role page
                cards.append(item_record(im, items, item_claimed, ocr, report, take_scan, page=sub))
                continue
            k += 1
            number, offset = resolve_number(im, k, number, offset, owner, report)
            s = lookup_skill(skills_by_owner_num, owner_slug, number, lines, im, report)
            if s is None and (owner_slug, number) in custom_skills_by_owner_num:
                s = custom_skills_by_owner_num[(owner_slug, number)]
                report["notes"].append(f"{im['file']}: spreadsheet marks {s['owner']} {number} "
                                       f"'{s['name']}' as Custom, but the site has a scan of it -> treated as official")
            add_or_alternate(cards, skill_record(s, owner_slug, number, take_scan(im), im, lines, report), report)

    # ------------------------------------------------------------------ weaknesses (no numbers in sheet)
    for im in by_page.get(("common-cards", "weaknesses"), []):
        lines = ocr_lines(ocr, im["file"])
        name, txt, sc = best_name_match(lines, [w["name"] for w in weaknesses])
        s = next((w for w in weaknesses if w["name"] == name), None)
        if s is None:
            report["unmatched_scans"].append((im["file"], txt, round(sc, 2)))
        elif sc < 0.9:
            report["fuzzy"].append((im["file"], f"{txt!r} -> {name}", round(sc, 2)))
        rec = skill_record(s, "weakness", None, take_scan(im), im, lines, report, report_unmatched=False)
        if s is None:
            rec["id"] = f"skill-weakness-unmatched-{im['index']:02d}"
        else:
            # weakness cards carry no ability text at all (name + art only)
            rec["text_en"], rec["text_ru"], rec["no_text"] = "", "", True
            rec["todo"] = [t for t in rec["todo"] if t not in ("text_en", "text_ru")]
        cards.append(rec)

    # ------------------------------------------------------------------ items
    for (section, sub), ims in sorted(by_page.items()):
        if section != "items":
            continue
        for im in ims:
            cards.append(item_record(im, items, item_claimed, ocr, report, take_scan, page=sub))

    # ------------------------------------------------------------------ terrain / damage / fear
    def simple_section(section, records, kind, id_prefix, extra):
        names = [r["name"] for r in records]
        for im in by_page.get((section, None), []):
            lines = ocr_lines(ocr, im["file"])
            name, txt, sc = best_name_match(lines, names)
            r = next((x for x in records if x["name"] == name), None)
            if r is None:
                report["unmatched_scans"].append((im["file"], txt, round(sc, 2)))
            elif sc < 0.9:
                report["fuzzy"].append((im["file"], f"{txt!r} -> {name}", round(sc, 2)))
            rec = {
                "id": f"{id_prefix}-{slug(name or txt or im['file'])}",
                "kind": kind,
                "name_en": r["name"] if r else None,
                "name_ru": None,
                "text_en": r["text"] if r else None,
                "text_ru": None,
                "page": section,
                "image": {"front": take_scan(im), "back": None},
                "source": {"ocr_name": txt, "match_score": round(sc, 2)},
            }
            rec.update(extra(r) if r else {})
            rec["todo"] = todo_fields(rec, ["name_en", "name_ru", "text_en", "text_ru", "expansion"])
            cards.append(rec)

    simple_section("terrain", terrain, "terrain", "terrain",
                   lambda r: {"expansion": r["collections"][0] if len(r["collections"]) == 1 else r["collections"]})
    # the spreadsheet does not say which set damage / fear / condition cards come from
    simple_section("damage", [d for d in damage_fear if d["kind"] == "damage"], "damage", "damage",
                   lambda r: {"copies": r["copies"], "expansion": None})
    simple_section("fear", [d for d in damage_fear if d["kind"] == "fear"], "fear", "fear",
                   lambda r: {"copies": r["copies"], "expansion": None})

    # ------------------------------------------------------------------ conditions (boons / banes)
    for im in by_page.get(("conditions", None), []):
        lines = ocr_lines(ocr, im["file"])
        text_all = " ".join(l["text"] for l in lines)
        r = None
        title = lines[0]["text"] if lines else ""
        if re.match(r"\s*escape", title, re.I):   # the five "Escape!" backs of Captured
            m = re.search(r"test\s*(Might|Wisdom|Agility|Spirit|Wit)", text_all, re.I)
            stat = None
            if m:
                stat = m.group(1).capitalize()
            else:  # the stat is printed as an icon; use the flavour sentence instead
                flavour = {"strength": "Might", "clear": "Wisdom", "speed": "Agility",
                           "courage": "Spirit", "craftiness": "Wit"}
                for key, st in flavour.items():
                    if key in text_all.lower():
                        stat = st
                        break
            backs = [c for c in conditions if c["side"] == "back"]
            if stat and len(backs) == len(ESCAPE_ORDER):
                r = backs[ESCAPE_ORDER.index(stat)]
                txt, sc = f"Escape! ({stat})", 1.0
            else:
                txt, sc = "Escape! (?)", 0.0
            name = f"Escape! ({stat or '?'})"
        else:
            cands = [c["name"] for c in conditions if c["side"] != "back"]
            name, txt, sc = best_name_match(lines, cands)
            r = next((c for c in conditions if c["name"] == name and c["side"] != "back"), None)
        if r is None:
            report["unmatched_scans"].append((im["file"], txt, round(sc, 2)))
        rec = {
            "id": f"{r['kind'] if r else 'condition'}-{slug(name or txt or im['file'])}",
            "kind": "condition",
            "subtype": r["kind"] if r else None,
            "name_en": name if name else None,
            "name_ru": None,
            "text_en": r["text"] if r else None,
            "text_ru": None,
            "expansion": None,   # not in the spreadsheet
            "page": "conditions",
            "image": {"front": take_scan(im), "back": None},
            "source": {"ocr_name": txt, "match_score": round(sc, 2)},
        }
        rec["todo"] = todo_fields(rec, ["name_en", "name_ru", "text_en", "text_ru", "expansion"])
        cards.append(rec)

    # ------------------------------------------------------------------ spreadsheet records without a scan
    seen_ids = Counter(c["id"] for c in cards)
    dup_ids = [i for i, n in seen_ids.items() if n > 1]
    for it in items:
        if id(it) not in item_claimed:
            rec = item_to_record(it, None, None, page=None)
            # reprints (same name, tier, number and text in another collection) reuse the scan
            twin = next((c for c in cards if c["kind"] == "item" and c["image"]["front"]
                         and c["name_en"] == it["name"] and c["tier"] == (it["tier"] or None)
                         and c["number"] == it["number"] and c["text_en"] == it["text"]), None)
            if twin:
                rec["image"] = {"front": twin["image"]["front"], "back": None, "shared_from": twin["id"]}
                rec["page"] = twin["page"]
                report["notes"].append(f"{rec['id']}: no own scan, reprint of {twin['id']} -> shares its image")
            else:
                report["no_scan"].append(f"item {it['name']} ({it['collection']}, {it['type']}, tier {it['tier'] or '-'})")
                rec["todo"].append("no_scan")
            cards.append(rec)
    matched_skill_ids = {c["id"] for c in cards if c["kind"] == "skill"}
    for s in bgg["skills"]:
        rid = skill_id(owner_key_of(s), s["number"], s["name"])
        if rid not in matched_skill_ids:
            report["no_scan"].append(f"skill {s['owner']} {s['number'] or ''} '{s['name']}' ({s['collection']})")
            rec = skill_record(s, owner_key_of(s), s["number"], None, None, [], report)
            rec["todo"].append("no_scan")
            cards.append(rec)
    for name_list, kind in ((terrain, "terrain"), ([d for d in damage_fear if d["kind"] == "damage"], "damage"),
                            ([d for d in damage_fear if d["kind"] == "fear"], "fear")):
        have = {c["name_en"] for c in cards if c["kind"] == kind}
        for r in name_list:
            if r["name"] not in have:
                report["no_scan"].append(f"{kind} '{r['name']}'")
    for im in scans:
        if im["file"] not in used_scans:
            report["unmatched_scans"].append((im["file"], "(scan not assigned to any section)", 0))

    # ------------------------------------------------------------------ translations (data/translations.json)
    tr_path = ROOT / "data" / "translations.json"
    if tr_path.exists():
        tr = json.loads(tr_path.read_text(encoding="utf-8"))["cards"]
        n_tr = 0
        for c in cards:
            t = tr.get(c["id"])
            if not t:
                continue
            n_tr += 1
            c["name_ru"] = t.get("name_ru") or None
            c["text_ru"] = t.get("text_ru") if t.get("text_ru") is not None else None
            if t.get("traits_ru"):
                c["traits_ru"] = t["traits_ru"]
            if t.get("background_ru"):
                c["background_ru"] = t["background_ru"]
            if t.get("suggested_ru"):
                c["suggested_ru"] = t["suggested_ru"]
            if t.get("race_ru"):
                c["race_ru"] = t["race_ru"]
            c["image"]["front_ru"] = t.get("image_ru")
            c["image"]["back_ru"] = t.get("image_ru_back")
            if t.get("image_ru_alternates"):
                c["image"]["alternates_ru"] = t["image_ru_alternates"]
            c["translation"] = {"verified": bool(t.get("verified")), "proofread": t.get("proofread"), "source": "hw-scan"}
            c["todo"] = [x for x in c["todo"] if x not in ("name_ru", "text_ru")]
            if not t.get("verified"):
                c["todo"].append("verify_ru" if t.get("proofread") else "proofread_ru")
        report["notes"].append(f"translations applied to {n_tr} cards from {tr_path.name}")

    # ------------------------------------------------------------------ write
    order = {"hero": 0, "skill": 1, "item": 2, "terrain": 3, "damage": 4, "fear": 5, "condition": 6}
    cards.sort(key=lambda c: (order[c["kind"]], c.get("page") or "", c.get("number") or 0, c["id"]))
    out = {
        "generated_from": {"scans": str(MANIFEST.relative_to(ROOT)), "spreadsheet": bgg["source"]},
        "collections": bgg["collections"],
        "keywords": bgg["keywords"],
        "modifiers": bgg["modifiers"],
        "space_traits": bgg["space_traits"],
        "cards": cards,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = ["# Build report", ""]
    kinds = Counter(c["kind"] for c in cards)
    lines.append("## Cards by kind\n")
    for k, n in kinds.items():
        lines.append(f"- {k}: {n}")
    sub = Counter((c["kind"], c.get("subtype") or c.get("type") or "") for c in cards)
    lines.append("\n## Cards by kind / subtype\n")
    for (k, t), n in sorted(sub.items()):
        lines.append(f"- {k} / {t}: {n}")
    lines.append(f"\n## Duplicate ids ({len(dup_ids)})\n")
    lines += [f"- {d}" for d in dup_ids]
    for key, title in [("unmatched_scans", "Scans without a spreadsheet match"),
                       ("no_scan", "Spreadsheet records without a scan"),
                       ("order_mismatch", "Page order != printed number"),
                       ("ambiguous", "Ambiguous name matches (same name in several collections)"),
                       ("fuzzy", "Fuzzy / fallback matches (check)"),
                       ("notes", "Notes")]:
        lines.append(f"\n## {title} ({len(report[key])})\n")
        for e in report[key]:
            lines.append(f"- {e if isinstance(e, str) else ' | '.join(str(x) for x in e)}")
    todo = Counter(t for c in cards for t in c["todo"])
    lines.append("\n## TODO counts\n")
    for t, n in todo.most_common():
        lines.append(f"- {t}: {n}")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\n-> {OUT}\n-> {REPORT}")


# ----------------------------------------------------------------------------- record builders
def skill_id(owner_slug, number, name):
    return f"skill-{owner_slug}-{number}" if number else f"skill-{owner_slug}-{slug(name)}"


def owner_key_of(s):
    """Canonical owner slug of a spreadsheet skill: 'basic' / 'title' / 'weakness' or slug(owner)."""
    return s["type"].lower() if s["type"] in ("Basic", "Title", "Weakness") else slug(s["owner"])


def skill_record(s, owner_slug, number, image, im, lines, report, report_unmatched=True):
    name_line = None
    if lines:
        # the name is the tallest line in the middle band of the card
        band = [l for l in lines if im and 0.4 * im["height"] < l["y"] < 0.6 * im["height"]]
        if band:
            name_line = max(band, key=lambda l: l["h"])["text"]
    if s is None and im is not None and report_unmatched:
        report["unmatched_scans"].append((im["file"], name_line, 0))
    if s is not None:
        owner_slug = owner_key_of(s)
    rec = {
        "id": skill_id(owner_slug, number, s["name"] if s else (name_line or f"unknown-{im['index']:02d}" if im else "unknown")),
        "kind": "skill",
        "subtype": s["type"] if s else None,          # Hero / Role / Basic / Title / Weakness
        "owner": s["owner"] if s else None,
        "name_en": s["name"] if s else None,
        "name_ru": None,
        "text_en": s["text"] if s else None,
        "text_ru": None,
        "cost": s["xp"] if s else None,
        "number": number,
        "icons": s["icon"] if s else None,
        "traits": s["traits"] if s else None,
        "keywords": s["keywords"] if s else None,
        "count": s["count"] if s else None,
        "rating": s["rating"] if s else None,
        "expansion": s["collection"] if s else None,
        "page": owner_slug,
        "image": {"front": image, "back": None},
        "source": {"ocr_name": name_line},
    }
    if s and lines:
        # sanity check: some OCR line should resemble the sheet name
        best = max((similarity(l["text"], s["name"]) for l in lines), default=0)
        rec["source"]["match_score"] = round(best, 2)
        if best < 0.6:
            report["fuzzy"].append((image, f"no OCR line resembles sheet name {s['name']!r}", round(best, 2)))
    rec["todo"] = todo_fields(rec, ["name_en", "name_ru", "text_en", "text_ru"])
    return rec


def item_to_record(it, image, source, page):
    rec = {
        "id": f"item-{slug(it['name'])}" + (f"-{it['collection']}" if it.get("_dup") else ""),
        "kind": "item",
        "subtype": it["type"],                        # Weapon / Support / Trinket / Armor / Mount
        "family": it["family"],
        "name_en": it["name"],
        "name_ru": None,
        "text_en": it["text"],
        "text_ru": None,
        "tier": it["tier"] or None,
        "number": it["number"],
        "test": it["test"],
        "traits": it["traits"],
        "hands_or_tokens": it["hands_or_tokens"],
        "ranged": it["ranged"],
        "count": it["count"],
        "expansion": it["collection"],
        "page": page,
        "image": {"front": image, "back": None},
        "source": source or {},
    }
    rec["todo"] = todo_fields(rec, ["name_ru", "text_ru"])
    return rec


def item_record(im, items, item_claimed, ocr, report, take_scan, page):
    lines = ocr_lines(ocr, im["file"])
    # candidate types for this page
    want = SECTION_TYPE.get(page)
    if want is None:
        pool = items
    else:
        want = want if isinstance(want, tuple) else (want,)
        pool = [it for it in items if it["type"] in want]
    names = sorted({it["name"] for it in pool})
    name, txt, sc = best_name_match(lines, names)
    # printed number (bottom right) and tier help to disambiguate
    number = None
    for l in lines:
        if l["y"] > im["height"] * 0.85 and re.fullmatch(r"\d{1,3}", l["text"].strip()):
            number = int(l["text"].strip())
    if name is None:
        report["unmatched_scans"].append((im["file"], txt, round(sc, 2)))
        rec = {
            "id": f"item-unmatched-{slug(im['file'])}", "kind": "item", "subtype": None, "family": None,
            "name_en": None, "name_ru": None, "text_en": None, "text_ru": None, "tier": None,
            "number": number, "test": None, "traits": None, "hands_or_tokens": None, "ranged": None,
            "count": None, "expansion": None, "page": page,
            "image": {"front": take_scan(im), "back": None},
            "source": {"ocr_name": txt, "match_score": round(sc, 2), "ocr_number": number},
        }
        rec["todo"] = ["name_en", "name_ru", "text_en", "text_ru", "unmatched"]
        return rec
    cands = [it for it in pool if it["name"] == name]
    free = [it for it in cands if id(it) not in item_claimed]
    chosen = None
    if len(cands) > 1:
        # same name in several collections: prefer a number match, then the earliest unclaimed collection
        order = {"core": 0, "sp": 1, "sw": 2, "did": 3, "voe": 4, "sotw": 5}
        by_num = [it for it in (free or cands) if number is not None and it["number"] == number]
        chosen = sorted(by_num or free or cands, key=lambda it: order.get(it["collection"], 9))[0]
        for it in cands:
            it["_dup"] = True
        report["ambiguous"].append((im["file"], f"{name}: {[it['collection'] for it in cands]} -> {chosen['collection']}"))
    else:
        chosen = cands[0]
        if id(chosen) in item_claimed:
            report["notes"].append(f"{im['file']}: second scan of item {name} (OCR {txt!r})")
    if sc < 0.9:
        report["fuzzy"].append((im["file"], f"{txt!r} -> {name}", round(sc, 2)))
    elif norm(txt) != norm(name):
        report["notes"].append(f"{im['file']}: card reads {txt!r}, sheet says {name!r}")
    if number is not None and chosen["number"] is not None and number != chosen["number"]:
        report["notes"].append(f"{im['file']}: OCR number {number} != sheet number {chosen['number']} for {name}")
    item_claimed.add(id(chosen))
    return item_to_record(chosen, take_scan(im), {"ocr_name": txt, "match_score": round(sc, 2), "ocr_number": number}, page)


if __name__ == "__main__":
    main()
