/**
 * Centralized Stripe configuration (adapted from the EonPro pattern).
 *
 * Provides a cached singleton Stripe client, environment validation,
 * diagnostics, and graceful fallback when Stripe is not configured.
 *
 * Model A (inline pricing): we never create Product/Price catalog objects in
 * Stripe. Stripe is a pure payment processor; the Postgres catalog + per-client
 * pricing remain the sole source of truth.
 */

import Stripe from 'stripe'
import { logger } from '@/lib/logger'
import { getConnectedAccountId } from '@/lib/stripe/connect'

// Pinned to the SDK's bundled API version. Keep in sync when bumping `stripe`.
export const STRIPE_API_VERSION = '2026-05-27.dahlia' as const

export interface StripeConfig {
  isConfigured: boolean
  isTestMode: boolean
  hasSecretKey: boolean
  hasPublishableKey: boolean
  hasWebhookSecret: boolean
  accountId?: string
  accountName?: string
  /** Connect: connected account funds settle to (STRIPE_CONNECTED_ACCOUNT_ID). */
  connectedAccountId?: string
  connectEnabled?: boolean
  error?: string
  lastValidated?: Date
}

export class StripeConfigError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'StripeConfigError'
    this.code = code
  }
}

// ── Environment resolution ──────────────────────────────────────────────────

function getStripeSecretKey(): string | undefined {
  const value = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export function getStripePublishableKey(): string | undefined {
  const value =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export function getStripeWebhookSecret(): string | undefined {
  const value = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET
  return value && value.trim().length > 0 ? value.trim() : undefined
}

// ── Client factory (singleton) ───────────────────────────────────────────────

let cachedStripeClient: Stripe | null = null

/**
 * Get the Stripe client, or null when no secret key is configured.
 * Safe to import at build time (never throws).
 */
export function getStripeClient(): Stripe | null {
  const secretKey = getStripeSecretKey()
  if (!secretKey) return null

  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30_000,
      appInfo: { name: 'peptsci-dashboard' },
    })
    logger.info('[STRIPE] Client initialized', {
      isTestMode: secretKey.includes('_test_'),
      keyPrefix: secretKey.substring(0, 7) + '...',
    })
  }

  return cachedStripeClient
}

/**
 * Get the Stripe client or throw a typed error. Use when Stripe is required.
 */
export function requireStripeClient(): Stripe {
  const client = getStripeClient()
  if (!client) {
    throw new StripeConfigError(
      'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      'STRIPE_NOT_CONFIGURED'
    )
  }
  return client
}

// ── Quick checks ──────────────────────────────────────────────────────────────

export function isStripeConfigured(): boolean {
  return !!getStripeSecretKey()
}

export function isStripeTestMode(): boolean {
  const key = getStripeSecretKey()
  return !key || key.includes('_test_')
}

// ── Validation (with cache) ─────────────────────────────────────────────────

let cachedConfig: StripeConfig | null = null
let lastCacheTime = 0
const CACHE_DURATION_MS = 5 * 60 * 1000

export async function validateStripeConfig(forceRefresh = false): Promise<StripeConfig> {
  const now = Date.now()
  if (!forceRefresh && cachedConfig && now - lastCacheTime < CACHE_DURATION_MS) {
    return cachedConfig
  }

  const secretKey = getStripeSecretKey()
  const connectedAccountId = getConnectedAccountId()
  const config: StripeConfig = {
    isConfigured: false,
    isTestMode: secretKey?.includes('_test_') ?? true,
    hasSecretKey: !!secretKey,
    hasPublishableKey: !!getStripePublishableKey(),
    hasWebhookSecret: !!getStripeWebhookSecret(),
    connectedAccountId,
    connectEnabled: !!connectedAccountId,
    lastValidated: new Date(),
  }

  if (!secretKey) {
    config.error = 'STRIPE_SECRET_KEY not found in environment'
    cachedConfig = config
    lastCacheTime = now
    return config
  }

  if (!secretKey.startsWith('sk_') && !secretKey.startsWith('rk_')) {
    config.error = 'Invalid STRIPE_SECRET_KEY format (expected sk_ or rk_)'
    cachedConfig = config
    lastCacheTime = now
    return config
  }

  try {
    const stripe = getStripeClient()!
    const account = await stripe.accounts.retrieveCurrent()
    config.isConfigured = true
    config.accountId = account.id
    config.accountName = account.business_profile?.name || account.email || undefined
    logger.info('[STRIPE] Configuration validated', {
      accountId: account.id,
      isTestMode: config.isTestMode,
    })
  } catch (error: unknown) {
    const type = (error as { type?: string })?.type
    if (type === 'StripeAuthenticationError') {
      config.error = 'Invalid Stripe API key'
    } else if (type === 'StripePermissionError') {
      // Restricted key without account read scope — still configured/usable.
      config.isConfigured = true
      config.error = 'API key has restricted permissions'
    } else {
      config.error = error instanceof Error ? error.message : 'Failed to connect to Stripe'
    }
    logger.error('[STRIPE] Configuration validation failed', { error: config.error, type })
  }

  cachedConfig = config
  lastCacheTime = now
  return config
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export async function getStripeDiagnostics(): Promise<{
  config: StripeConfig
  environment: {
    nodeEnv: string
    hasSecretKey: boolean
    hasPublishableKey: boolean
    hasWebhookSecret: boolean
    keyFormat: 'live' | 'test' | 'restricted' | null
  }
  connectivity: { canConnect: boolean; latencyMs?: number; error?: string }
}> {
  const config = await validateStripeConfig(true)
  const secretKey = getStripeSecretKey()

  const connectivity: { canConnect: boolean; latencyMs?: number; error?: string } = {
    canConnect: false,
  }

  const connectedAccountId = getConnectedAccountId()
  if (secretKey) {
    const start = Date.now()
    try {
      const stripe = getStripeClient()!
      // When Connect is enabled, verify against the connected account (where
      // funds settle); otherwise check the platform/standalone account.
      await stripe.balance.retrieve(
        undefined,
        connectedAccountId ? { stripeAccount: connectedAccountId } : undefined
      )
      connectivity.canConnect = true
      connectivity.latencyMs = Date.now() - start
    } catch (error: unknown) {
      connectivity.error = error instanceof Error ? error.message : String(error)
      connectivity.latencyMs = Date.now() - start
    }
  }

  const keyFormat = secretKey
    ? secretKey.startsWith('rk_')
      ? 'restricted'
      : secretKey.startsWith('sk_live_')
        ? 'live'
        : 'test'
    : null

  return {
    config,
    environment: {
      nodeEnv: process.env.NODE_ENV || 'unknown',
      hasSecretKey: !!secretKey,
      hasPublishableKey: !!getStripePublishableKey(),
      hasWebhookSecret: !!getStripeWebhookSecret(),
      keyFormat,
    },
    connectivity,
  }
}
