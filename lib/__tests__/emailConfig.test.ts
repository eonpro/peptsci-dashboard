import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEmailConfig, extractEmailAddress } from '../email/config.ts'

describe('extractEmailAddress', () => {
  test('returns a bare address unchanged', () => {
    assert.equal(extractEmailAddress('no-reply@peptsci.com'), 'no-reply@peptsci.com')
  })

  test('pulls the address out of a display-name sender', () => {
    assert.equal(extractEmailAddress('PeptSci <no-reply@peptsci.com>'), 'no-reply@peptsci.com')
    assert.equal(extractEmailAddress('"PeptSci Orders" <orders@peptsci.com>'), 'orders@peptsci.com')
  })

  test('returns null for garbage', () => {
    assert.equal(extractEmailAddress(''), null)
    assert.equal(extractEmailAddress('not an email'), null)
    assert.equal(extractEmailAddress(undefined), null)
  })
})

describe('resolveEmailConfig', () => {
  test('defaults: disabled, peptsci sender, us-east-1, default credential chain', () => {
    const cfg = resolveEmailConfig({})
    assert.equal(cfg.enabled, false)
    assert.equal(cfg.from, 'no-reply@peptsci.com')
    assert.equal(cfg.fromAddress, 'no-reply@peptsci.com')
    assert.equal(cfg.fromDomain, 'peptsci.com')
    assert.equal(cfg.replyTo, undefined)
    assert.equal(cfg.region, 'us-east-1')
    assert.equal(cfg.configurationSet, undefined)
    assert.equal(cfg.credentialSource, 'default-chain')
    assert.equal(cfg.roleArn, undefined)
  })

  test('only the exact string "true" enables sending', () => {
    assert.equal(resolveEmailConfig({ EMAIL_ENABLED: 'true' }).enabled, true)
    assert.equal(resolveEmailConfig({ EMAIL_ENABLED: 'TRUE' }).enabled, false)
    assert.equal(resolveEmailConfig({ EMAIL_ENABLED: '1' }).enabled, false)
    assert.equal(resolveEmailConfig({ EMAIL_ENABLED: '' }).enabled, false)
  })

  test('EMAIL_FROM with a display name keeps the header but derives address + domain', () => {
    const cfg = resolveEmailConfig({ EMAIL_FROM: '  PeptSci <Orders@PeptSci.com>  ' })
    assert.equal(cfg.from, 'PeptSci <Orders@PeptSci.com>')
    assert.equal(cfg.fromAddress, 'Orders@PeptSci.com')
    assert.equal(cfg.fromDomain, 'peptsci.com')
  })

  test('blank EMAIL_FROM falls back to the default sender', () => {
    assert.equal(resolveEmailConfig({ EMAIL_FROM: '   ' }).from, 'no-reply@peptsci.com')
  })

  test('region precedence: EMAIL_AWS_REGION > AWS_REGION > AWS_DEFAULT_REGION > us-east-1', () => {
    assert.equal(
      resolveEmailConfig({ EMAIL_AWS_REGION: 'us-west-2', AWS_REGION: 'eu-west-1' }).region,
      'us-west-2'
    )
    assert.equal(resolveEmailConfig({ AWS_REGION: 'eu-west-1' }).region, 'eu-west-1')
    assert.equal(resolveEmailConfig({ AWS_DEFAULT_REGION: 'ap-south-1' }).region, 'ap-south-1')
  })

  test('EMAIL_AWS_ROLE_ARN switches to Vercel OIDC role credentials', () => {
    const arn = 'arn:aws:iam::147997129811:role/peptsci-dashboard-ses-sender'
    const cfg = resolveEmailConfig({ EMAIL_AWS_ROLE_ARN: arn })
    assert.equal(cfg.credentialSource, 'oidc-role')
    assert.equal(cfg.roleArn, arn)
  })

  test('the database role (AWS_ROLE_ARN) is NOT silently reused for email', () => {
    // The RDS role lives in a different account with no SES permissions; email
    // must opt in explicitly so a misconfiguration fails loudly, not oddly.
    const cfg = resolveEmailConfig({ AWS_ROLE_ARN: 'arn:aws:iam::631413806260:role/Vercel/db' })
    assert.equal(cfg.credentialSource, 'default-chain')
    assert.equal(cfg.roleArn, undefined)
  })

  test('optional reply-to and configuration set are trimmed and blank → undefined', () => {
    const cfg = resolveEmailConfig({
      EMAIL_REPLY_TO: ' support@peptsci.com ',
      EMAIL_CONFIGURATION_SET: ' peptsci-transactional ',
    })
    assert.equal(cfg.replyTo, 'support@peptsci.com')
    assert.equal(cfg.configurationSet, 'peptsci-transactional')
    const blank = resolveEmailConfig({ EMAIL_REPLY_TO: '', EMAIL_CONFIGURATION_SET: '  ' })
    assert.equal(blank.replyTo, undefined)
    assert.equal(blank.configurationSet, undefined)
  })
})
