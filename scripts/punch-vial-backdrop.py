#!/usr/bin/env python3
"""
Remove leftover studio around the blank vial WITHOUT hollowing the glass.

The previous pass keyed the glass interior to alpha 0 and left jagged fringe.
This version copies the original render 1:1 inside a capsule silhouette and
only punches pixels outside that silhouette (the rectangular studio field).

Usage:
  python3 scripts/punch-vial-backdrop.py
  python3 scripts/punch-vial-backdrop.py --preview
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORIG = ROOT / "public/vial/vial-blank-orig.png"
OUT = ROOT / "public/vial/vial-blank.png"
PREVIEW_DIR = Path("/tmp")

# Feather at the silhouette edge only (px).
FEATHER = 3.0


def lerp_range(fy: float, keys: list[tuple[float, float, float]], w: int) -> tuple[float, float]:
    if fy <= keys[0][0]:
        return keys[0][1] * w, keys[0][2] * w
    if fy >= keys[-1][0]:
        return keys[-1][1] * w, keys[-1][2] * w
    for i in range(len(keys) - 1):
        f0, l0, r0 = keys[i]
        f1, l1, r1 = keys[i + 1]
        if f0 <= fy <= f1:
            t = 0 if f1 == f0 else (fy - f0) / (f1 - f0)
            return (l0 + t * (l1 - l0)) * w, (r0 + t * (r1 - r0)) * w
    return keys[-1][1] * w, keys[-1][2] * w


def silhouette_lr(y: int, h: int, w: int) -> tuple[float, float]:
    """
    Physical vial capsule (cap / crimp / glass / label / base).
    Measured from the orig render so studio beside the neck is outside,
    while gray glass *inside* the cylinder is kept as photographed.
    """
    return lerp_range(
        y / h,
        [
            (0.00, 0.26, 0.65),
            (0.03, 0.34, 0.76),
            (0.08, 0.34, 0.76),
            (0.10, 0.20, 0.82),
            (0.13, 0.15, 0.85),
            (0.22, 0.135, 0.863),
            (0.40, 0.06, 0.94),
            (0.444, 0.015, 0.985),
            (0.876, 0.015, 0.985),
            (0.93, 0.08, 0.92),
            (1.00, 0.14, 0.86),
        ],
        w,
    )


def punch(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    w, h = im.size
    pix = im.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()

    for y in range(h):
        left, right = silhouette_lr(y, h, w)
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a == 0:
                dst[x, y] = (r, g, b, 0)
                continue
            if left <= x <= right:
                dst[x, y] = (r, g, b, a)
                continue
            dist = left - x if x < left else x - right
            if dist >= FEATHER:
                dst[x, y] = (r, g, b, 0)
            else:
                dst[x, y] = (r, g, b, round(a * (1.0 - dist / FEATHER)))
    return out


def composite_preview(vial: Image.Image, bg: tuple[int, int, int], name: str) -> None:
    canvas = Image.new("RGB", vial.size, bg)
    canvas.paste(vial, mask=vial.split()[-1])
    dest = PREVIEW_DIR / name
    canvas.save(dest)
    print(f"preview: {dest}")


def assert_glass_intact(vial: Image.Image) -> None:
    """Guardrail: do not hollow the photographed glass again."""
    w, h = vial.size
    samples = [
        (w // 2, int(h * 0.28)),  # neck glass
        (w // 2, int(h * 0.38)),  # shoulder glass
        (w // 2, int(h * 0.92)),  # base glass
        (w // 2, int(h * 0.60)),  # label
        (w // 2, int(h * 0.05)),  # cap
    ]
    for x, y in samples:
        a = vial.getpixel((x, y))[3]
        if a < 200:
            raise SystemExit(f"glass/cap/label punched at ({x},{y}) alpha={a}")
    corner = vial.getpixel((2, 2))[3]
    if corner > 40:
        raise SystemExit(f"studio still opaque at corner alpha={corner}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    src = Image.open(ORIG)
    result = punch(src)
    assert_glass_intact(result)
    result.save(OUT, optimize=True)
    print(f"wrote {OUT} ({result.size[0]}x{result.size[1]})")

    if args.preview:
        composite_preview(result, (33, 60, 239), "preview-vial-on-brand.png")
        composite_preview(result, (5, 7, 34), "preview-vial-on-navy.png")
        composite_preview(result, (255, 255, 255), "preview-vial-on-white.png")


if __name__ == "__main__":
    main()
