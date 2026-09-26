/**
 * Liquid-glass surface recipes shared by the UI primitives and app chrome.
 *
 * Plain Tailwind classes (not custom utilities) so `cn()` / tailwind-merge can
 * dedupe call-site overrides. Light defaults + `dark:` variants: the partners
 * portal renders light, every other surface renders inside `.dark`.
 */

/** Cards and in-page panels: translucent gradient fill, rim highlight, blur. */
export const glassSurface =
  'border border-white/70 bg-linear-to-b from-white/75 to-white/45 shadow-glass backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.11] dark:from-white/[0.085] dark:to-white/[0.025] dark:shadow-glass-dark'

/** Floating overlays (dialog, sheet, popover, menus): denser for legibility. */
export const glassPanel =
  'border border-white/80 bg-white/85 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.8),0_30px_70px_-24px_rgb(5_7_34/0.35)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.12] dark:bg-[#0a0e3a]/80 dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08),0_30px_80px_-24px_rgb(0_0_0/0.85)]'

/** Sticky headers, sidebars, and bottom navs sitting over the fluid background. */
export const glassChrome =
  'border-white/60 bg-white/60 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.08] dark:bg-brand-onyx/55'

/** Text inputs, textareas, and select triggers. */
export const glassField =
  'border border-slate-300/70 bg-white/60 shadow-[inset_0_1px_2px_rgb(5_7_34/0.06)] backdrop-blur-md hover:border-slate-400/70 focus-visible:border-brand-primary/70 focus-visible:ring-4 focus-visible:ring-brand-primary/15 focus-visible:ring-offset-0 dark:border-white/[0.12] dark:bg-white/[0.045] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] dark:hover:border-white/20 dark:focus-visible:border-brand-teal/60 dark:focus-visible:ring-brand-teal/15'

/** Modal scrim: dims and softly blurs the page behind an overlay. */
export const glassScrim = 'bg-[#02031a]/55 backdrop-blur-sm'

/** Selected state for nav pills/tabs: the same liquid fill as the primary button. */
export const liquidActive =
  'bg-linear-to-b from-[#4a66ff] to-brand-primary text-white shadow-liquid'

/** Segmented nav track (the rail the nav pills sit in). */
export const glassTrack =
  'rounded-full border border-white/70 bg-white/45 shadow-[inset_0_1px_2px_rgb(5_7_34/0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]'
