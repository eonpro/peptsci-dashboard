import { NextRequest } from 'next/server'
import { z } from 'zod'
import { GetAccountCommand, GetEmailIdentityCommand, NotFoundException } from '@aws-sdk/client-sesv2'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { getEmailConfig, getSesClient } from '@/lib/email/client'
import { sendTestEmail } from '@/lib/email'
import {
  summarizeEmailReadiness,
  type SesAccountSnapshot,
  type SesIdentitySnapshot,
} from '@/lib/email/readiness'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Admin-only email (Amazon SES) diagnostics.
 *
 *  GET  → resolved config + live SES identity/account state + a readiness
 *         verdict with the exact DNS records the sending domain needs.
 *  POST → { to, confirm: true } sends a branded test message to ONE address so
 *         ops can confirm delivery / DKIM / SPF before flipping anything on.
 *
 * Both are SUPER_ADMIN only. Nothing here mutates AWS.
 */

function onVercel(): boolean {
  return Boolean(process.env.VERCEL)
}

function environmentLabel(): string {
  return process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'local')
}

async function fetchIdentity(domain: string): Promise<SesIdentitySnapshot | null> {
  const client = await getSesClient()
  try {
    const id = await client.send(new GetEmailIdentityCommand({ EmailIdentity: domain }))
    return {
      verified: Boolean(id.VerifiedForSendingStatus),
      verificationStatus: id.VerificationStatus,
      dkimStatus: id.DkimAttributes?.Status,
      dkimTokens: id.DkimAttributes?.Tokens,
      mailFromDomain: id.MailFromAttributes?.MailFromDomain,
      mailFromStatus: id.MailFromAttributes?.MailFromDomainStatus,
    }
  } catch (error) {
    if (error instanceof NotFoundException) return null
    throw error
  }
}

async function fetchAccount(): Promise<SesAccountSnapshot> {
  const client = await getSesClient()
  const acct = await client.send(new GetAccountCommand({}))
  return {
    productionAccess: Boolean(acct.ProductionAccessEnabled),
    sendingEnabled: Boolean(acct.SendingEnabled),
    enforcementStatus: acct.EnforcementStatus,
    max24HourSend: acct.SendQuota?.Max24HourSend,
    maxSendRate: acct.SendQuota?.MaxSendRate,
    sentLast24Hours: acct.SendQuota?.SentLast24Hours,
  }
}

export async function GET() {
  const { isAuthenticated, isAdmin } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  const config = getEmailConfig()
  let identity: SesIdentitySnapshot | null | undefined
  let account: SesAccountSnapshot | undefined
  let awsError: string | undefined

  try {
    ;[identity, account] = await Promise.all([
      config.fromDomain ? fetchIdentity(config.fromDomain) : Promise.resolve(null),
      fetchAccount(),
    ])
  } catch (error) {
    awsError = error instanceof Error ? error.message : String(error)
    logger.warn('[EMAIL STATUS] SES lookup failed', { error: awsError })
  }

  const readiness = summarizeEmailReadiness({
    config,
    identity,
    account,
    awsError,
    onVercel: onVercel(),
  })

  return successResponse({
    environment: environmentLabel(),
    config,
    identity: identity ?? null,
    account: account ?? null,
    ...readiness,
  })
}

const testBodySchema = z.object({
  to: z.string().trim().email(),
  confirm: z.literal(true),
})

export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  const parsed = testBodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return errorResponse(
      'POST { "to": "you@example.com", "confirm": true } — one valid recipient required',
      400,
      'INVALID_BODY'
    )
  }

  const config = getEmailConfig()
  const result = await sendTestEmail({
    to: parsed.data.to,
    requestedBy: userId,
    environment: environmentLabel(),
    from: config.from,
  })

  logger.info('[EMAIL TEST] send attempted', {
    to: parsed.data.to,
    by: userId,
    ok: result.ok,
    skipped: result.skipped,
    messageId: result.messageId,
    error: result.error,
  })

  if (!result.ok) {
    return errorResponse(result.error || 'Send failed', 502, 'SEND_FAILED')
  }
  return successResponse({
    sent: !result.skipped,
    skipped: Boolean(result.skipped),
    messageId: result.messageId ?? null,
    from: config.from,
    to: parsed.data.to,
    note: result.skipped
      ? 'EMAIL_ENABLED is not "true" — the message was logged and skipped.'
      : 'Check the inbox (and spam) and confirm DKIM=pass in the headers.',
  })
}
