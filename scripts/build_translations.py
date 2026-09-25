"""
Build data/translations.json — official Russian (Hobby World) names and card texts —
from the TTS mod scans (data/raw/tts/cards.json + ocr_ru*.json), matched to data/cards.json.

Matching
  * hero / role / basic / title skills: position on the mod's sprite sheet == printed number
    (role decks: index+1; hero decks: 0-5 = Basic 1-6, 6-10 = hero 1-5; titles: index+1),
    cross-checked against the OCR'd footer ("Кузнец 4")
  * everything else: data/ru_names.json (EN name -> RU name as in the mod metadata);
    items are additionally checked by tier and lore number read from the scan
Text
  * RU card text comes from OCR (block mode) and is stored with `verified: false` for
    proof-reading. Inline icons are OCR noise — the proof-reading pass replaces them with
    {success} {fate} {fear} {damage} {might} ... tokens that the app renders as glyphs.
  * Hand-edited entries marked `"verified": true` survive re-runs of this script.

Run:  python scripts/build_translations.py
"""
import difflib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TTS = ROOT / "data" / "raw" / "tts"
CARDS_EN = ROOT / "data" / "cards.json"
RU_NAMES = ROOT / "data" / "ru_names.json"
OUT = ROOT / "data" / "translations.json"
REPORT = ROOT / "data" / "translations_report.md"

TM_RE = re.compile(r"(tm|lic|szc|ffg|тм|ррс|ерс|\$[27]с)", re.I)
TRAIT_WORDS = {"тактика", "знания", "доблесть", "песня", "врожденный", "существо", "тень", "помощь", "еда", "пища", "провизия"}
# how the five "Escape!" backs describe the captors ("brutal but too weak" ...)
STAT_WORDS = {"might": ["слаб", "вынослив", "свиреп"], "wisdom": ["глуп", "жесток", "план", "ясн"], "agility": ["ловк", "скорост", "медлит"],
              "spirit": ["надежд", "злу", "отваг", "пугают"], "wit": ["ума", "недалёк", "недалек", "хитр", "смекал"]}
ROMAN = {"I": "I", "II": "II", "III": "III", "IV": "IV", "1": "I", "11": "II", "111": "III", "1V": "IV", "|": "I", "||": "II", "|||": "III", "У": "V", "ГУ": "IV"}
FOOTER_RE = re.compile(r"^[^А-Яа-яЁё]*([А-ЯЁ][А-Яа-яЁё\- ]{2,})\D{0,3}(\d{1,2})\D{0,3}$")
DIGITS_ONLY = re.compile(r"^[\W\d_]{0,6}$")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").lower().replace("ё", "е")
    return re.sub(r"[^a-zа-я0-9]+", " ", s).strip()


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def clean_name(s):
    return re.sub(r"^[^\wА-Яа-яЁё«]+|[^\wА-Яа-яЁё!?»]+$", "", s.strip())


def case_from_ocr(nick, ocr_text):
    """The mod metadata spells names correctly but in Title Case; the scan has the printed
    case ('Боевой топор') but OCR errors. Take the words from the metadata and the case from
    the scan when the two line up word by word."""
    if not ocr_text:
        return nick
    a, b = nick.split(), clean_name(ocr_text).split()
    if len(a) != len(b):
        return nick
    out = []
    for w, o in zip(a, b):
        if sim(w, o) < 0.5:
            return nick
        out.append(w[0].lower() + w[1:] if o[:1].islower() and w[:1].isupper() else w)
    return " ".join(out)


def join_lines(lines):
    """Join OCR lines of one block: hyphenated words are glued, otherwise space-separated."""
    para = ""
    for t in lines:
        t = t.strip()
        if not t:
            continue
        if para.endswith("-") and t[:1].islower():
            para = para[:-1] + t
        elif para:
            para += " " + t
        else:
            para = t
    para = re.sub(r"\s+([,.;:!?»)])", r"\1", para)
    para = re.sub(r"([«(])\s+", r"\1", para)
    return para.strip()


def body_text(o, y_min, y_max, name, x_min=0):
    """Card text from the OCR blocks inside a vertical band, without the name / footer / icon noise."""
    paras = []
    for b in o.get("blocks", []):
        by0, by1 = b["y"], b["y"] + b["h"]
        if by1 <= y_min or by0 >= y_max or b["x"] + b["w"] < x_min:
            continue
        keep = []
        for ln in b["lines"]:
            t = ln.strip()
            if not t or DIGITS_ONLY.match(t):
                continue
            if name and sim(t, name) >= 0.6:
                continue
            if TM_RE.search(t) and len(t) < 30:
                continue
            if FOOTER_RE.match(t) and len(t) < 30:
                continue
            keep.append(t)
        if keep:
            paras.append(join_lines(keep))
    return "\n".join(p for p in paras if p)


def footer(lines, height):
    for l in reversed(lines):
        if l["y"] < height * 0.88:
            continue
        m = FOOTER_RE.match(l["text"].strip())
        if m:
            return m.group(1).strip(), int(m.group(2))
    return None, None


def find_name_line(lines, nick, expected_y, band):
    """Line that reads like the name (anywhere on the card); else the line nearest the expected position."""
    if not lines:
        return None, 0
    best = max(lines, key=lambda l: sim(l["text"], nick))
    s = sim(best["text"], nick)
    if s >= 0.6:
        return best, s
    cands = [l for l in lines if abs(l["y"] - expected_y) <= band] or lines
    return min(cands, key=lambda l: abs(l["y"] - expected_y)), s


def load_ocr():
    merged = {}
    for p in sorted(TTS.glob("ocr_ru*.json")):
        if "v1" in p.name:
            continue
        merged.update(json.loads(p.read_text(encoding="utf-8")))
    return merged


def main():
    tts = json.loads((TTS / "cards.json").read_text(encoding="utf-8"))
    ocr = load_ocr()
    en = json.loads(CARDS_EN.read_text(encoding="utf-8"))["cards"]
    names = json.loads(RU_NAMES.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8"))["cards"] if OUT.exists() else {}
    # proof-read texts: data/fixes/*.json (batches, LLM proof-reading against the EN text),
    # then data/translations_fixes.json (hand fixes, highest priority)
    fixes = {}
    for fp in sorted((ROOT / "data" / "fixes").glob("*.json")) + [ROOT / "data" / "translations_fixes.json"]:
        if fp.exists():
            fixes.update({k: v for k, v in json.loads(fp.read_text(encoding="utf-8")).items() if not k.startswith("_")})

    ru2en_role = {v: k for k, v in names["role"].items()}
    ru2en_hero = {v: k for k, v in names["hero"].items()}
    skill_names = json.loads((ROOT / "data" / "ru_skill_names.json").read_text(encoding="utf-8"))["owners"]
    basic_ru2en = {v: k for k, v in names["basic"].items()}
    seen_in_deck = Counter()   # (deck, nickname) -> how many copies already assigned
    skills = {(c["owner"].lower(), c["number"]): c for c in en if c["kind"] == "skill" and c["number"] and c["subtype"] in ("Hero", "Role")}
    basics = {c["number"]: c for c in en if c["kind"] == "skill" and c["subtype"] == "Basic"}
    titles = {c["number"]: c for c in en if c["kind"] == "skill" and c["subtype"] == "Title"}
    by_kind_name = defaultdict(list)
    for c in en:
        by_kind_name[(c["kind"], c["name_en"])].append(c)
    order = {"core": 0, "sp": 1, "sw": 2, "did": 3, "voe": 4, "sotw": 5}

    def ru_lookup(section, ru):
        inv = {v: k for k, v in names[section].items()}
        if ru in inv:
            return inv[ru], 1.0
        best = max(inv, key=lambda v: sim(v, ru), default=None)
        return (inv[best], sim(best, ru)) if best and sim(best, ru) >= 0.85 else (None, 0)

    result, report = {}, defaultdict(list)
    claimed = Counter()

    def attach(card, rec, tts_card, note=None):
        cid = card["id"]
        if claimed[cid]:
            result[cid].setdefault("image_ru_alternates", []).append(tts_card["file"])
            claimed[cid] += 1
            return
        claimed[cid] += 1
        rec["image_ru"] = tts_card["file"]
        if tts_card.get("back_file"):
            rec["image_ru_back"] = tts_card["back_file"]
        if note:
            rec.setdefault("notes", []).append(note)
        if old.get(cid, {}).get("verified"):
            keep = dict(old[cid])
            keep["image_ru"] = rec["image_ru"]
            if rec.get("image_ru_back"):
                keep["image_ru_back"] = rec["image_ru_back"]
            result[cid] = keep
            return
        rec["verified"] = False
        # raw OCR is kept for reference; proof-read text (data/translations_fixes.json) replaces it
        for key in ("text_ru", "background_ru"):
            if rec.get(key):
                rec[key + "_ocr"] = rec[key]
        fx = fixes.get(cid)
        if fx:
            for key in ("name_ru", "text_ru", "traits_ru", "background_ru", "suggested_ru", "race_ru"):
                if key in fx:
                    rec[key] = fx[key]
            rec["proofread"] = fx.get("_by", "llm")
        result[cid] = rec

    for t in tts["cards"]:
        deck = t["deck"].split("/")[-1].replace("[state]", "")
        nick = re.sub(r"\s+", " ", t["nickname"]).strip()
        o = ocr.get(t["file"])
        if o is None:
            report["no_ocr"].append(f"{t['file']} {deck} '{nick}'")
            continue
        H, W = o["height"], o["width"]
        lines = [l for l in o["lines"] if l["text"].strip() and not (TM_RE.search(l["text"]) and len(l["text"]) < 24)]
        idx = t["index"]

        if deck == "Слабость (Фанатское дополнение)":
            continue

        # ---------------- numbered skills: hero decks, role decks, titles; weaknesses by name
        numbered = (deck in ru2en_role or deck in ru2en_hero or deck == "Прозвища") and nick not in ru2en_hero
        if numbered or deck == "Слабость":
            name_line, name_sim = find_name_line(lines, nick, 0.47 * H, 0.08 * H)
            name_ru = case_from_ocr(nick, name_line["text"]) if name_line and name_sim >= 0.6 else nick
            card, expect_num = None, None
            if deck == "Слабость":
                en_name, _ = ru_lookup("weakness", nick)
                card = by_kind_name[("skill", en_name)][0] if en_name else None
            elif deck == "Прозвища":
                expect_num = idx + 1
                card = titles.get(expect_num)
            else:
                owner_en = ru2en_hero.get(deck) or ru2en_role[deck]
                is_hero_deck = deck in ru2en_hero
                # 1) by name: RU nickname -> EN name -> EN numbers (copies assigned in sheet order)
                en_name = basic_ru2en.get(nick) or skill_names.get(owner_en, {}).get(nick)
                if en_name is None and nick:   # typos in the mod metadata (e.g. 'Древеяя Мудрость')
                    pool = {**basic_ru2en, **skill_names.get(owner_en, {})}
                    best = max(pool, key=lambda k: sim(k, nick), default=None)
                    if best and sim(best, nick) >= 0.8:
                        en_name = pool[best]
                if en_name:
                    if en_name in names["basic"]:
                        copies = [c for c in basics.values() if c["name_en"] == en_name]
                    else:
                        copies = sorted([c for (o, n), c in skills.items() if o == owner_en.lower() and c["name_en"] == en_name], key=lambda c: c["number"])
                    k = seen_in_deck[(t["deck"], nick)]
                    seen_in_deck[(t["deck"], nick)] += 1
                    card = copies[min(k, len(copies) - 1)] if copies else None
                # 2) fallback: position on the sheet
                expect_num = (idx + 1 if idx < 6 else idx - 5) if is_hero_deck else idx + 1
                if card is None:
                    card = basics.get(expect_num) if (is_hero_deck and idx < 6) else skills.get((owner_en.lower(), expect_num))
                    if card is not None:
                        report["by_index"].append(f"{t['file']} {deck} '{nick}' -> {card['name_en']} {card['number']} (by sheet position)")
            if card is None:
                report["unmatched"].append(f"{t['file']} {deck} '{nick}' (index {idx})")
                continue
            owner, num = footer(lines, H)
            if num is not None and num != card["number"]:
                report["footer_mismatch"].append(f"{t['file']} {deck} '{nick}' -> {card['name_en']} {card['number']}: footer reads {owner!r} {num}")
            y0 = (name_line["y"] + name_line["h"]) if name_line else 0.5 * H
            text = body_text(o, y0 - 4, 0.9 * H, nick)
            traits = None
            first = text.split("\n")[0] if text else ""
            if first and len(first) < 40 and any(w in norm(first).split() for w in TRAIT_WORDS):
                traits = first
                text = "\n".join(text.split("\n")[1:])
            rec = {"name_ru": name_ru, "text_ru": "" if card["subtype"] == "Weakness" else text,
                   "traits_ru": traits, "name_ocr_match": round(name_sim, 2)}
            attach(card, rec, t)
            continue

        # ---------------- items
        if deck in ("Deck", "Мешок", "Броня", "Конь") or nick in ("Когтистые Лапы", "Старая Шкура", "Молот и Щипцы", "Снежный Блеск"):
            en_name, _ = ru_lookup("item", nick)
            cands = by_kind_name[("item", en_name)] if en_name else []
            if not cands:
                report["unmatched"].append(f"{t['file']} {deck} '{nick}': no item mapping")
                continue
            name_line, name_sim = find_name_line(lines, nick, 0.46 * H, 0.08 * H)
            name_ru = case_from_ocr(nick, name_line["text"]) if name_line and name_sim >= 0.6 else nick
            num_ocr = next((int(m.group(1)) for l in lines if l["y"] > H * 0.86 for m in [re.search(r"(\d{2,3})", l["text"])] if m), None)
            tier_ocr = next((ROMAN[l["text"].strip()] for l in lines if 0.5 * H < l["y"] < 0.6 * H and l["text"].strip() in ROMAN), None)
            free = [c for c in cands if not claimed[c["id"]]] or cands
            card = sorted(free, key=lambda c: order.get(c["expansion"], 9))[0]
            note = None
            if num_ocr and card["number"] and num_ocr != card["number"]:
                note = f"OCR lore number {num_ocr} != sheet {card['number']}"
                report["item_checks"].append(f"{t['file']} '{nick}' -> {en_name}: {note}")
            if tier_ocr and card["tier"] and tier_ocr != card["tier"]:
                report["item_checks"].append(f"{t['file']} '{nick}' -> {en_name}: OCR tier {tier_ocr} != sheet {card['tier']}")
            if en_name in names.get("_guessed", []):
                report["guessed"].append(f"{t['file']} '{nick}' -> {en_name}: scan tier {tier_ocr or '?'} / number {num_ocr or '?'}; sheet tier {card['tier'] or '-'} / number {card['number'] or '-'}")
            y1 = name_line["y"] if name_line else 0.44 * H
            rec = {"name_ru": name_ru, "text_ru": body_text(o, 0, y1 - 2, nick), "name_ocr_match": round(name_sim, 2)}
            attach(card, rec, t, note)
            continue

        # ---------------- terrain / damage / fear / conditions (name at the top)
        if deck in ("Ландшафт", "Урон", "Страх", "Смелость", "Скрытность", "Решительность", "Испуг", "Уныние", "Неволя"):
            if deck == "Неволя":
                text_all = (" ".join(l["text"] for l in lines) + " " + " ".join(l for b in o["blocks"] for l in b["lines"])).lower()
                scores = {st: sum(text_all.count(k) for k in keys) for st, keys in STAT_WORDS.items()}
                taken = {c["name_en"] for c in en if c["kind"] == "condition" and claimed[c["id"]]}
                stat = max((st for st in scores if f"Escape! ({st.capitalize()})" not in taken), key=lambda st: scores[st], default=None)
                en_name = f"Escape! ({stat.capitalize()})" if stat and scores[stat] > 0 else None
                section = "condition"
            else:
                section = {"Ландшафт": "terrain", "Урон": "damage", "Страх": "fear"}.get(deck, "condition")
                en_name, _ = ru_lookup(section, nick)
            cands = [c for c in en if c["kind"] == section and c["name_en"] == en_name] if en_name else []
            if not cands:
                report["unmatched"].append(f"{t['file']} {deck} '{nick}': no mapping ({en_name})")
                continue
            card = cands[0]
            if claimed[card["id"]]:
                claimed[card["id"]] += 1   # copies (Усталость x11): keep the first scan only
                continue
            mid = deck in ("Урон", "Страх")
            name_line, name_sim = find_name_line(lines, nick if deck != "Неволя" else "Побег!", (0.46 if mid else 0.05) * H, 0.12 * H)
            name_ru = case_from_ocr(nick if deck != "Неволя" else "Побег!", name_line["text"]) if name_line and name_sim >= 0.6 else (nick if deck != "Неволя" else "Побег!")
            y0 = (name_line["y"] + name_line["h"]) if name_line else 0.1 * H
            rec = {"name_ru": name_ru, "text_ru": body_text(o, y0 - 4, H, name_ru), "name_ocr_match": round(name_sim, 2)}
            attach(card, rec, t)
            if deck == "Неволя" and t.get("back_file"):
                cap = [c for c in en if c["kind"] == "condition" and c["name_en"] == "Captured"]
                ob = ocr.get(t["back_file"])
                if cap and not claimed[cap[0]["id"]] and ob:
                    bl = [l for l in ob["lines"] if l["text"].strip()]
                    nl, ns = find_name_line(bl, "Неволя", 0.05 * ob["height"], 0.12 * ob["height"])
                    attach(cap[0], {"name_ru": "Неволя", "text_ru": body_text(ob, (nl["y"] + nl["h"]) if nl else 0.1 * ob["height"], ob["height"], "Неволя"),
                                    "name_ocr_match": round(ns, 2)}, {"file": t["back_file"]})
            continue

        # ---------------- heroes (single landscape cards)
        if nick in ru2en_hero:
            cands = by_kind_name[("hero", ru2en_hero[nick])]
            if not cands:
                report["unmatched"].append(f"{t['file']} hero '{nick}' not in cards.json")
                continue
            card = cands[0]
            if claimed[card["id"]]:
                claimed[card["id"]] += 1
                continue
            ability = body_text(o, 0.71 * H, 0.93 * H, nick, x_min=0.47 * W)
            stat_words = ("сила", "мудрость", "ловкость", "храбрость", "смекалка", "урон", "страх")
            ability = "\n".join(p for p in ability.split("\n") if len(p) > 12 and not any(norm(p).startswith(w) for w in stat_words))
            race = next((clean_name(l["text"]) for l in lines if l["y"] > 0.88 * H and l["x"] < 0.4 * W and re.search(r"[А-Яа-я]{3,}", l["text"])), None)
            rec = {"name_ru": nick, "text_ru": ability, "race_ru": race, "name_ocr_match": 1.0}
            ob = ocr.get(t.get("back_file") or "")
            if ob:
                bg, sug, mode = [], [], None
                for b in ob["blocks"]:
                    for ln in b["lines"]:
                        up = norm(ln)
                        if "предыстор" in up:
                            mode = "bg"
                            continue
                        if "рекоменд" in up or up in ("выбор",):
                            mode = "sug"
                            continue
                        if TM_RE.search(ln) and len(ln) < 30:
                            continue
                        if sim(ln, nick) >= 0.7:
                            continue
                        if mode == "bg":
                            bg.append(ln)
                        elif mode == "sug":
                            sug.append(ln)
                rec["background_ru"] = join_lines(bg) if bg else None
                rec["suggested_ru"] = " ".join(x.strip() for x in sug) if sug else None
            attach(card, rec, t)
            continue

        report["skipped"].append(f"{t['file']} deck {deck!r} nick {nick!r}")

    for c in en:
        if c["id"] not in result:
            report["missing_ru"].append(f"{c['id']} ({c['kind']}/{c.get('subtype')}) {c['name_en']}")

    out = {
        "_source": "Hobby World edition scans (TTS workshop 3353638862); names from the mod metadata; text = OCR (rapidocr detection + tesseract rus)",
        "_howto": "Edit name_ru / text_ru / traits_ru / background_ru by hand and set verified: true — verified entries survive re-runs of build_translations.py. Inline icons: {success} {fate} {fear} {damage} {might} {wisdom} {agility} {spirit} {wit} {inspiration} {lore} {trinket} {armor} {hand} {hands} {ranged}",
        "cards": dict(sorted(result.items())),
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    md = ["# Translations report", "", f"- EN cards: {len(en)}", f"- with RU: {len(result)}", f"- RU scans used: {sum(claimed.values())}", ""]
    low = [(cid, r["name_ocr_match"]) for cid, r in result.items() if r.get("name_ocr_match", 1) < 0.8]
    md.append(f"## Name OCR below 0.8 ({len(low)}) — name taken from mod metadata\n")
    md += [f"- {cid}: {s}" for cid, s in low]
    for key, title in [("unmatched", "RU scans not matched"), ("missing_ru", "EN cards without RU"), ("no_ocr", "RU scans without OCR yet"),
                       ("footer_mismatch", "Assigned number vs printed footer (OCR digits are unreliable)"),
                       ("by_index", "Skills matched by sheet position only"), ("item_checks", "Item tier / lore-number checks"),
                       ("guessed", "Guessed name mappings (verify)"), ("skipped", "Skipped RU scans")]:
        md.append(f"\n## {title} ({len(report[key])})\n")
        md += [f"- {x}" for x in report[key]]
    REPORT.write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:5]))
    for key in ("unmatched", "missing_ru", "no_ocr", "footer_mismatch", "by_index", "item_checks", "guessed", "skipped"):
        print(f"{key}: {len(report[key])}")
    print(f"-> {OUT}\n-> {REPORT}")


if __name__ == "__main__":
    main()
