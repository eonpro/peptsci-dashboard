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
  // SMS clause shipped in privacy §7.2
  await page.goto('/privacy')
  await expect(page.getByText(/reply\s+STOP/i).first()).toBeVisible()
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
