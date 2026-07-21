import { test, expect } from '@playwright/test'

/**
 * Unauthenticated smoke tests — safe against any environment (no data writes).
 */

test('health endpoint reports ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.checks?.database?.status).toBe('up')
})

test('landing page renders with auth actions', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/peptsci/i)
  await expect(page.locator('a[href*="sign-in"], a[href*="sign-up"]').first()).toBeVisible()
})

test('sign-in page renders the auth widget', async ({ page }) => {
  // Clerk LIVE keys are domain-locked to the production domain, so the widget
  // cannot render on localhost (CI). Only a dev-instance key (pk_test) makes
  // this assertion meaningful there.
  test.skip(
    (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_live') &&
      (process.env.E2E_BASE_URL || 'http://localhost:3000').includes('localhost'),
    'Clerk live keys are domain-locked; widget cannot render on localhost'
  )
  await page.goto('/sign-in')
  // Clerk widget or the dev fallback — either way an email input must exist.
  await expect(page.locator('input[name="identifier"], input[type="email"]').first()).toBeVisible({
    timeout: 15_000,
  })
})

test('legal pages are public', async ({ page }) => {
  for (const path of ['/privacy', '/termsandconditions', '/refunds', '/shipping']) {
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
  }
  // SMS clause shipped in privacy §7.2 — copy reads "by replying **STOP**",
  // where the bold STOP renders as its own element.
  await page.goto('/privacy')
  await expect(page.getByText('STOP', { exact: true }).first()).toBeVisible()
})

test('protected routes redirect anonymous users to sign-in', async ({ page }) => {
  await page.goto('/shop')
  await page.waitForURL(/sign-in/)
  await page.goto('/dashboard')
  await page.waitForURL(/sign-in/)
})

test('admin APIs are not readable anonymously', async ({ request }) => {
  const res = await request.get('/api/admin/clients', { maxRedirects: 0 })
  expect([301, 302, 307, 401, 403]).toContain(res.status())
})
