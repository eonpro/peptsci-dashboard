import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDocumentUpload,
  documentExpiryState,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
} from '../documents.ts'

describe('validateDocumentUpload', () => {
  test('accepts a valid PDF license', () => {
    const res = validateDocumentUpload({
      type: 'LICENSE',
      mime: 'application/pdf',
      size: 1024 * 1024,
    })
    assert.equal(res.ok, true)
  })

  test('accepts images (jpeg/png/webp)', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.equal(validateDocumentUpload({ type: 'DEA', mime, size: 100 }).ok, true)
    }
  })

  test('rejects unknown document types', () => {
    const res = validateDocumentUpload({ type: 'PASSPORT', mime: 'application/pdf', size: 100 })
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.code, 'BAD_TYPE')
  })

  test('rejects disallowed MIME types', () => {
    const res = validateDocumentUpload({
      type: 'LICENSE',
      mime: 'application/x-msdownload',
      size: 100,
    })
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.code, 'BAD_MIME')
  })

  test('rejects oversized files', () => {
    const res = validateDocumentUpload({
      type: 'LICENSE',
      mime: 'application/pdf',
      size: MAX_DOCUMENT_BYTES + 1,
    })
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.code, 'TOO_LARGE')
  })

  test('rejects empty files', () => {
    const res = validateDocumentUpload({ type: 'LICENSE', mime: 'application/pdf', size: 0 })
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.code, 'EMPTY')
  })

  test('DOCUMENT_TYPES includes the resale certificate', () => {
    assert.ok(DOCUMENT_TYPES.includes('RESALE_CERT'))
  })
})

describe('documentExpiryState', () => {
  const now = new Date('2026-07-11T00:00:00Z')

  test('null expiry is valid (no expiration tracked)', () => {
    assert.equal(documentExpiryState(null, now), 'valid')
  })

  test('future expiry beyond 30 days is valid', () => {
    assert.equal(documentExpiryState(new Date('2026-12-01T00:00:00Z'), now), 'valid')
  })

  test('expiry within 30 days is expiring_soon', () => {
    assert.equal(documentExpiryState(new Date('2026-07-25T00:00:00Z'), now), 'expiring_soon')
  })

  test('past expiry is expired', () => {
    assert.equal(documentExpiryState(new Date('2026-07-10T00:00:00Z'), now), 'expired')
  })
})
