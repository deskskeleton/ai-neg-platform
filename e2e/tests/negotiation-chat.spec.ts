/**
 * negotiation-chat.spec.ts
 *
 * Covers: Real-time chat between two participants via Socket.IO.
 * Uses two browser contexts — one per participant.
 *
 * Assertions:
 *   - A message sent by P1 appears in P2's window (Socket.IO delivery)
 *   - Scenario information is visible (issue labels, role labels)
 *   - Role labels show scenario-specific names, not generic "Project Manager"/"Developer"
 *   - Chat textarea stays focused after sending a message
 */

import { test, expect, type Browser } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';
import { createMatchedPair, negotiateUrl } from '../fixtures/test-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

test('message sent by P1 appears in P2 window', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // Both navigate to the negotiation page
    await pageA.goto(negotiateUrl(pair.sessionId, pair.p1.id));
    await pageB.goto(negotiateUrl(pair.sessionId, pair.p2.id));

    // Wait for chat interface to load
    const textareaA = pageA.locator('textarea').first();
    await expect(textareaA).toBeVisible({ timeout: 15_000 });

    const msg = `hello-${Date.now()}`;
    await textareaA.fill(msg);
    await textareaA.press('Enter');

    // The message should appear in P2's window via Socket.IO
    await expect(pageB.getByText(msg)).toBeVisible({ timeout: 15_000 });

    // The message should also appear in P1's window (echo)
    await expect(pageA.getByText(msg)).toBeVisible({ timeout: 5_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('chat textarea stays focused after sending a message', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await page.goto(negotiateUrl(pair.sessionId, pair.p1.id));

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill('focus test message');
    await textarea.press('Enter');

    // After send, textarea should still be focused
    await expect(textarea).toBeFocused({ timeout: 5_000 });
  } finally {
    await ctx.close();
  }
});

test('scenario info panel shows issue labels (not generic names)', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await page.goto(negotiateUrl(pair.sessionId, pair.p1.id));

    // The payoff table or scenario info should be visible
    await expect(page.locator('text=/issue|topic|agenda/i').first()).toBeVisible({ timeout: 15_000 });

    // Generic fallback labels we want to avoid
    const body = await page.textContent('body');
    // Should not show purely generic "Issue 1" / "Issue 2" labels
    // (It's OK if numbered but they should have descriptive names alongside)
    expect(body).not.toMatch(/^Issue 1$/m);
  } finally {
    await ctx.close();
  }
});

test('role labels are scenario-specific, not generic Project Manager/Developer', async ({ browser, request }: { browser: Browser; request: never }) => {
  const pair = await createMatchedPair(request as never);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto(negotiateUrl(pair.sessionId, pair.p1.id));
    await expect(pageA.locator('textarea').first()).toBeVisible({ timeout: 15_000 });

    const body = await pageA.textContent('body') ?? '';
    // The role labels should not be the old generic defaults
    expect(body).not.toMatch(/Project Manager/);
    expect(body).not.toMatch(/\bDeveloper\b/);
  } finally {
    await ctxA.close();
  }
});
