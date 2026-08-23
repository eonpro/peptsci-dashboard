#!/usr/bin/env python3
"""
Punch leftover studio fill out of the blank vial PNG.

The official render was shot on a blue field. Corners were keyed, but a
rectangular halo around the cap and a gray glass-body fill remain. On
#213cef those read as a darker bounding box behind every vial.

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

# Matches components/shop/ProductVial.tsx LABEL band.
CAP_END = 0.13
LABEL_TOP = 0.444
LABEL_BOTTOM = 0.876


def smooth(t: float) -> float:
    x = min(1.0, max(0.0, t))
    return x * x * (3.0 - 2.0 * x)


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


def cap_keep_range(y: int, h: int, w: int) -> tuple[float, float]:
    """Central column range for the cap / crimp (studio fills the rest)."""
    return lerp_range(
        y / h,
        [
            (0.00, 0.24, 0.68),
            (0.02, 0.36, 0.78),
            (0.08, 0.36, 0.78),
            (0.09, 0.18, 0.86),
            (0.13, 0.14, 0.86),
        ],
        w,
    )


def glass_keep_range(y: int, h: int, w: int) -> tuple[float, float]:
    """Cylinder silhouette for glass (orig is full-bleed gray studio)."""
    return lerp_range(
        y / h,
        [
            (0.13, 0.14, 0.86),
            (0.20, 0.135, 0.863),
            (0.30, 0.13, 0.87),
            (0.40, 0.08, 0.92),
            (0.444, 0.02, 0.98),
            (0.876, 0.02, 0.98),
            (0.93, 0.08, 0.92),
            (1.00, 0.12, 0.88),
        ],
        w,
    )


def is_studio_blue(r: int, g: int, b: int, a: int) -> bool:
    if a < 24:
        return True
    # Leftover backdrop: bright, cyan-leaning blue. Cap plastic is darker
    # (R ~8–20, G ~55–75) once you are below the lid highlight.
    if b >= 190 and g >= 88 and r >= 28:
        return True
    if b >= 210 and g >= 80 and r >= 40:
        return True
    return False


def punch(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    w, h = im.size
    pix = im.load()
    n = w * h
    rgba = [pix[i % w, i // w] for i in range(n)]
    lum = [(p[0] + p[1] + p[2]) / 3 for p in rgba]
    chroma = [max(p[0], p[1], p[2]) - min(p[0], p[1], p[2]) for p in rgba]

    grad = [0.0] * n
    for y in range(h):
        row = y * w
        for x in range(1, w - 1):
            grad[row + x] = abs(lum[row + x + 1] - lum[row + x - 1])
        if 0 < y < h - 1:
            for x in range(w):
                grad[row + x] = max(
                    grad[row + x], abs(lum[row + x + w] - lum[row + x - w])
                )

    out = Image.new("RGBA", (w, h))
    dst = out.load()

    for p in range(n):
        x = p % w
        y = p // w
        r, g, b, a = rgba[p]
        fy = y / h

        # --- Cap / upper-shoulder studio rectangle ---
        if fy < CAP_END + 0.02:
            left, right = cap_keep_range(y, h, w)
            outside = x < left - 1 or x > right + 1
            if outside and is_studio_blue(r, g, b, a):
                dst[x, y] = (r, g, b, 0)
                continue
            # Soften the cut so the cap edge is not a hard box.
            edge_dist = min(x - left, right - x)
            if edge_dist < 6 and is_studio_blue(r, g, b, a):
                a = round(a * max(0.0, edge_dist / 6))

        # --- Glass: outline + speculars + cake. Punch the gray studio fill. ---
        is_glass = (CAP_END <= fy < LABEL_TOP) or fy >= LABEL_BOTTOM
        if is_glass and a > 0:
            gl, gr = glass_keep_range(y, h, w)
            if x < gl - 2 or x > gr + 2:
                dst[x, y] = (r, g, b, 0)
                continue
            L = lum[p]
            C = chroma[p]
            near_rim = min(x - gl, gr - x) <= 10
            highlight = L >= 224
            # True lyophilized cake is near-white; gray glass fill is ~180–210.
            powder = fy >= LABEL_BOTTOM and L >= 236 and C < 18
            if not (near_rim or highlight or powder):
                dst[x, y] = (r, g, b, 0)
                continue
            if near_rim and not highlight and not powder:
                # Keep a thin rim, not the shaded gray slab.
                a = round(a * min(1.0, smooth((grad[p] - 8) / 20) * 0.85 + 0.15))

        dst[x, y] = (r, g, b, a)
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
    print(f"wrote {OUT} ({result.size[0]}x{result.size[1]})")

    if args.preview:
        composite_preview(result, (33, 60, 239), "preview-vial-on-brand.png")
        composite_preview(result, (5, 7, 34), "preview-vial-on-navy.png")
        composite_preview(result, (255, 255, 255), "preview-vial-on-white.png")


if __name__ == "__main__":
    main()
