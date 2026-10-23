/**
 * TIME Academy vial label geometry — OL4891LP, in label points (144 × 54) with
 * the origin top-left and y growing down (SVG space).
 *
 * Positions come from the client-supplied proof. The dose box, PUO mark and
 * `99%HPLC` are the PeptSci artwork at 1:1, translated by {@link DOSE_BOX_OFFSET}.
 * Shared by `scripts/build-time-academy-template.ts` (baked artwork) and
 * `timeAcademyLabelPdf.ts` (live text) so the two always line up. No imports:
 * safe for scripts and tests.
 */

export const TIME_ACADEMY_TEAL_HEX = '#308f83'
export const TIME_ACADEMY_INK_HEX = '#000000'

export const LABEL_W = 144
export const LABEL_H = 54

/** Logo panel: the supplied mark scaled uniformly; height follows its aspect. */
export const LOGO_LEFT = 7.4
export const LOGO_TOP = 4.25
export const LOGO_WIDTH = 41.5

export const DIVIDER = { x: 59.39, y: 5.38, width: 0.5, height: 44.07 } as const

/** Translation applied to the PeptSci dose box, PUO and `99%HPLC` artwork. */
export const DOSE_BOX_OFFSET = { x: 42, y: 0.805 } as const

// PeptSci artwork (`PEPTSCI LABEL SAMPLE.svg`) box edges, before the offset.
const PEPTSCI_BOX = { left: 40.55, right: 68.56, top: 24.94, mid: 33.83, bottom: 42.73 }

export const DOSE_BOX = {
  left: PEPTSCI_BOX.left + DOSE_BOX_OFFSET.x,
  right: PEPTSCI_BOX.right + DOSE_BOX_OFFSET.x,
  top: PEPTSCI_BOX.top + DOSE_BOX_OFFSET.y,
  mid: PEPTSCI_BOX.mid + DOSE_BOX_OFFSET.y,
  bottom: PEPTSCI_BOX.bottom + DOSE_BOX_OFFSET.y,
  corner: 2.16,
} as const
export const DOSE_BOX_CENTER_X = (DOSE_BOX.left + DOSE_BOX.right) / 2

/** Baked PUO glyphs span x 76.26–80.66 (PeptSci 34.26–38.66 + offset). */
export const MARK_CLEAR = { left: 75.3, right: 81.4 } as const

/** Dose (black band) and blend second-dose (teal band) baselines. */
export const DOSE_BASELINE = 31.21 + DOSE_BOX_OFFSET.y
export const DOSE_BASELINE_TEAL = 40.1 + DOSE_BOX_OFFSET.y
export const DOSE_SIZE = 7.61
export const DOSE_SIZE_MIN = 4
export const DOSE_MAX_WIDTH = DOSE_BOX.right - DOSE_BOX.left - 4
/** Blend purity, rotated just right of the box (reads bottom-to-top). */
export const PURITY_SIDE_SIZE = 4.2
export const PURITY_SIDE_BASELINE_X = DOSE_BOX.right + 1.2 + PURITY_SIDE_SIZE

/**
 * Product name: centred over the dose box, between the divider and the rail.
 * Names too wide at full size break onto two lines (line 2 keeps the one-line
 * baseline, line 1 sits above it), so the dose box never moves.
 */
export const NAME_CENTER_X = DOSE_BOX_CENTER_X
export const NAME_MAX_WIDTH = 2 * Math.min(NAME_CENTER_X - 62.3, 127.3 - NAME_CENTER_X)
export const NAME_BASELINE = 21.24
export const NAME_SIZE_MAX = 10.5
export const NAME_SIZE_MIN = 6
export const NAME_LINE1_BASELINE = 13.2
export const NAME_LINE1_SIZE_MAX = 8.5
export const NAME_LINE2_SIZE_MAX = 7.5
export const NAME_LINE2_SIZE_MIN = 5
/** Adobe Illustrator tracking −25 (thousandths of an em), as on PeptSci names. */
export const NAME_TRACKING_EM = -0.025

/** BAC water "BAC" / "Water" stack, on the two-line name baselines. */
export const BAC_NAME_SIZE = 8.5

/**
 * Right rail: `BATCH: <lot>` then `BUD MM/DD/YY`, rotated 90° and reading
 * bottom-to-top from a shared start. x values are the text baselines.
 */
export const RAIL_BATCH_BASELINE_X = 131.75
export const RAIL_BUD_BASELINE_X = 135.56
export const RAIL_START_Y = 49
export const RAIL_END_Y = 5
export const RAIL_SIZE = 4.1
export const RAIL_SIZE_MIN = 3
