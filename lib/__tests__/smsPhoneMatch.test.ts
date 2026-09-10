import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MATCH_SOURCE_LABEL,
  pickClientFromCandidates,
  rankCandidates,
  type ClientCandidate,
} from '../sms/phone-match'

describe('rankCandidates', () => {
  test('dedupes by client keeping the strongest source, ordered by priority', () => {
    const cands: ClientCandidate[] = [
      { clientId: 'a', source: 'SHIPPING_PHONE' },
      { clientId: 'b', source: 'CONTACT_PHONE' },
      { clientId: 'a', source: 'PRIOR_TEXT' },
      { clientId: 'c', source: 'SUBSCRIBER' },
    ]
    assert.deepEqual(rankCandidates(cands), [
      { clientId: 'c', source: 'SUBSCRIBER' },
      { clientId: 'a', source: 'PRIOR_TEXT' },
      { clientId: 'b', source: 'CONTACT_PHONE' },
    ])
  })

  test('empty in, empty out', () => {
    assert.deepEqual(rankCandidates([]), [])
  })
})

describe('pickClientFromCandidates', () => {
  test('single candidate wins regardless of source', () => {
    assert.equal(pickClientFromCandidates([{ clientId: 'x', source: 'SHIPPING_PHONE' }]), 'x')
  })

  test('strongest source decides even when weaker sources disagree', () => {
    // We texted this number for clinic A (tracking), but clinic B also has it
    // as contact phone — the prior text is the better signal.
    const picked = pickClientFromCandidates([
      { clientId: 'b', source: 'CONTACT_PHONE' },
      { clientId: 'a', source: 'PRIOR_TEXT' },
    ])
    assert.equal(picked, 'a')
  })

  test('ambiguous at the strongest tier → null (never guess between clinics)', () => {
    const picked = pickClientFromCandidates([
      { clientId: 'a', source: 'CONTACT_PHONE' },
      { clientId: 'b', source: 'CONTACT_PHONE' },
      { clientId: 'a', source: 'SHIPPING_PHONE' },
    ])
    assert.equal(picked, null)
  })

  test('no candidates → null', () => {
    assert.equal(pickClientFromCandidates([]), null)
  })

  test('every source has a human label', () => {
    for (const s of ['SUBSCRIBER', 'PRIOR_TEXT', 'CONTACT_PHONE', 'SHIPPING_PHONE'] as const) {
      assert.ok(MATCH_SOURCE_LABEL[s].length > 0)
    }
  })
})
