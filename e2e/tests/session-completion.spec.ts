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
import { createMatchedPair, negotiateUrl, postSurveyUrl, debriefUrl } from '../fixtures/test-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

async function buildAndSendOffer(page: import('@playwright/test').Page) {
  // Open offer panel if collapsed
  const offerPanelBtn = page.getByRole('button', { name: /formal offers/i });
  if (await offerPanelBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await offerPanelBtn.click();
  }

  const makeOfferBtn = page.getByRole('button', { name: /make offer|build offer/i });
  if (await makeOfferBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await makeOfferBtn.click();
  }

  // Select first radio for each issue
  const radios = page.locator('input[type="radio"]');
  const count = await radios.count();
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const name = await radios.nth(i).getAttribute('name');
    if (name && !seen.has(name)) {
      seen.add(name);
      await radios.nth(i).click();
    }
  }

  await page.getByRole('button', { name: /submit offer|counter/i }).first().click();
  // Confirm modal
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

  // End the session with an agreement via API
  await api.endSession(pair.sessionId, true, { issue1: 0, issue2: 1, issue3: 0 });

  // Navigate directly to post-survey
  await page.goto(postSurveyUrl(pair.sessionId, pair.p1.id));

  // Should NOT say "no agreements made" in the points sidebar
  await expect(page.getByText(/no agreements made/i)).not.toBeVisible({ timeout: 10_000 });

  // Should show some numeric points value
  await expect(page.getByText(/\d+\s*(pts|points)/i)).toBeVisible({ timeout: 10_000 });
});

test('debrief page shows non-zero points after agreement', async ({ page, request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  const pair = await createMatchedPair(request);
  await api.endSession(pair.sessionId, true, { issue1: 0, issue2: 1, issue3: 0 });

  await page.goto(debriefUrl(pair.p1.id));

  // Debrief should mention a numeric point value
  await expect(page.getByText(/\d+/)).toBeVisible({ timeout: 15_000 });

  // Should NOT say "no agreements" across all rounds
  const text = await page.textContent('body') ?? '';
  // At least one round should show a non-zero points value (not all zeros or all "No agreement")
  expect(text).not.toMatch(/0 pts.*0 pts.*0 pts/s);
});
