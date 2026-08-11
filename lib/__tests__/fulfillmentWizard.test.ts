import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  WIZARD_STEPS,
  nextStep,
  previousStep,
  stageForStep,
  resumeStep,
  isComplete,
  stepIndex,
  stepLabel,
  canComplete,
} from '../fulfillment/wizard-core.ts'

describe('WIZARD_STEPS', () => {
  test('runs verify → vial labels → packing slip → photo → ship → review', () => {
    assert.deepEqual(
      [...WIZARD_STEPS],
      ['VERIFY', 'VIAL_LABELS', 'PACKING_SLIP', 'PHOTO', 'SHIP', 'REVIEW']
    )
  })

  test('every step has a human label and a 1-based position', () => {
    WIZARD_STEPS.forEach((step, i) => {
      assert.ok(stepLabel(step).length > 0, `${step} needs a label`)
      assert.equal(stepIndex(step), i + 1)
    })
  })

  test('COMPLETE is terminal and sits outside the visible step list', () => {
    assert.equal(isComplete('COMPLETE'), true)
    assert.equal(isComplete('REVIEW'), false)
    assert.equal(stepIndex('COMPLETE'), WIZARD_STEPS.length)
  })
})

describe('nextStep', () => {
  test('advances through the flow in order', () => {
    assert.equal(nextStep('VERIFY'), 'VIAL_LABELS')
    assert.equal(nextStep('VIAL_LABELS'), 'PACKING_SLIP')
    assert.equal(nextStep('PACKING_SLIP'), 'PHOTO')
    assert.equal(nextStep('PHOTO'), 'SHIP')
    assert.equal(nextStep('SHIP'), 'REVIEW')
  })

  test('review completes the wizard and complete is a fixed point', () => {
    assert.equal(nextStep('REVIEW'), 'COMPLETE')
    assert.equal(nextStep('COMPLETE'), 'COMPLETE')
  })
})

describe('previousStep', () => {
  test('walks back through the flow', () => {
    assert.equal(previousStep('REVIEW'), 'SHIP')
    assert.equal(previousStep('SHIP'), 'PHOTO')
    assert.equal(previousStep('VIAL_LABELS'), 'VERIFY')
  })

  test('cannot go back past the first step, and never re-opens a finished order', () => {
    assert.equal(previousStep('VERIFY'), null)
    assert.equal(previousStep('COMPLETE'), null)
  })
})

describe('stageForStep', () => {
  test('verify is in-progress picking', () => {
    assert.equal(stageForStep('VERIFY'), 'PICKING')
  })

  test('confirming the products counts the order as picked', () => {
    assert.equal(stageForStep('VIAL_LABELS'), 'PICKED')
    assert.equal(stageForStep('PACKING_SLIP'), 'PICKED')
    assert.equal(stageForStep('PHOTO'), 'PICKED')
  })

  test('reaching the ship step means the box is packed', () => {
    assert.equal(stageForStep('SHIP'), 'PACKED')
    assert.equal(stageForStep('REVIEW'), 'PACKED')
    assert.equal(stageForStep('COMPLETE'), 'PACKED')
  })
})

describe('resumeStep', () => {
  test('resumes on the persisted cursor', () => {
    assert.equal(resumeStep({ step: 'PACKING_SLIP', stage: 'PICKED' }), 'PACKING_SLIP')
  })

  test('a finished order stays finished', () => {
    assert.equal(resumeStep({ step: 'COMPLETE', stage: 'PACKED' }), 'COMPLETE')
  })

  test('derives an entry point for orders from the pre-wizard flow', () => {
    assert.equal(resumeStep({ step: null, stage: 'PACKED' }), 'SHIP')
    assert.equal(resumeStep({ step: null, stage: 'PICKED' }), 'VIAL_LABELS')
    assert.equal(resumeStep({ step: null, stage: 'PICKING' }), 'VERIFY')
    assert.equal(resumeStep({ step: null, stage: 'NOT_STARTED' }), 'VERIFY')
  })

  test('starts at the beginning when there is no fulfillment row at all', () => {
    assert.equal(resumeStep(null), 'VERIFY')
    assert.equal(resumeStep({}), 'VERIFY')
  })
})

describe('canComplete', () => {
  test('allows completion once tracking exists and a photo is on file', () => {
    const check = canComplete({ trackingNumber: '794123456789', photoCount: 1 })
    assert.equal(check.ok, true)
    assert.equal(check.reason, null)
    assert.equal(check.photoMissing, false)
  })

  test('blocks completion without a tracking number', () => {
    for (const trackingNumber of [null, undefined, '', '   ']) {
      const check = canComplete({ trackingNumber, photoCount: 1 })
      assert.equal(check.ok, false, `tracking ${JSON.stringify(trackingNumber)} should block`)
      assert.match(check.reason ?? '', /tracking/i)
    }
  })

  test('flags a missing contents photo without blocking completion', () => {
    const skipped = canComplete({
      trackingNumber: '794123456789',
      photoCount: 0,
      photoSkippedAt: new Date('2026-08-11T12:00:00.000Z'),
    })
    assert.equal(skipped.ok, true)
    assert.equal(skipped.photoMissing, true)

    const never = canComplete({ trackingNumber: '794123456789', photoCount: 0 })
    assert.equal(never.ok, true)
    assert.equal(never.photoMissing, true)
  })
})
