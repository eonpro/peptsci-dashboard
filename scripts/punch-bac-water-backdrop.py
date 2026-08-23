#!/usr/bin/env python3
"""
Punch the black studio field out of the bacteriostatic-water product photo.

The Hospira shot is RGB on #000. On brand-primary that reads as a black
rectangle behind the vial. Flood from the border through near-black pixels
and feather the cut so the glass rim is not a hard edge.

Usage:
  python3 scripts/punch-bac-water-backdrop.py
  python3 scripts/punch-bac-water-backdrop.py --preview
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORIG = ROOT / "public/shop/bacteriostatic-water-orig.png"
OUT = ROOT / "public/shop/bacteriostatic-water.png"
PREVIEW_DIR = Path("/tmp")

HARD_LUMA = 22
FEATHER_LUMA = 48


def luma(r: int, g: int, b: int) -> float:
    return (r + g + b) / 3


def chroma(r: int, g: int, b: int) -> int:
    return max(r, g, b) - min(r, g, b)


def is_studio(r: int, g: int, b: int, a: int, limit: float = HARD_LUMA) -> bool:
    if a < 16:
        return True
    # Magenta cap / label bar must never be keyed.
    if chroma(r, g, b) > 40:
        return False
    return luma(r, g, b) <= limit


def punch(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    w, h = im.size
    pix = im.load()
    n = w * h
    rgba = [pix[i % w, i // w] for i in range(n)]

    visited = bytearray(n)
    q: deque[int] = deque()

    def seed(p: int) -> None:
        if visited[p]:
            return
        r, g, b, a = rgba[p]
        if not is_studio(r, g, b, a, FEATHER_LUMA):
            return
        visited[p] = 1
        q.append(p)

    for x in range(w):
        seed(x)
        seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w)
        seed(y * w + (w - 1))

    while q:
        p = q.pop()
        x = p % w
        y = p // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or nx >= w or ny < 0 or ny >= h:
                continue
            np_ = ny * w + nx
            if visited[np_]:
                continue
            r, g, b, a = rgba[np_]
            if is_studio(r, g, b, a, FEATHER_LUMA):
                visited[np_] = 1
                q.append(np_)

    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for p in range(n):
        x = p % w
        y = p // w
        r, g, b, a = rgba[p]
        if not visited[p]:
            dst[x, y] = (r, g, b, a)
            continue
        L = luma(r, g, b)
        if L <= HARD_LUMA or a < 16:
            dst[x, y] = (r, g, b, 0)
            continue
        # Feather the glass rim instead of a hard cut.
        t = (L - HARD_LUMA) / (FEATHER_LUMA - HARD_LUMA)
        dst[x, y] = (r, g, b, round(a * min(1.0, max(0.0, t))))
    return out


def composite_preview(vial: Image.Image, bg: tuple[int, int, int], name: str) -> None:
    canvas = Image.new("RGB", vial.size, bg)
    canvas.paste(vial, mask=vial.split()[-1])
    dest = PREVIEW_DIR / name
    canvas.save(dest)
    print(f"preview: {dest}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    src = Image.open(ORIG)
    result = punch(src)
    result.save(OUT, optimize=True)
    print(f"wrote {OUT} ({result.size[0]}x{result.size[1]} {result.mode})")

    if args.preview:
        composite_preview(result, (33, 60, 239), "preview-bac-on-brand.png")
        composite_preview(result, (5, 7, 34), "preview-bac-on-navy.png")
        composite_preview(result, (255, 255, 255), "preview-bac-on-white.png")


if __name__ == "__main__":
    main()
