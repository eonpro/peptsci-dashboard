import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apiError, ApiError } from '../api-error'

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiError', () => {
  it('surfaces the server message over the fallback', async () => {
    const res = jsonResponse(
      { error: 'Bad Request', message: 'Insufficient batch stock to fulfill this order', code: 'INSUFFICIENT_BATCH_STOCK' },
      409
    )
    const err = await apiError(res, 'Failed to create label')
    assert.equal(err.message, 'Insufficient batch stock to fulfill this order')
    assert.equal(err.status, 409)
    assert.equal(err.code, 'INSUFFICIENT_BATCH_STOCK')
    assert.ok(err instanceof ApiError)
  })

  it('falls back to error field when message is missing', async () => {
    const err = await apiError(jsonResponse({ error: 'Rate limit exceeded' }, 429), 'Failed')
    assert.equal(err.message, 'Rate limit exceeded')
  })

  it('ignores boilerplate error/message values', async () => {
    const err = await apiError(
      jsonResponse({ error: 'Internal Server Error', message: 'An error occurred' }, 500),
      'Failed to load products'
    )
    assert.equal(err.message, 'Failed to load products')
  })

  it('uses the fallback for non-JSON bodies', async () => {
    const res = new Response('<html>gateway timeout</html>', { status: 504 })
    const err = await apiError(res, 'Failed to load orders')
    assert.equal(err.message, 'Failed to load orders')
    assert.equal(err.status, 504)
    assert.equal(err.code, null)
  })

  it('uses the fallback for empty or blank messages', async () => {
    const err = await apiError(jsonResponse({ message: '   ' }, 400), 'Failed to save')
    assert.equal(err.message, 'Failed to save')
  })
})
