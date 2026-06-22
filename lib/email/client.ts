import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { logger } from '../logger'

// Email sending is gated behind EMAIL_ENABLED so the platform never sends mail
// until a verified SES identity + the flag are in place. When disabled, sends
// are logged and skipped (build/dev/preview safe) — mirrors the Stripe/Sentry
// "no-op when unconfigured" pattern.
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true'
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@peptsci.com'
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || undefined
const EMAIL_CONFIGURATION_SET = process.env.EMAIL_CONFIGURATION_SET || undefined
const EMAIL_AWS_REGION =
  process.env.EMAIL_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'

// Lazily constructed so importing this module never triggers AWS credential
// lookups in environments where email is disabled.
let cachedClient: SESv2Client | null = null
function getSesClient(): SESv2Client {
  if (!cachedClient) {
    cachedClient = new SESv2Client({ region: EMAIL_AWS_REGION })
  }
  return cachedClient
}

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  skipped?: boolean
  messageId?: string
  error?: string
}

export function isEmailEnabled(): boolean {
  return EMAIL_ENABLED
}

/**
 * Low-level transactional send via AWS SES v2. Never throws — returns a result
 * object so callers (webhooks, admin routes) can fire-and-forget without
 * risking a 500 if mail delivery fails.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((r) => r?.trim())
    .filter((r): r is string => Boolean(r))

  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients' }
  }

  if (!EMAIL_ENABLED) {
    logger.info('Email disabled (set EMAIL_ENABLED=true to send) — skipping', {
      to: recipients,
      subject: input.subject,
    })
    return { ok: true, skipped: true }
  }

  try {
    const replyTo = input.replyTo || EMAIL_REPLY_TO
    const command = new SendEmailCommand({
      FromEmailAddress: EMAIL_FROM,
      Destination: { ToAddresses: recipients },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      ConfigurationSetName: EMAIL_CONFIGURATION_SET,
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: input.html, Charset: 'UTF-8' },
            Text: { Data: input.text, Charset: 'UTF-8' },
          },
        },
      },
    })

    const result = await getSesClient().send(command)
    logger.info('Email sent', {
      to: recipients,
      subject: input.subject,
      messageId: result.MessageId,
    })
    return { ok: true, messageId: result.MessageId }
  } catch (error) {
    logger.error(
      'Email send failed',
      { to: recipients, subject: input.subject },
      error instanceof Error ? error : new Error(String(error))
    )
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}
