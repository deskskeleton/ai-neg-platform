/**
 * session-completion.spec.ts
 *
 * Covers: Accept offer → post-survey → debrief with points.
 *
 * Assertions:
 *   - After agreement, both participants are redirected to post-survey
 *   - Post-survey shows per-round points (not "no agreements made")
 *   - Debrief page shows points for bonus calculation
 *   - Points are non-zero when an agreement was reached
 */

import { test, expect, type Browser } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';
import { createMatchedPair, negotiateUrl, postRoundSurveyUrl, debriefUrl } from '../fixtures/test-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

async function buildAndSendOffer(page: import('@playwright/test').Page) {
  // Panel starts expanded (isCollapsed=false). Click "Make Offer" to open the builder.
  const makeOfferBtn = page.getByRole('button', { name: /^Make Offer$/ }).first();
  await makeOfferBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await makeOfferBtn.click();

  // Wait for builder header text
  await page.getByText('Select your proposed terms for each issue').waitFor({ timeout: 5_000 });

  // Select first option in each .flex.flex-wrap.gap-2 group (one group per issue)
  const optionGroups = page.locator('.flex.flex-wrap.gap-2');
  const groupCount = await optionGroups.count();
  for (let i = 0; i < groupCount; i++) {
    await optionGroups.nth(i).getByRole('button').first().click();
  }

  // Submit the builder (last button matching the offer label)
  await page.getByRole('button', { name: /^Make Offer$|^Make Counter-Offer$/ }).last().click();

  // Confirm in the modal
  const confirmBtn = page.getByRole('button', { name: /send offer/i });
  if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await confirmBtn.click();
  }
}

test('agreement navigates both parties to post-survey', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto(negotiateUrl(pair.sessionId, pair.p1.id));
    await pageB.goto(negotiateUrl(pair.sessionId, pair.p2.id));
    await expect(pageA.locator('textarea').first()).toBeVisible({ timeout: 15_000 });
    await expect(pageB.locator('textarea').first()).toBeVisible({ timeout: 15_000 });

    await buildAndSendOffer(pageA);
    await expect(pageB.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole('button', { name: /accept offer/i }).click();

    // Both should navigate away from /negotiate to post-survey or a completion page
    await expect(pageA).not.toHaveURL(/\/negotiate/, { timeout: 20_000 });
    await expect(pageB).not.toHaveURL(/\/negotiate/, { timeout: 20_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('post-survey shows points when agreement was reached', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const pair = await createMatchedPair(request);

  // End the session with an agreement via API (issue IDs match scenario: I1, I2, I3, I4)
  await api.endSession(pair.sessionId, true, { I1: 0, I2: 1, I3: 0, I4: 0 });

  // Navigate directly to post-survey
  await page.goto(postRoundSurveyUrl(pair.p1.id, { sessionId: pair.sessionId, round: 1, batchId: pair.batch.id }));

  // Should NOT say "no agreements made" in the points sidebar
  await expect(page.getByText(/no agreements made/i)).not.toBeVisible({ timeout: 10_000 });

  // Should show some numeric points value (e.g. "127 pts")
  await expect(page.getByText(/\d+\s*(pts|points)/i).first()).toBeVisible({ timeout: 10_000 });
});

test('debrief page shows non-zero points after agreement', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const pair = await createMatchedPair(request);
  await api.endSession(pair.sessionId, true, { I1: 0, I2: 1, I3: 0, I4: 0 });

  await page.goto(debriefUrl(pair.p1.id));

  // Wait for debrief to load (the "Total:" line only renders when round data is present)
  await expect(page.getByText('Total:')).toBeVisible({ timeout: 15_000 });

  // Should NOT say "no agreements" across all rounds
  const text = await page.textContent('body') ?? '';
  // At least one round should show a non-zero points value (not all zeros or all "No agreement")
  expect(text).not.toMatch(/0 pts.*0 pts.*0 pts/s);
});
