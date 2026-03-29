/**
 * Playwright config for DSRI smoke tests.
 *
 * Runs against the live deployed app — no local Docker stack needed.
 * Longer timeouts to account for DSRI network latency and cold-start.
 *
 * Usage:
 *   npx playwright test --config playwright.config.dsri.ts
 *   npx playwright test --config playwright.config.dsri.ts --ui
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/smoke',
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'https://neg-platform.apps.dsri2.unimaas.nl',
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
