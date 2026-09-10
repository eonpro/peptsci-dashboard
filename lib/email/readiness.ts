// Pure diagnosis of "can this deployment send email right now?" from the
// resolved config plus snapshots of the SES identity and account. No AWS calls
// here — the admin route fetches the snapshots and hands them in, which keeps
// the reasoning unit-testable and the route thin.

import type { EmailConfig } from './config'

export interface SesIdentitySnapshot {
  /** SES `VerifiedForSendingStatus`. */
  verified: boolean
  /** SES `VerificationStatus` (PENDING | SUCCESS | FAILED | TEMPORARY_FAILURE | NOT_STARTED). */
  verificationStatus?: string
  dkimStatus?: string
  dkimTokens?: string[]
  mailFromDomain?: string
  mailFromStatus?: string
  sendingEnabled?: boolean
}

export interface SesAccountSnapshot {
  productionAccess: boolean
  sendingEnabled: boolean
  enforcementStatus?: string
  max24HourSend?: number
  maxSendRate?: number
  sentLast24Hours?: number
}

export interface DnsRecord {
  type: 'CNAME' | 'MX' | 'TXT'
  name: string
  value: string
  purpose: string
}

export interface EmailReadiness {
  /** True only when nothing blocks a real send to an arbitrary recipient. */
  ready: boolean
  blockers: string[]
  warnings: string[]
  /** Every DNS record the sending domain needs (or should have) for deliverability. */
  dnsRecords: DnsRecord[]
}

export interface ReadinessInput {
  config: EmailConfig
  /** null = identity does not exist in SES; undefined = could not be fetched. */
  identity: SesIdentitySnapshot | null | undefined
  account: SesAccountSnapshot | undefined
  /** Error message from the SES lookups, if they failed. */
  awsError?: string
  /** Whether the code is executing on Vercel (where only OIDC creds exist). */
  onVercel: boolean
}

export function dnsRecordsFor(
  domain: string,
  region: string,
  identity: SesIdentitySnapshot | null | undefined
): DnsRecord[] {
  const records: DnsRecord[] = []
  for (const token of identity?.dkimTokens ?? []) {
    records.push({
      type: 'CNAME',
      name: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`,
      purpose: 'DKIM signing (SES Easy DKIM) — required for verification',
    })
  }
  const mailFrom = identity?.mailFromDomain
  if (mailFrom) {
    records.push(
      {
        type: 'MX',
        name: mailFrom,
        value: `10 feedback-smtp.${region}.amazonses.com`,
        purpose: 'Custom MAIL FROM — bounces route back to SES',
      },
      {
        type: 'TXT',
        name: mailFrom,
        value: 'v=spf1 include:amazonses.com ~all',
        purpose: 'SPF for the MAIL FROM domain (DMARC SPF alignment)',
      }
    )
  }
  records.push({
    type: 'TXT',
    name: `_dmarc.${domain}`,
    value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; fo=1`,
    purpose: 'DMARC monitoring policy (recommended; tighten to quarantine/reject later)',
  })
  return records
}

export function summarizeEmailReadiness(input: ReadinessInput): EmailReadiness {
  const { config, identity, account, awsError, onVercel } = input
  const blockers: string[] = []
  const warnings: string[] = []

  if (!config.enabled) {
    blockers.push('EMAIL_ENABLED is not "true" — sends are logged and skipped.')
  }
  if (!config.fromAddress || !config.fromDomain) {
    blockers.push(`EMAIL_FROM "${config.from}" is not a valid sender address.`)
  }
  if (onVercel && config.credentialSource !== 'oidc-role') {
    blockers.push(
      'Running on Vercel without EMAIL_AWS_ROLE_ARN — there are no AWS credentials for SES.'
    )
  }

  if (awsError) {
    blockers.push(`SES lookup failed: ${awsError}`)
  } else {
    if (config.fromDomain) {
      if (identity === null) {
        blockers.push(
          `Identity "${config.fromDomain}" does not exist in SES (${config.region}). Create it and add the DKIM records.`
        )
      } else if (identity && !identity.verified) {
        blockers.push(
          `Identity "${config.fromDomain}" is not verified (status: ${identity.verificationStatus ?? 'unknown'}, DKIM: ${identity.dkimStatus ?? 'unknown'}). Add the DKIM CNAME records at the DNS host.`
        )
      } else if (identity && identity.sendingEnabled === false) {
        blockers.push(`Sending is disabled on identity "${config.fromDomain}".`)
      }
      if (identity?.mailFromDomain && identity.mailFromStatus && identity.mailFromStatus !== 'SUCCESS') {
        warnings.push(
          `Custom MAIL FROM "${identity.mailFromDomain}" is ${identity.mailFromStatus} — add its MX + SPF records for SPF alignment (SES falls back to amazonses.com meanwhile).`
        )
      }
    }
    if (account) {
      if (!account.sendingEnabled) {
        blockers.push(
          `SES account sending is paused (enforcement: ${account.enforcementStatus ?? 'unknown'}).`
        )
      }
      if (!account.productionAccess) {
        blockers.push(
          'SES account is in the sandbox — only verified recipient addresses can receive mail. Request production access.'
        )
      }
      if (
        account.max24HourSend !== undefined &&
        account.sentLast24Hours !== undefined &&
        account.max24HourSend > 0 &&
        account.sentLast24Hours / account.max24HourSend >= 0.8
      ) {
        warnings.push(
          `Approaching the 24h send quota (${account.sentLast24Hours}/${account.max24HourSend}).`
        )
      }
    }
  }

  const dnsRecords = config.fromDomain ? dnsRecordsFor(config.fromDomain, config.region, identity) : []

  return { ready: blockers.length === 0, blockers, warnings, dnsRecords }
}
