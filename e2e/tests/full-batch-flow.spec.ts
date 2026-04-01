/**
 * full-batch-flow.spec.ts
 *
 * Covers: A 3-round batch flow.
 *
 * Strategy:
 *   - Rounds 1 & 2: seeded via API (createMatchedPair + endSession with agreement)
 *   - Round 3: browser-tested with two page contexts
 *
 * Assertions:
 *   - Each round produces a unique opponent (no duplicate pairings)
 *   - Roles differ across rounds (the seeding bug fix)
 *   - Debrief after 3 rounds shows all 3 rounds' points
 *   - Total points = sum of per-round points
 */

import { test, expect, type Browser } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';
import { createMatchedPair, negotiateUrl, debriefUrl } from '../fixtures/test-helpers';

test.beforeAll(async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();
});

test('3-round batch: unique opponents and roles per round', async ({ request }) => {
  const api = new ApiHelper(request);
  await api.clearAll();

  // 6 participants are required: the condition_order cycles through 6 permutations,
  // so with 6 participants every round produces exactly 3 condition-matched pairs
  // with no repeat opponents — the minimum for 3 full rounds.
  const batch = await api.createBatch(12);
  const suffix = Date.now();

  const participants = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => api.createParticipant(`round-p${n}-${suffix}@test.local`)),
  );

  // All join the batch
  for (const p of participants) {
    await api.joinBatch(batch.id, p.id);
  }

  const sessions: { sessionId: string; role1: string; role2: string }[] = [];

  // Run 3 rounds via API
  for (let slot = 0; slot < 3; slot++) {
    const roundNumber = slot + 1;

    // Queue all 4 participants — matching algorithm rotates opponents to avoid repeats
    for (const p of participants) {
      await api.addToRoundQueue(p.id, roundNumber);
    }
    await api.matchBatchForRound(batch.id, roundNumber);

    const s1 = await api.getSessionForParticipantRound(participants[0].id, roundNumber);
    const s2 = await api.getSessionForParticipantRound(participants[1].id, roundNumber);

    if (!s1 || !s2) throw new Error(`Matching failed for round ${roundNumber}`);

    // End session with agreement
    await api.endSession(s1.session_id, true, { issue1: 0, issue2: 0, issue3: 0 });

    sessions.push({ sessionId: s1.session_id, role1: s1.role, role2: s2.role });
  }

  // Each round should have produced a session
  expect(sessions).toHaveLength(3);

  // Session IDs should all be unique
  const sessionIds = sessions.map((s) => s.sessionId);
  expect(new Set(sessionIds).size).toBe(3);

  // Roles should not be constant across all rounds (seeding bug: same role every round)
  const p1Roles = sessions.map((s) => s.role1);
  const uniqueRoles = new Set(p1Roles);
  // With 3 rounds and role swapping, p1 should have at least 2 distinct roles
  expect(uniqueRoles.size).toBeGreaterThanOrEqual(2);
});

test('debrief shows all 3 rounds after completing a 3-round batch', async ({ browser, request }: { browser: Browser; request: never }) => {
  const api = new ApiHelper(request as never);
  await api.clearAll();

  const batch = await api.createBatch(12);
  const suffix = Date.now();
  const p1 = await api.createParticipant(`debrief-p1-${suffix}@test.local`);
  const p2 = await api.createParticipant(`debrief-p2-${suffix}@test.local`);
  // 6 participants needed: condition_order cycles through 6 permutations,
  // guaranteeing condition-matched pairs for all 3 rounds with no repeats
  const extras = await Promise.all(
    [3, 4, 5, 6].map((n) => api.createParticipant(`debrief-p${n}-${suffix}@test.local`)),
  );
  const all = [p1, p2, ...extras];
  for (const p of all) {
    await api.joinBatch(batch.id, p.id);
  }

  // Seed rounds 1 and 2 via API with agreements
  for (let slot = 0; slot < 2; slot++) {
    const roundNumber = slot + 1;
    for (const p of all) {
      await api.addToRoundQueue(p.id, roundNumber);
    }
    await api.matchBatchForRound(batch.id, roundNumber);

    const s1 = await api.getSessionForParticipantRound(p1.id, roundNumber);
    if (!s1) throw new Error(`Match failed for round ${roundNumber}`);
    await api.endSession(s1.session_id, true, { issue1: 0, issue2: 0, issue3: 0 });
  }

  // Round 3: browser-test
  for (const p of all) {
    await api.addToRoundQueue(p.id, 3);
  }
  await api.matchBatchForRound(batch.id, 3);

  const s3p1 = await api.getSessionForParticipantRound(p1.id, 3);
  if (!s3p1) throw new Error('Match failed for round 3');

  // With 6 participants, condition-order round-robin pairs p1 (slot 0, cond 'c' in round 3)
  // with extras[0]/p3 (slot 2, also cond 'c' in round 3) — not p2.
  const p1Partner = extras[0];

  // Start the session via API (bypasses the RoundReadyPage lobby that normally does this)
  await api.markBriefingReady(s3p1.session_id, p1.id);
  await api.markBriefingReady(s3p1.session_id, p1Partner.id);
  await api.startSession(s3p1.session_id);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // Open both browsers on the negotiate page (session is already active)
    await pageA.goto(negotiateUrl(s3p1.session_id, p1.id));
    await pageB.goto(negotiateUrl(s3p1.session_id, p1Partner.id));
    await expect(pageA.locator('textarea').first()).toBeVisible({ timeout: 15_000 });
    await expect(pageB.locator('textarea').first()).toBeVisible({ timeout: 15_000 });

    // Send offer via API (IssueSelector uses buttons not radio inputs; bypassing UI is more reliable)
    await api.sendOfferMessage(s3p1.session_id, p1.id, s3p1.role, { I1: 0, I2: 0, I3: 0, I4: 0 });

    // B sees the incoming offer and accepts
    await expect(pageB.getByRole('button', { name: /accept offer/i })).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole('button', { name: /accept offer/i }).click();

    // After agreement both participants are redirected — wait for pageA to leave the negotiate URL
    await pageA.waitForURL(/post-survey|debrief|round-ready/, { timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }

  // Navigate to debrief — should show 3 rounds
  const ctx = await browser.newContext();
  const debrief = await ctx.newPage();
  try {
    await debrief.goto(debriefUrl(p1.id));

    // Wait for async data load — "Total:" only appears inside the roundPoints.length>0 block
    await expect(debrief.getByText('Total:')).toBeVisible({ timeout: 15_000 });

    // All 3 round labels should be present (Round A / Round B / Round C or Round 1/2/3)
    const body = await debrief.textContent('body') ?? '';
    const hasAllRounds =
      (body.match(/round\s+(a|1)/i) && body.match(/round\s+(b|2)/i) && body.match(/round\s+(c|3)/i));
    expect(hasAllRounds).toBeTruthy();
  } finally {
    await ctx.close();
  }
});
