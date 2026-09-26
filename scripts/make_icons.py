"""
Site icons: a gold eight-point "success" burst on the site's dark background.

  app/public/favicon.svg             browser tab (modern browsers)
  app/public/favicon-32.png          browser tab fallback
  app/public/apple-touch-icon.png    iOS home screen (180, opaque)
  app/public/pwa-192.png, pwa-512.png            PWA manifest icons
  app/public/pwa-maskable-512.png    maskable icon (burst inside the safe zone)

Run:  uv run --with pillow python scripts/make_icons.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "public"
GOLD = (201, 164, 92)
BG = (27, 24, 20)


def burst(cx: float, cy: float, ro: float, ri: float):
    pts = []
    for i in range(16):
        a = math.radians(-90 + i * 22.5)
        r = ro if i % 2 == 0 else ri
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def svg() -> str:
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in burst(32, 32, 24, 12.5))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
        '  <rect width="64" height="64" rx="14" fill="#1b1814"/>\n'
        '  <rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="#c9a45c" stroke-opacity=".35" stroke-width="2"/>\n'
        f'  <polygon fill="#c9a45c" points="{pts}"/>\n'
        "</svg>\n"
    )


def png(size: int, rounded: bool, scale: float = 1.0) -> Image.Image:
    s = 8
    w = size * s
    im = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, w - 1, w - 1], radius=w * 14 / 64, fill=BG + (255,))
        d.rounded_rectangle([w * 2 / 64, w * 2 / 64, w - w * 2 / 64, w - w * 2 / 64], radius=w * 12 / 64, outline=GOLD + (90,), width=int(w * 2 / 64))
    else:
        d.rectangle([0, 0, w, w], fill=BG + (255,))
    d.polygon(burst(w / 2, w / 2, w * 24 / 64 * scale, w * 12.5 / 64 * scale), fill=GOLD + (255,))
    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    (OUT / "favicon.svg").write_text(svg(), encoding="utf-8", newline="\n")
    png(32, True).save(OUT / "favicon-32.png")
    png(180, False).save(OUT / "apple-touch-icon.png")
    png(192, False).save(OUT / "pwa-192.png")
    png(512, False).save(OUT / "pwa-512.png")
    png(512, False, scale=0.72).save(OUT / "pwa-maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
