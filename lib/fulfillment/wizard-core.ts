/**
 * Pure, dependency-free state machine for the guided fulfillment wizard.
 *
 * The operator walks one order through six screens — verify the contents, print
 * vial labels, print the packing slip, photograph and pack, ship, then mark it
 * fulfilled. The cursor lives on OrderFulfillment.step so a refresh, a crash, or
 * a second packer resumes exactly where the last one stopped.
 *
 * Holds NO Prisma/Clerk imports so it is unit-testable in isolation (mirrors
 * lib/fulfillment/pick-list-core.ts). The DB-bound service in
 * lib/fulfillment/service.ts persists whatever this module decides.
 *
 * @module lib/fulfillment/wizard-core
 */

/** Wizard cursor. COMPLETE is terminal and has no screen of its own. */
export type FulfillmentStepName =
  | 'VERIFY'
  | 'VIAL_LABELS'
  | 'PACKING_SLIP'
  | 'PHOTO'
  | 'SHIP'
  | 'REVIEW'
  | 'COMPLETE'

/** The coarse stage badge that predates the wizard. */
export type FulfillmentStageName = 'NOT_STARTED' | 'PICKING' | 'PICKED' | 'PACKED'

/** The screens an operator actually sees, in order. */
export const WIZARD_STEPS = [
  'VERIFY',
  'VIAL_LABELS',
  'PACKING_SLIP',
  'PHOTO',
  'SHIP',
  'REVIEW',
] as const

/** A step the operator can be shown (everything except the terminal COMPLETE). */
export type WizardStep = (typeof WIZARD_STEPS)[number]

const STEP_LABELS: Record<FulfillmentStepName, string> = {
  VERIFY: 'Verify Order',
  VIAL_LABELS: 'Vial Labels',
  PACKING_SLIP: 'Packing Slip',
  PHOTO: 'Photo & Pack',
  SHIP: 'Ship',
  REVIEW: 'Mark Fulfilled',
  COMPLETE: 'Fulfilled',
}

/**
 * Stage each cursor position implies. Confirming the contents on the verify
 * screen is what counts as picked; clearing the photo screen is what counts as
 * packed. Keeping this derivation in one place means `step` stays the single
 * source of truth and `stage` never drifts from it.
 */
const STEP_STAGES: Record<FulfillmentStepName, FulfillmentStageName> = {
  VERIFY: 'PICKING',
  VIAL_LABELS: 'PICKED',
  PACKING_SLIP: 'PICKED',
  PHOTO: 'PICKED',
  SHIP: 'PACKED',
  REVIEW: 'PACKED',
  COMPLETE: 'PACKED',
}

/** Entry screen for an order whose progress predates the wizard. */
const STAGE_ENTRY_STEPS: Record<FulfillmentStageName, FulfillmentStepName> = {
  NOT_STARTED: 'VERIFY',
  PICKING: 'VERIFY',
  PICKED: 'VIAL_LABELS',
  PACKED: 'SHIP',
}

/** Human-readable screen name, for the stepper header and summary lines. */
export function stepLabel(step: FulfillmentStepName): string {
  return STEP_LABELS[step]
}

/** 1-based position for "Step N of 6". COMPLETE reports the final position. */
export function stepIndex(step: FulfillmentStepName): number {
  if (step === 'COMPLETE') return WIZARD_STEPS.length
  return WIZARD_STEPS.indexOf(step) + 1
}

/** True once the order has been marked fulfilled. */
export function isComplete(step: FulfillmentStepName | null | undefined): boolean {
  return step === 'COMPLETE'
}

/** The screen that follows `step`. Clearing REVIEW finishes the wizard. */
export function nextStep(step: FulfillmentStepName): FulfillmentStepName {
  if (step === 'COMPLETE') return 'COMPLETE'
  const i = WIZARD_STEPS.indexOf(step as WizardStep)
  return i === WIZARD_STEPS.length - 1 ? 'COMPLETE' : WIZARD_STEPS[i + 1]
}

/**
 * The screen before `step`, or null when there is nowhere to go back to. A
 * finished order never reopens — correcting one goes through Reset stage.
 */
export function previousStep(step: FulfillmentStepName): FulfillmentStepName | null {
  if (step === 'COMPLETE') return null
  const i = WIZARD_STEPS.indexOf(step as WizardStep)
  return i <= 0 ? null : WIZARD_STEPS[i - 1]
}

/** The stage badge implied by the current cursor. */
export function stageForStep(step: FulfillmentStepName): FulfillmentStageName {
  return STEP_STAGES[step]
}

/** Just enough of an OrderFulfillment row to work out where to resume. */
export interface ResumableFulfillment {
  step?: FulfillmentStepName | null
  stage?: FulfillmentStageName | null
}

/**
 * Where to open the wizard. Orders started before this flow existed have no
 * cursor, so fall back to the stage they reached under the old pick/pack
 * buttons rather than making the operator redo finished work.
 */
export function resumeStep(fulfillment: ResumableFulfillment | null | undefined): FulfillmentStepName {
  if (fulfillment?.step) return fulfillment.step
  return STAGE_ENTRY_STEPS[fulfillment?.stage ?? 'NOT_STARTED']
}

export interface WizardCompletionState {
  /** Tracking from the FedEx label or a manually entered number. */
  trackingNumber?: string | null
  /** Contents photos on file for the order. */
  photoCount?: number
  /** Set when the packer explicitly skipped the photo step. */
  photoSkippedAt?: Date | string | null
}

export interface CompletionCheck {
  ok: boolean
  /** Why completion is blocked, or null when it is allowed. */
  reason: string | null
  /** No contents photo on file — worth warning about, but not a blocker. */
  photoMissing: boolean
}

/**
 * Whether the final screen may mark the order fulfilled. A package with no
 * tracking has nothing to tell the customer, so that is a hard stop; a missing
 * contents photo is surfaced as a warning because the packer may have
 * deliberately skipped it.
 */
export function canComplete(state: WizardCompletionState): CompletionCheck {
  const photoMissing = (state.photoCount ?? 0) === 0
  if (!state.trackingNumber || state.trackingNumber.trim() === '') {
    return {
      ok: false,
      reason: 'Add a tracking number — create a FedEx label or enter one manually — before marking this order fulfilled.',
      photoMissing,
    }
  }
  return { ok: true, reason: null, photoMissing }
}
