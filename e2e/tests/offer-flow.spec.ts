/**
 * offer-flow.spec.ts
 *
 * Covers the offer workflow — the main regression from the live test:
 *
 *   1. P1 builds an offer → confirmation modal appears → P1 confirms
 *   2. P2 sees the offer with Accept / Reject / Counter buttons
 *   3. P2 accepts → both see agreement state
 *
 *   4. P1 builds offer → P2 rejects → P2 can make a counter-offer
 *   5. P1 sees P2's counter with Accept / Reject / Counter buttons (accept button visible)
 *   6. P1 accepts counter → agreement
 *
 * Assertion notes:
 *   - After a rejection a NEW offer from the other party must show Accept button
 *     (this was the live test bug: old rejection masked the new offer)
 *   - Confirmation modal appears before offer is sent
 *   - "Cannot be withdrawn" text is shown for own pending offer
 */

import { test, expect, type Browser } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';
import { createMatchedPair, negotiateUrl } from '../fixtures/test-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

// Helper: select all offer options (pick index 0 for every issue) and submit builder.
// Precondition: the OfferPanel must be expanded (it starts expanded; isCollapsed=false).
async function buildOffer(page: import('@playwright/test').Page) {
  // The panel starts expanded. Wait for the "Make Offer" panel button (not the builder submit).
  // This button is visible when no pending offer and showBuilder=false.
  const panelOpenBtn = page.getByRole('button', { name: /^Make Offer$|^Make Counter-Offer$/ }).first();
  await panelOpenBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await panelOpenBtn.click();

  // Now the OfferBuilder is shown. IssueSelector renders option buttons in .flex.flex-wrap.gap-2
  // groups (one group per issue). Click the first option in each group.
  await page.getByText('Select your proposed terms for each issue').waitFor({ timeout: 5_000 });
  const optionGroups = page.locator('.flex.flex-wrap.gap-2');
  const groupCount = await optionGroups.count();
  for (let i = 0; i < groupCount; i++) {
    await optionGroups.nth(i).getByRole('button').first().click();
  }

  // Click the builder submit button (also labeled "Make Offer" / "Make Counter-Offer") — last one
  await page.getByRole('button', { name: /^Make Offer$|^Make Counter-Offer$/ }).last().click();
}

test('confirmation modal appears before offer is sent', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto(negotiateUrl(pair.sessionId, pair.p1.id));
    await expect(pageA.locator('textarea').first()).toBeVisible({ timeout: 15_000 });

    await buildOffer(pageA);

    // Confirmation modal should appear
    await expect(pageA.getByText(/confirm offer/i)).toBeVisible({ timeout: 8_000 });
    await expect(pageA.getByRole('button', { name: /send offer/i })).toBeVisible();
    await expect(pageA.getByRole('button', { name: /go back/i })).toBeVisible();
  } finally {
    await ctxA.close();
  }
});

test('P1 sends offer → P2 sees Accept/Reject buttons', async ({ browser, request }: { browser: Browser; request: never }) => {
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

    // P1 builds and confirms offer
    await buildOffer(pageA);
    await pageA.getByRole('button', { name: /send offer/i }).click();

    // P2 should see Accept and Reject (or Counter) buttons
    await expect(pageB.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByRole('button', { name: /reject/i })).toBeVisible();

    // P1 should see "cannot be withdrawn" message
    await expect(pageA.getByText(/cannot be withdrawn/i)).toBeVisible({ timeout: 5_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('P2 accepts P1 offer → both see agreement', async ({ browser, request }: { browser: Browser; request: never }) => {
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

    await buildOffer(pageA);
    await pageA.getByRole('button', { name: /send offer/i }).click();
    await expect(pageB.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });

    await pageB.getByRole('button', { name: /accept offer/i }).click();

    // Both should see agreement confirmation
    await expect(pageA.getByText(/agreement reached|deal|agreed/i)).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText(/agreement reached|deal|agreed/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('reject then counter: accept button is visible on counter-offer (live test regression)', async ({ browser, request }: { browser: Browser; request: never }) => {
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

    // P1 sends offer
    await buildOffer(pageA);
    await pageA.getByRole('button', { name: /send offer/i }).click();
    await expect(pageB.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });

    // P2 rejects
    await pageB.getByRole('button', { name: /reject/i }).click();

    // After rejection the OfferPanel auto-opens the builder (showBuilder=true).
    // Wait for the builder header text which is always present in OfferBuilder.
    await pageB.getByText('Select your proposed terms for each issue').waitFor({ timeout: 8_000 });

    // Select one option per issue (first button in each .flex.flex-wrap.gap-2 group)
    const counterGroups = pageB.locator('.flex.flex-wrap.gap-2');
    const counterGroupCount = await counterGroups.count();
    for (let i = 0; i < counterGroupCount; i++) {
      await counterGroups.nth(i).getByRole('button').first().click();
    }

    // Submit the counter-offer (button is now enabled because all options selected)
    await pageB.getByRole('button', { name: /^Make Offer$|^Make Counter-Offer$/ }).last().click();

    // Confirm in the confirmation modal
    const confirmBtn = pageB.getByRole('button', { name: /send offer/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // *** Core regression: P1 must see Accept Offer button for P2's counter ***
    await expect(pageA.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });

    // P1 accepts counter → agreement
    await pageA.getByRole('button', { name: /accept offer/i }).click();
    await expect(pageA.getByText(/agreement reached|deal|agreed/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
