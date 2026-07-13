import { test, expect, type Page } from '@playwright/test'

/**
 * Authenticated checkout flow. Requires a dedicated test CLIENT account:
 *
 *   E2E_CLERK_EMAIL / E2E_CLERK_PASSWORD  (approved practice, Stripe TEST mode)
 *
 * Skipped entirely when credentials are not provided. IMPORTANT: only point
 * this at an environment using Stripe test keys — the card test completes a
 * real PaymentIntent with Stripe's 4242 test card.
 */
const EMAIL = process.env.E2E_CLERK_EMAIL
const PASSWORD = process.env.E2E_CLERK_PASSWORD
const RUN_PAYMENT = process.env.E2E_RUN_PAYMENT === 'true'

test.skip(!EMAIL || !PASSWORD, 'E2E_CLERK_EMAIL / E2E_CLERK_PASSWORD not set')

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.locator('input[name="identifier"], input[type="email"]').first().fill(EMAIL!)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD!)
  await page.getByRole('button', { name: /continue|sign in/i }).click()
  await page.waitForURL(/\/(shop|dashboard)/, { timeout: 30_000 })
}

test('client can browse the catalog and reach checkout with server-priced totals', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('/shop')

  // Add the first available product to the cart.
  const addButton = page.getByRole('button', { name: /add to cart/i }).first()
  await expect(addButton).toBeVisible({ timeout: 20_000 })
  await addButton.click()

  await page.goto('/shop/checkout')
  // Server-computed order summary must show a subtotal and shipping line.
  await expect(page.getByText(/subtotal/i).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/shipping/i).first()).toBeVisible()
})

test('card checkout completes with the Stripe test card', async ({ page }) => {
  test.skip(!RUN_PAYMENT, 'Set E2E_RUN_PAYMENT=true to run the paid checkout (Stripe TEST mode only)')
  await signIn(page)
  await page.goto('/shop')
  await page.getByRole('button', { name: /add to cart/i }).first().click()
  await page.goto('/shop/checkout')

  // Fill the Stripe Payment Element (inside its iframe).
  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await stripeFrame.locator('[name="number"]').fill('4242424242424242')
  await stripeFrame.locator('[name="expiry"]').fill('12/34')
  await stripeFrame.locator('[name="cvc"]').fill('123')

  await page.getByRole('button', { name: /pay|place order/i }).click()
  await expect(page.getByText(/order (confirmed|placed|#)/i).first()).toBeVisible({
    timeout: 45_000,
  })
})

test('invoice portal lists invoices for the account', async ({ page }) => {
  await signIn(page)
  await page.goto('/shop/invoices')
  await expect(
    page.getByText(/invoices|open balance|no invoices/i).first()
  ).toBeVisible({ timeout: 20_000 })
})
