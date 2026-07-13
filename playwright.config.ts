import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests run against a live deployment (preview or local dev server).
 *
 *   E2E_BASE_URL   target origin (default http://localhost:3000)
 *   E2E_CLERK_EMAIL / E2E_CLERK_PASSWORD
 *                  a test CLIENT login for authenticated flows (checkout).
 *                  Authenticated specs are skipped when unset.
 *
 * First run: npx playwright install chromium
 * Run:       npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
