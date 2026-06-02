import { z } from 'zod'

const resolveEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

const googleSheetsEnvSchema = z.object({
  spreadsheetId: z.string().min(1, 'GOOGLE_SHEETS_SPREADSHEET_ID is required'),
  apiKey: z.string().min(1, 'GOOGLE_SHEETS_API_KEY is required'),
})

export type GoogleSheetsConfig = z.infer<typeof googleSheetsEnvSchema>

let cachedGoogleSheetsConfig: GoogleSheetsConfig | null | undefined
let loggedMissingConfig = false

export const getGoogleSheetsConfig = (): GoogleSheetsConfig | null => {
  if (cachedGoogleSheetsConfig !== undefined) {
    return cachedGoogleSheetsConfig
  }

  const rawConfig = {
    spreadsheetId: resolveEnv('GOOGLE_SHEETS_SPREADSHEET_ID', 'SPREADSHEET_ID'),
    apiKey: resolveEnv('GOOGLE_SHEETS_API_KEY', 'SHEETS_API_KEY'),
  }

  const parsed = googleSheetsEnvSchema.safeParse(rawConfig)

  if (parsed.success) {
    cachedGoogleSheetsConfig = parsed.data
    return cachedGoogleSheetsConfig
  }

  if (!loggedMissingConfig) {
    console.warn(
      '[GoogleSheets] Missing configuration. Set GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_API_KEY env vars.'
    )
    loggedMissingConfig = true
  }

  cachedGoogleSheetsConfig = null
  return null
}

const stripeEnvSchema = z.object({
  secretKey: z
    .string()
    .min(1, 'STRIPE_SECRET_KEY is required')
    .refine((v) => v.startsWith('sk_') || v.startsWith('rk_'), {
      message: 'STRIPE_SECRET_KEY must start with sk_ or rk_',
    }),
  publishableKey: z.string().min(1).optional(),
  webhookSecret: z.string().min(1).optional(),
})

export type StripeEnvConfig = z.infer<typeof stripeEnvSchema>

let cachedStripeEnvConfig: StripeEnvConfig | null | undefined
let loggedMissingStripe = false

/**
 * Parse and validate Stripe environment configuration.
 * Returns null (and warns once) when Stripe is not configured, so the app and
 * build degrade gracefully without payments.
 */
export const getStripeEnvConfig = (): StripeEnvConfig | null => {
  if (cachedStripeEnvConfig !== undefined) {
    return cachedStripeEnvConfig
  }

  const parsed = stripeEnvSchema.safeParse({
    secretKey: resolveEnv('STRIPE_SECRET_KEY', 'STRIPE_API_KEY'),
    publishableKey: resolveEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_PUBLISHABLE_KEY'),
    webhookSecret: resolveEnv('STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_ENDPOINT_SECRET'),
  })

  if (parsed.success) {
    cachedStripeEnvConfig = parsed.data
    return cachedStripeEnvConfig
  }

  if (!loggedMissingStripe) {
    console.warn('[Stripe] Not configured. Set STRIPE_SECRET_KEY to enable payments.')
    loggedMissingStripe = true
  }

  cachedStripeEnvConfig = null
  return null
}
