/**
 * Verify Stripe configuration + connectivity from the command line.
 *
 * Usage:
 *   npm run stripe:check
 *
 * Reads STRIPE_SECRET_KEY (+ optional publishable/webhook secrets) from
 * .env.local. Never prints secret values — only presence, format, account id,
 * and connectivity latency.
 */

import { getStripeDiagnostics } from '../lib/stripe/config'

async function main() {
  const d = await getStripeDiagnostics()

  console.log('\n=== Stripe Configuration ===')
  console.log('configured:      ', d.config.isConfigured)
  console.log('mode:            ', d.environment.keyFormat ?? 'none')
  console.log('test mode:       ', d.config.isTestMode)
  console.log('secret key:      ', d.environment.hasSecretKey ? 'present' : 'MISSING')
  console.log('publishable key: ', d.environment.hasPublishableKey ? 'present' : 'missing')
  console.log('webhook secret:  ', d.environment.hasWebhookSecret ? 'present' : 'missing')
  if (d.config.accountId) console.log('account id:      ', d.config.accountId)
  if (d.config.accountName) console.log('account name:    ', d.config.accountName)
  if (d.config.error) console.log('config note:     ', d.config.error)

  console.log('\n=== Connectivity ===')
  console.log('can connect:     ', d.connectivity.canConnect)
  if (d.connectivity.latencyMs != null) console.log('latency (ms):    ', d.connectivity.latencyMs)
  if (d.connectivity.error) console.log('error:           ', d.connectivity.error)

  console.log('')
  if (!d.config.isConfigured || !d.connectivity.canConnect) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Stripe check failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
