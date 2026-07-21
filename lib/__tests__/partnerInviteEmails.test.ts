import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  affiliateApprovedEmail,
  partnerRepInviteEmail,
  partnerTeamInviteEmail,
} from '../email/templates.ts'

const INVITE_URL = 'https://accounts.peptsci.com/accept-invitation?ticket=abc123'

describe('affiliateApprovedEmail', () => {
  test('with an invite URL: single welcome email carrying the accept link', () => {
    const { subject, html, text } = affiliateApprovedEmail({
      contactName: 'Jordan',
      orgName: 'Acme Health Partners',
      inviteUrl: INVITE_URL,
    })
    assert.match(subject, /approved/i)
    for (const body of [html, text]) {
      assert.match(body, /Acme Health Partners/)
      assert.ok(body.includes(INVITE_URL), 'body should carry the invitation link')
      assert.match(body, /30 days/)
    }
    // Program overview so the email is meaningful, not just a bare link.
    assert.match(html, /referral link/i)
    assert.match(html, /commission/i)
    // Must NOT promise a separate invitation email — this IS the invitation.
    assert.doesNotMatch(html, /separate sign-up invitation/i)
    assert.doesNotMatch(text, /separate sign-up invitation/i)
  })

  test('without an invite URL: keeps the "separate invitation" wording', () => {
    const { html, text } = affiliateApprovedEmail({
      contactName: 'Jordan',
      orgName: 'Acme Health Partners',
    })
    assert.match(html, /separate sign-up invitation/i)
    assert.match(text, /separate sign-up invitation/i)
    assert.ok(!html.includes(INVITE_URL))
  })

  test('existing account: sign-in wording, no invitation promised', () => {
    const { subject, html, text } = affiliateApprovedEmail({
      contactName: 'Jordan',
      orgName: 'Acme Health Partners',
      existingAccount: true,
    })
    assert.match(subject, /approved/i)
    for (const body of [html, text]) {
      assert.match(body, /Acme Health Partners/)
      assert.match(body, /existing PeptSci login/i)
      assert.match(body, /sign in/i)
    }
    // No invitation is coming — the account already exists.
    assert.doesNotMatch(html, /separate sign-up invitation/i)
    assert.doesNotMatch(text, /separate sign-up invitation/i)
    assert.doesNotMatch(html, /accept.*invitation/i)
  })

  test('escapes user-controlled org name in HTML', () => {
    const { html } = affiliateApprovedEmail({
      orgName: '<script>alert(1)</script>',
      inviteUrl: INVITE_URL,
    })
    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })
})

describe('partnerRepInviteEmail', () => {
  test('carries org name, invite link, and what the rep gets', () => {
    const { subject, html, text } = partnerRepInviteEmail({
      repName: 'Sam Rivera',
      orgName: 'Acme Health Partners',
      inviteUrl: INVITE_URL,
    })
    assert.match(subject, /Acme Health Partners/)
    for (const body of [html, text]) {
      assert.match(body, /Sam Rivera|Hi Sam/)
      assert.match(body, /Acme Health Partners/)
      assert.ok(body.includes(INVITE_URL))
      assert.match(body, /30 days/)
    }
    assert.match(html, /referral link/i)
    assert.match(html, /commission/i)
  })

  test('falls back to a generic greeting without a name', () => {
    const { text } = partnerRepInviteEmail({
      repName: null,
      orgName: 'Acme',
      inviteUrl: INVITE_URL,
    })
    assert.match(text, /^Hello,/)
  })
})

describe('partnerTeamInviteEmail', () => {
  test('names the org, describes the role, and links the invitation', () => {
    const { subject, html, text } = partnerTeamInviteEmail({
      name: 'Alex',
      orgName: 'Acme Health Partners',
      role: 'ADMIN',
      inviteUrl: INVITE_URL,
    })
    assert.match(subject, /Acme Health Partners/)
    for (const body of [html, text]) {
      assert.match(body, /Acme Health Partners/)
      assert.ok(body.includes(INVITE_URL))
      assert.match(body, /admin/i)
      assert.match(body, /30 days/)
    }
  })

  test('VIEWER role gets read-only wording', () => {
    const { html, text } = partnerTeamInviteEmail({
      name: 'Alex',
      orgName: 'Acme',
      role: 'VIEWER',
      inviteUrl: INVITE_URL,
    })
    assert.match(html, /view/i)
    assert.match(text, /view/i)
  })
})
