import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEmailConfig } from '../email/config.ts'
import {
  summarizeEmailReadiness,
  dnsRecordsFor,
  type SesIdentitySnapshot,
  type SesAccountSnapshot,
} from '../email/readiness.ts'

const ROLE = 'arn:aws:iam::147997129811:role/peptsci-dashboard-ses-sender'

const liveConfig = () =>
  resolveEmailConfig({
    EMAIL_ENABLED: 'true',
    EMAIL_FROM: 'no-reply@peptsci.com',
    EMAIL_AWS_ROLE_ARN: ROLE,
    EMAIL_AWS_REGION: 'us-east-1',
  })

const verifiedIdentity: SesIdentitySnapshot = {
  verified: true,
  verificationStatus: 'SUCCESS',
  dkimStatus: 'SUCCESS',
  dkimTokens: ['tok1', 'tok2', 'tok3'],
  mailFromDomain: 'mail.peptsci.com',
  mailFromStatus: 'SUCCESS',
  sendingEnabled: true,
}

const prodAccount: SesAccountSnapshot = {
  productionAccess: true,
  sendingEnabled: true,
  enforcementStatus: 'HEALTHY',
  max24HourSend: 50000,
  maxSendRate: 14,
  sentLast24Hours: 12,
}

describe('summarizeEmailReadiness', () => {
  test('fully configured, verified, production account → ready with no blockers', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: verifiedIdentity,
      account: prodAccount,
      onVercel: true,
    })
    assert.equal(r.ready, true)
    assert.deepEqual(r.blockers, [])
    assert.deepEqual(r.warnings, [])
  })

  test('EMAIL_ENABLED off is a blocker even when AWS is perfect', () => {
    const cfg = resolveEmailConfig({ EMAIL_AWS_ROLE_ARN: ROLE })
    const r = summarizeEmailReadiness({
      config: cfg,
      identity: verifiedIdentity,
      account: prodAccount,
      onVercel: true,
    })
    assert.equal(r.ready, false)
    assert.ok(r.blockers.some((b) => b.includes('EMAIL_ENABLED')))
  })

  test('on Vercel without EMAIL_AWS_ROLE_ARN there are no credentials → blocker', () => {
    const cfg = resolveEmailConfig({ EMAIL_ENABLED: 'true' })
    const r = summarizeEmailReadiness({
      config: cfg,
      identity: verifiedIdentity,
      account: prodAccount,
      onVercel: true,
    })
    assert.ok(r.blockers.some((b) => b.includes('EMAIL_AWS_ROLE_ARN')))
  })

  test('local dev without the role is fine (default chain)', () => {
    const cfg = resolveEmailConfig({ EMAIL_ENABLED: 'true' })
    const r = summarizeEmailReadiness({
      config: cfg,
      identity: verifiedIdentity,
      account: prodAccount,
      onVercel: false,
    })
    assert.equal(r.ready, true)
  })

  test('missing identity → blocker naming the domain and region', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: null,
      account: prodAccount,
      onVercel: true,
    })
    assert.equal(r.ready, false)
    assert.ok(r.blockers.some((b) => b.includes('"peptsci.com"') && b.includes('us-east-1')))
  })

  test('unverified identity → blocker with statuses; DKIM CNAMEs still listed', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: { ...verifiedIdentity, verified: false, verificationStatus: 'PENDING', dkimStatus: 'PENDING' },
      account: prodAccount,
      onVercel: true,
    })
    assert.equal(r.ready, false)
    assert.ok(r.blockers.some((b) => b.includes('PENDING')))
    assert.equal(r.dnsRecords.filter((d) => d.type === 'CNAME').length, 3)
  })

  test('sandbox account → blocker; paused sending → blocker', () => {
    const sandbox = summarizeEmailReadiness({
      config: liveConfig(),
      identity: verifiedIdentity,
      account: { ...prodAccount, productionAccess: false },
      onVercel: true,
    })
    assert.ok(sandbox.blockers.some((b) => /sandbox/i.test(b)))

    const paused = summarizeEmailReadiness({
      config: liveConfig(),
      identity: verifiedIdentity,
      account: { ...prodAccount, sendingEnabled: false, enforcementStatus: 'PROBATION' },
      onVercel: true,
    })
    assert.ok(paused.blockers.some((b) => b.includes('PROBATION')))
  })

  test('pending MAIL FROM is only a warning, not a blocker', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: { ...verifiedIdentity, mailFromStatus: 'PENDING' },
      account: prodAccount,
      onVercel: true,
    })
    assert.equal(r.ready, true)
    assert.ok(r.warnings.some((w) => w.includes('mail.peptsci.com')))
  })

  test('near quota → warning', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: verifiedIdentity,
      account: { ...prodAccount, sentLast24Hours: 45000 },
      onVercel: true,
    })
    assert.ok(r.warnings.some((w) => /quota/i.test(w)))
  })

  test('AWS lookup failure surfaces as a blocker and suppresses identity/account checks', () => {
    const r = summarizeEmailReadiness({
      config: liveConfig(),
      identity: undefined,
      account: undefined,
      awsError: 'AccessDenied',
      onVercel: true,
    })
    assert.equal(r.blockers.length, 1)
    assert.ok(r.blockers[0].includes('AccessDenied'))
  })
})

describe('dnsRecordsFor', () => {
  test('emits DKIM CNAMEs, MAIL FROM MX/SPF, and a DMARC record', () => {
    const records = dnsRecordsFor('peptsci.com', 'us-east-1', verifiedIdentity)
    const byType = (t: string) => records.filter((r) => r.type === t)
    assert.equal(byType('CNAME').length, 3)
    assert.equal(byType('CNAME')[0].name, 'tok1._domainkey.peptsci.com')
    assert.equal(byType('CNAME')[0].value, 'tok1.dkim.amazonses.com')
    assert.equal(byType('MX').length, 1)
    assert.equal(byType('MX')[0].name, 'mail.peptsci.com')
    assert.equal(byType('MX')[0].value, '10 feedback-smtp.us-east-1.amazonses.com')
    const txt = byType('TXT')
    assert.ok(txt.some((r) => r.name === 'mail.peptsci.com' && r.value.includes('include:amazonses.com')))
    assert.ok(txt.some((r) => r.name === '_dmarc.peptsci.com' && r.value.startsWith('v=DMARC1')))
  })

  test('no identity yet → only the DMARC recommendation', () => {
    const records = dnsRecordsFor('peptsci.com', 'us-east-1', null)
    assert.equal(records.length, 1)
    assert.equal(records[0].name, '_dmarc.peptsci.com')
  })
})
