import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clerkPublishableKeyForHost } from '../clerk-host'

const LIVE = 'pk_live_example'
const TEST = 'pk_test_example'

describe('clerkPublishableKeyForHost', () => {
  it('omits a live key on localhost so clerk-js does not throw Origin errors', () => {
    assert.equal(clerkPublishableKeyForHost(LIVE, 'localhost:3000'), undefined)
    assert.equal(clerkPublishableKeyForHost(LIVE, '127.0.0.1:3000'), undefined)
    assert.equal(clerkPublishableKeyForHost(LIVE, 'localhost'), undefined)
  })

  it('keeps a live key on peptsci.com and subdomains', () => {
    assert.equal(clerkPublishableKeyForHost(LIVE, 'peptsci.com'), LIVE)
    assert.equal(clerkPublishableKeyForHost(LIVE, 'www.peptsci.com'), LIVE)
    assert.equal(clerkPublishableKeyForHost(LIVE, 'app.peptsci.com'), LIVE)
  })

  it('always keeps a test key', () => {
    assert.equal(clerkPublishableKeyForHost(TEST, 'localhost:3000'), TEST)
    assert.equal(clerkPublishableKeyForHost(TEST, 'peptsci.com'), TEST)
  })

  it('returns undefined when no key is configured', () => {
    assert.equal(clerkPublishableKeyForHost(undefined, 'peptsci.com'), undefined)
    assert.equal(clerkPublishableKeyForHost('', 'peptsci.com'), undefined)
  })

  it('uses the first forwarded host when a proxy sends a list', () => {
    assert.equal(
      clerkPublishableKeyForHost(LIVE, 'peptsci.com, localhost:3000'),
      LIVE
    )
  })
})
