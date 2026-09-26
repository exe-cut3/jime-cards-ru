"""
Self-host the site fonts (Alegreya, Alegreya Sans — SIL Open Font License 1.1) so the app
makes no request to Google and works offline.

  app/public/fonts/*.woff2     one file per family / weight / style / subset
  app/public/fonts/fonts.css   the @font-face rules with local urls and unicode-range

Run:  python scripts/fetch_fonts.py
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "public" / "fonts"
CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400"
    "&family=Alegreya+Sans:wght@400;500;700&display=swap"
)
# a modern UA makes Google return woff2 with unicode-range subsets
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
SUBSETS = {"latin", "latin-ext", "cyrillic", "cyrillic-ext"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    css = fetch(CSS_URL).decode("utf-8")
    # blocks look like:  /* cyrillic */\n@font-face {\n  font-family: 'Alegreya'; ... src: url(...) format('woff2'); unicode-range: ...; }
    pattern = re.compile(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", re.S)
    rules = []
    n = 0
    for subset, body in pattern.findall(css):
        if subset not in SUBSETS:
            continue
        family = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
        url = re.search(r"url\(([^)]+)\)", body).group(1)
        name = f"{family.lower().replace(' ', '-')}-{weight}{'-italic' if style == 'italic' else ''}-{subset}.woff2"
        path = OUT / name
        if not path.exists():
            path.write_bytes(fetch(url))
            n += 1
        body = body.replace(url, f"./{name}")
        rules.append(f"/* {subset} */\n@font-face {{{body}}}\n")
    header = (
        "/* Alegreya and Alegreya Sans by Juan Pablo del Peral (Huerta Tipográfica),\n"
        "   SIL Open Font License 1.1 — https://openfontlicense.org\n"
        "   Files fetched from Google Fonts by scripts/fetch_fonts.py */\n\n"
    )
    (OUT / "fonts.css").write_text(header + "".join(rules), encoding="utf-8", newline="\n")
    print(f"{len(rules)} @font-face rules, {n} files downloaded -> {OUT}")


if __name__ == "__main__":
    main()
