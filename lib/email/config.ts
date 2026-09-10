// Pure resolution of the email (AWS SES) configuration from environment
// variables. Kept side-effect free so it is unit-testable and so the admin
// status endpoint can report exactly what the sender will do without touching
// AWS.

export type EmailCredentialSource =
  /** Assume `roleArn` with the Vercel OIDC token (keyless; same pattern as RDS IAM auth). */
  | 'oidc-role'
  /** Standard AWS SDK provider chain (env keys, shared config, instance role). */
  | 'default-chain'

export interface EmailConfig {
  /** Master switch — only the exact string "true" enables real sends. */
  enabled: boolean
  /** Raw From header as passed to SES; may include a display name. */
  from: string
  /** Bare address extracted from `from`, or null if unparseable. */
  fromAddress: string | null
  /** Lower-cased domain of `fromAddress` — the SES identity that must be verified. */
  fromDomain: string | null
  replyTo?: string
  region: string
  configurationSet?: string
  credentialSource: EmailCredentialSource
  roleArn?: string
}

export const DEFAULT_EMAIL_FROM = 'no-reply@peptsci.com'
export const DEFAULT_EMAIL_REGION = 'us-east-1'

type EnvLike = Record<string, string | undefined>

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Extract the bare address from a sender header. Accepts `addr@example.com`,
 * `Name <addr@example.com>` and `"Name" <addr@example.com>`.
 */
export function extractEmailAddress(header: string | undefined): string | null {
  const value = header?.trim()
  if (!value) return null
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>\s*$/)
  const candidate = angle ? angle[1] : value
  // Deliberately loose: SES does the real validation. We only need "one @ and
  // something on both sides" to derive the identity domain.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

export function resolveEmailConfig(env: EnvLike = process.env): EmailConfig {
  const from = clean(env.EMAIL_FROM) ?? DEFAULT_EMAIL_FROM
  const fromAddress = extractEmailAddress(from)
  const fromDomain = fromAddress ? fromAddress.split('@')[1]!.toLowerCase() : null

  // Email opts into the OIDC role explicitly. AWS_ROLE_ARN (the RDS role) is
  // intentionally NOT inherited: it lives in a different account with no SES
  // permissions, and reusing it would turn a config gap into a confusing
  // AccessDenied at send time.
  const roleArn = clean(env.EMAIL_AWS_ROLE_ARN)

  return {
    enabled: env.EMAIL_ENABLED === 'true',
    from,
    fromAddress,
    fromDomain,
    replyTo: clean(env.EMAIL_REPLY_TO),
    region:
      clean(env.EMAIL_AWS_REGION) ??
      clean(env.AWS_REGION) ??
      clean(env.AWS_DEFAULT_REGION) ??
      DEFAULT_EMAIL_REGION,
    configurationSet: clean(env.EMAIL_CONFIGURATION_SET),
    credentialSource: roleArn ? 'oidc-role' : 'default-chain',
    roleArn,
  }
}
