/**
 * Playwright config for DSRI smoke tests.
 *
 * Runs against the live deployed app — no local Docker stack needed.
 * Requires GPU node booked on DSRI for LLM tests to pass.
 *
 * Usage:
 *   npx playwright test --config playwright.config.dsri.ts
 *   npx playwright test --config playwright.config.dsri.ts --ui
 *
 * If port 443 is unreachable (VPN issues), use oc port-forward:
 *   oc port-forward deployment/neg-platform 13000:3000
 *   PLAYWRIGHT_BASE_URL=http://localhost:13000 npx playwright test --config playwright.config.dsri.ts
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/smoke',
  timeout: 60_000,    // default; LLM tests override individually
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    // Use PLAYWRIGHT_BASE_URL env var to override (e.g., http://localhost:13000 via oc port-forward)
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://neg-platform.apps.dsri2.unimaas.nl',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Ignore TLS issues in case of cert edge cases on DSRI
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer block — target is already running on DSRI
});
