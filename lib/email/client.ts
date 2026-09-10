import { SESv2Client, SendEmailCommand, type SESv2ClientConfig } from '@aws-sdk/client-sesv2'
import { logger } from '../logger'
import { resolveEmailConfig, type EmailConfig } from './config'

// Email sending is gated behind EMAIL_ENABLED so the platform never sends mail
// until a verified SES identity + the flag are in place. When disabled, sends
// are logged and skipped (build/dev/preview safe) — mirrors the Stripe/Sentry
// "no-op when unconfigured" pattern.
const config: EmailConfig = resolveEmailConfig()

/** The resolved (env-derived) email configuration. Safe to expose to admins. */
export function getEmailConfig(): EmailConfig {
  return config
}

/**
 * Credentials for SES.
 *
 * On Vercel there are no static AWS keys: the platform authenticates to AWS by
 * exchanging the Vercel OIDC token for a role session (see lib/db-url.ts for
 * the RDS equivalent). `EMAIL_AWS_ROLE_ARN` names a role whose trust policy
 * accepts that token and whose permissions are scoped to ses:SendEmail on the
 * verified identity. Without it we fall back to the SDK default chain, which
 * covers local dev (`aws configure`) and any environment with AWS_ACCESS_KEY_ID.
 *
 * `@vercel/functions/oidc` is imported lazily so it never loads in the edge
 * runtime or in environments that don't use it.
 */
async function resolveCredentials(): Promise<SESv2ClientConfig['credentials']> {
  if (config.credentialSource !== 'oidc-role' || !config.roleArn) return undefined
  const { awsCredentialsProvider } = await import('@vercel/functions/oidc')
  return awsCredentialsProvider({ roleArn: config.roleArn })
}

// Lazily constructed so importing this module never triggers AWS credential
// lookups in environments where email is disabled.
let cachedClient: Promise<SESv2Client> | null = null
export function getSesClient(): Promise<SESv2Client> {
  if (!cachedClient) {
    cachedClient = resolveCredentials()
      .then((credentials) => new SESv2Client({ region: config.region, credentials }))
      .catch((error) => {
        // Don't poison the cache with a failed construction.
        cachedClient = null
        throw error
      })
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
  return config.enabled
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

  if (!config.enabled) {
    logger.info('Email disabled (set EMAIL_ENABLED=true to send) — skipping', {
      to: recipients,
      subject: input.subject,
    })
    return { ok: true, skipped: true }
  }

  try {
    const replyTo = input.replyTo || config.replyTo
    const command = new SendEmailCommand({
      FromEmailAddress: config.from,
      Destination: { ToAddresses: recipients },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      ConfigurationSetName: config.configurationSet,
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

    const client = await getSesClient()
    const result = await client.send(command)
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
