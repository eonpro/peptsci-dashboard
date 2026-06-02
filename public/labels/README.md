# Label assets

The PeptSci vial-label generator (`lib/labels/peptsciLabelPdf.ts`) prints the
real PeptSci artwork on every label and overlays only the dynamic fields.

## Source artwork → template

`PEPTSCI LABEL SAMPLE.svg` is the authoritative artwork supplied by PeptSci. Its
viewBox is `0 0 144 54` — exactly the OL4891LP label in PDF points (2.0" × 0.75").
All **static** brand elements are baked in (PeptSci logo + molecule, divider,
`BUD:`, `RUO`, the two-tone dose box with `99%HPLC`, the rotated
`PROVIDER USE ONLY / NOT FOR HUMAN OR / ANIMAL CONSUMPTION` warning, and
`BATCH:`). The **dynamic** fields (BUD date digits, dose, barcode) are
`display:none`, so they don't render — leaving a clean blank template.

`scripts/build-label-template.ts` rasterizes that SVG to a high-DPI PNG used by
the engine as the label background:

```
public/labels/peptsci-label-template.png   # generated — ~1440 DPI
```

Regenerate it after editing the SVG:

```
npm run labels:template
```

The engine composites this template, then overlays the dynamic fields as crisp
PDF vectors at the exact SVG placeholder coordinates:

- **BUD** `MM/DD/YYYY` — day emphasized + accented (indigo), at (41.16, ~9)
- **Dose** (e.g. `10mg`) — white, centered in the black dose-box band
- **Code 128 barcode** — rotated vertical bars filling the well (x 102.5–128.76)
- **Product name** — auto-fit, centered in the open band above the dose box
- **Batch number** — rotated, continuing the baked `BATCH:` label

> The dose-box purity (`99%HPLC`) is part of the baked artwork. If a batch needs a
> different purity, update the SVG and re-run `npm run labels:template`.

## Bundled assets (Vercel / serverless)

Next.js does **not** ship `public/` to serverless function bundles, so reading
these files via `fs` fails on Vercel and the engine would otherwise fall back to
the plain vector label. To guarantee the real artwork everywhere, the template
**and** ASCII-subset brand fonts are embedded as base64 in
`lib/labels/embeddedAssets.ts` and used as a fallback after the on-disk copy.

Regenerate that bundle whenever the SVG or fonts change (after `npm run
labels:template`):

```
npm run labels:assets   # → lib/labels/embeddedAssets.ts (~274 KB)
```

`lib/labels/embeddedAssets.ts` must be committed and deployed — it is what makes
production labels match the artwork.

## Last-resort fallback

If both the disk PNG and the embedded template are unavailable, the generator
falls back to a fully programmatic vector label (`drawLabelVector`) so label
generation never throws. The optional `peptsci-logo-vertical.png` is only used by
that path.

## Label stock

Designed for **OnlineLabels OL4891LP** — 2.0" × 0.75", 36 labels per US-Letter
sheet (3 cols × 12 rows). Print at **100% scale** on the highest-quality setting
(600 DPI+).
