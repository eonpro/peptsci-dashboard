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
