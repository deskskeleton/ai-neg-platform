/**
 * participant-join.spec.ts
 *
 * Covers: A participant joins a batch and lands in the lobby.
 * Assertions:
 *   - Entering a valid batch code navigates to the pre-survey or lobby
 *   - Invalid code shows an error
 *   - After join, the participant sees a waiting/lobby state
 */

import { test, expect } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

test('invalid batch code shows error', async ({ page }) => {
  await page.goto('/');
  // Fill in a bogus code
  const codeInput = page.getByPlaceholder(/code/i).or(page.getByLabel(/batch code/i));
  await codeInput.fill('XXXXXX');
  await page.getByRole('button', { name: /join|enter|start/i }).click();
  await expect(page.getByText(/not found|invalid|error/i)).toBeVisible({ timeout: 8_000 });
});

test('valid batch code leads to join flow', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const batch = await api.createBatch(12);

  await page.goto('/');
  const codeInput = page.getByPlaceholder(/code/i).or(page.getByLabel(/batch code/i));
  await codeInput.fill(batch.code);
  await page.getByRole('button', { name: /join|enter|start/i }).click();

  // Should move past the landing — either to an email/name input or a lobby
  await expect(page).not.toHaveURL('/', { timeout: 10_000 });
});

test('participant appears in batch after joining via UI', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const batch = await api.createBatch(12);

  await page.goto('/');
  const codeInput = page.getByPlaceholder(/code/i).or(page.getByLabel(/batch code/i));
  await codeInput.fill(batch.code);
  await page.getByRole('button', { name: /join|enter|start/i }).click();

  // Fill email if prompted
  const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i));
  if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await emailInput.fill(`ui-join-${Date.now()}@test.local`);
    await page.getByRole('button', { name: /continue|next|join/i }).click();
  }

  // Should reach a waiting/lobby screen — look for common waiting text
  await expect(
    page.getByText(/waiting|lobby|matched|partner|round/i),
  ).toBeVisible({ timeout: 15_000 });
});
