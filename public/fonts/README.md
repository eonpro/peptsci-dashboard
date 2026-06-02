# Fonts

## Label fonts (PDF — `public/fonts/labels/`)

The vial-label engine (`lib/labels/peptsciLabelPdf.ts`) embeds + subsets brand
fonts that match the artwork's CSS. Drop TTF/OTF files here:

```
/public/fonts/labels/
├── AmericanTypewriter-Condensed.ttf      # BUD date + batch number (REQUIRED for brand match)
├── AmericanTypewriter-CondensedBold.ttf  # batch number (optional; falls back to Condensed)
├── SofiaPro-Regular.ttf                  # dose box + peptide name (from the eonpro project)
└── SofiaPro-SemiBold.otf                 # peptide name (optional; falls back to Regular)
```

- If a file is missing, the engine falls back to a Standard-14 substitute
  (Courier for American Typewriter, Helvetica-Bold for Sofia Pro) — labels still
  generate, just not perfectly on-brand.
- **American Typewriter** ships with macOS; the bundled TTFs were extracted from
  the system collection for development. Ensure PeptSci holds a valid license
  (Monotype/Adobe) for production printing/distribution.
- **Sofia Pro** (`SofiaPro-Regular.ttf`) is the licensed copy sourced from the
  eonpro project (`eonpro/public/fonts/Sofia-Pro-Regular.ttf`). Add an optional
  `SofiaPro-SemiBold.otf/ttf` for a heavier peptide name; otherwise Regular is
  used. If absent entirely, the dose + name fall back to Helvetica-Bold.

---

# Sofia Pro Font Setup (web UI)

## Option 1: Self-Hosted Fonts (Recommended for Production)

Place your Sofia Pro font files in this directory with these exact names:

```
/public/fonts/
├── SofiaPro-Light.woff2
├── SofiaPro-Light.woff
├── SofiaPro-Regular.woff2
├── SofiaPro-Regular.woff
├── SofiaPro-Medium.woff2
├── SofiaPro-Medium.woff
├── SofiaPro-SemiBold.woff2
├── SofiaPro-SemiBold.woff
├── SofiaPro-Bold.woff2
└── SofiaPro-Bold.woff
```

You can purchase Sofia Pro from:

- https://www.myfonts.com/fonts/morisawa/sofia-pro/
- https://fonts.adobe.com/fonts/sofia (Adobe Fonts subscription)

## Option 2: Adobe Fonts (Typekit)

1. Go to https://fonts.adobe.com/fonts/sofia
2. Add Sofia Pro to a Web Project
3. Copy your project ID (e.g., `abc1def`)
4. Update the link in `/app/layout.tsx`:

```tsx
<link rel="stylesheet" href="https://use.typekit.net/YOUR_PROJECT_ID.css" />
```

## Option 3: fonts.com

If you have a fonts.com subscription:

1. Add Sofia Pro to your account
2. Get the embed code
3. Add it to `/app/layout.tsx`

## Fallback Fonts

The system will fall back to these fonts if Sofia Pro is not available:

- -apple-system (macOS/iOS)
- BlinkMacSystemFont (Chrome on macOS)
- Segoe UI (Windows)
- Roboto (Android)
- Helvetica Neue
- Arial
- sans-serif

## Testing

After adding fonts, restart the dev server:

```bash
npm run dev
```

Hard refresh your browser (Cmd+Shift+R or Ctrl+Shift+R) to see the changes.
