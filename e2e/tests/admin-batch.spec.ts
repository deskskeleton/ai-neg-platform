/**
 * admin-batch.spec.ts
 *
 * Covers: Admin creates a batch and views it in the admin panel.
 * Assertions:
 *   - Batch list loads after page reload (persistence bug from live test)
 *   - Batch code is visible
 *   - Participant count updates after joins
 */

import { test, expect } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

test('admin panel shows batches after page reload', async ({ page, request }) => {
  const api = new ApiHelper(request);

  // Create a batch via API
  const batch = await api.createBatch(12);

  // Open admin page (no ADMIN_SECRET in test env, so no auth needed)
  await page.goto('/admin');

  // May show an auth prompt depending on env — in test env ADMIN_SECRET is empty
  // so any value (or blank) should pass; try empty submit if a form is visible
  const secretInput = page.locator('input[type="password"]');
  if (await secretInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await secretInput.fill('');
    await page.getByRole('button', { name: /login|enter|submit/i }).click();
  }

  // The batch list should be visible
  await expect(page.getByText(batch.code)).toBeVisible({ timeout: 10_000 });

  // Reload — batch must still appear (the persistence bug)
  await page.reload();
  const secretInput2 = page.locator('input[type="password"]');
  if (await secretInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await secretInput2.fill('');
    await page.getByRole('button', { name: /login|enter|submit/i }).click();
  }
  await expect(page.getByText(batch.code)).toBeVisible({ timeout: 10_000 });
});

test('participant count updates after joins', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const batch = await api.createBatch(12);
  const p1 = await api.createParticipant(`count-p1-${Date.now()}@test.local`);
  const p2 = await api.createParticipant(`count-p2-${Date.now()}@test.local`);
  await api.joinBatch(batch.id, p1.id);
  await api.joinBatch(batch.id, p2.id);

  await page.goto('/admin');
  const secretInput = page.locator('input[type="password"]');
  if (await secretInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await secretInput.fill('');
    await page.getByRole('button', { name: /login|enter|submit/i }).click();
  }

  // The batch row should show 2 participants somewhere near the batch code
  const batchRow = page.locator(`text=${batch.code}`).locator('..').locator('..');
  await expect(batchRow).toContainText('2', { timeout: 10_000 });
});
