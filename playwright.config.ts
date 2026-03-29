import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'docker compose -f docker-compose.yml -f docker-compose.test.yml up --build',
    url: 'http://localhost:3000/api/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
