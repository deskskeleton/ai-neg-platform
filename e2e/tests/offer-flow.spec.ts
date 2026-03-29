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

// Helper: open the Formal Offers panel if it's collapsed
async function expandOfferPanel(page: import('@playwright/test').Page) {
  const header = page.getByRole('button', { name: /formal offers/i });
  if (await header.isVisible({ timeout: 3_000 }).catch(() => false)) {
    // Check if collapsed (ChevronDown visible)
    const isCollapsed = await page.locator('button:has-text("Formal Offers") svg').first().isVisible();
    if (isCollapsed) await header.click();
  }
}

// Helper: select all offer options (pick index 0 for every issue)
async function buildOffer(page: import('@playwright/test').Page) {
  await expandOfferPanel(page);

  // Click "Make Offer" button to open builder
  const makeOfferBtn = page.getByRole('button', { name: /make offer|build offer/i });
  if (await makeOfferBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await makeOfferBtn.click();
  }

  // Select first option for every issue (radio buttons or select)
  const radios = page.locator('.offer-builder input[type="radio"], [data-offer-builder] input[type="radio"]');
  const radioCount = await radios.count();
  if (radioCount > 0) {
    // Group radios by name and pick first of each group
    const names = new Set<string>();
    for (let i = 0; i < radioCount; i++) {
      const name = await radios.nth(i).getAttribute('name');
      if (name && !names.has(name)) {
        names.add(name);
        await radios.nth(i).click();
      }
    }
  } else {
    // Fallback: pick first option in any select inside the builder
    const selects = page.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      await selects.nth(i).selectOption({ index: 0 });
    }
  }

  // Click submit/send in builder
  await page.getByRole('button', { name: /submit offer|send offer|counter/i }).first().click();
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

    // P2 should now see the offer builder for a counter-offer
    await expect(pageB.getByRole('button', { name: /submit offer|counter/i }).first()).toBeVisible({ timeout: 8_000 });

    // P2 sends counter-offer
    await buildOffer(pageB);
    // After buildOffer the confirmation modal appears
    const confirmBtn = pageB.getByRole('button', { name: /send offer/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

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
