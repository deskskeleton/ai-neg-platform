/**
 * Higher-level test helpers built on top of ApiHelper.
 *
 * These orchestrate multi-step flows (creating matched pairs, filling surveys)
 * so individual spec files stay concise.
 */

import type { Page, APIRequestContext } from '@playwright/test';
import { ApiHelper, type Batch, type Participant, type RoundSession } from './api-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchedPair {
  batch: Batch;
  p1: Participant;
  p2: Participant;
  /** slot index used for this round (0-based) */
  slotIndex: number;
  /** Round session details from p1's perspective */
  session1: RoundSession;
  /** Round session details from p2's perspective */
  session2: RoundSession;
  /** Shared session ID */
  sessionId: string;
}

// ─── Pair creation ─────────────────────────────────────────────────────────────

/**
 * Creates a batch, two participants, joins them, queues them for the given
 * slot and triggers matching.  Returns both participants and their session.
 *
 * Precondition: the DB must be clean (call api.clearAll() in beforeAll).
 */
export async function createMatchedPair(
  request: APIRequestContext,
  slotIndex = 0,
): Promise<MatchedPair> {
  const api = new ApiHelper(request);

  // 1. Batch
  const batch = await api.createBatch(12);

  // 2. Participants
  const suffix = Date.now();
  const p1 = await api.createParticipant(`p1-${suffix}@test.local`);
  const p2 = await api.createParticipant(`p2-${suffix}@test.local`);

  // 3. Join batch
  await api.joinBatch(batch.id, p1.id);
  await api.joinBatch(batch.id, p2.id);

  // 4. Queue for round
  const roundNumber = slotIndex + 1;
  await api.addToRoundQueue(p1.id, roundNumber);
  await api.addToRoundQueue(p2.id, roundNumber);

  // 5. Trigger matching
  await api.matchBatchForRound(batch.id, slotIndex);

  // 6. Retrieve session from each participant's perspective
  const session1 = await api.getOrCreateRoundSession(batch.id, p1.id, roundNumber);
  const session2 = await api.getOrCreateRoundSession(batch.id, p2.id, roundNumber);

  if (!session1 || !session2) {
    throw new Error(`Matching failed for batch ${batch.id} slot ${slotIndex}`);
  }

  return {
    batch,
    p1,
    p2,
    slotIndex,
    session1,
    session2,
    sessionId: session1.session_id,
  };
}

// ─── Pre-survey helpers ────────────────────────────────────────────────────────

/**
 * Fills and submits the pre-survey form for a participant already on the
 * PreSurveyPage (navigated externally).
 *
 * Uses minimal valid answers (all Likert scales = 4, demographics filled).
 */
export async function fillPreSurvey(page: Page): Promise<void> {
  // Section 1: Demographics
  await page.getByLabel('Age').fill('25');
  await page.getByLabel('Gender').selectOption('prefer-not');
  await page.getByLabel(/field of study/i).fill('Computer Science');
  await page.getByRole('button', { name: /next/i }).click();

  // Section 2: Machine Trust (6 Likert items mt1..mt6)
  for (let i = 1; i <= 6; i++) {
    // Click the "4" radio (neutral-positive) for each item
    await page.locator(`[name="mt${i}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Section 3: AI Assistant Trust (3 items ai1..ai3)
  for (let i = 1; i <= 3; i++) {
    await page.locator(`[name="ai${i}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Section 4: Experience (2 items)
  await page.locator('[name="exp_negotiation"]').nth(3).click();
  await page.locator('[name="exp_ai"]').nth(3).click();

  // Submit
  await page.getByRole('button', { name: /submit|complete/i }).click();
}

// ─── Post-survey helpers ───────────────────────────────────────────────────────

/**
 * Fills a per-round post-survey (Relationship + Comprehension + Priority).
 * Assumes page is already on the PostSurveyPage showing the per-round form.
 */
export async function fillPostRoundSurvey(page: Page): Promise<void> {
  // Section 1: SVI Relationship items (4 Likert items svi_r1..svi_r4)
  for (let i = 1; i <= 4; i++) {
    await page.locator(`[name="svi_r${i}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Section 2: Comprehension check
  // role_check: select any option
  const roleSelect = page.locator('[name="role_check"]');
  if (await roleSelect.isVisible()) {
    await roleSelect.selectOption({ index: 0 });
  }
  // agreement_check: select any option
  const agreementSelect = page.locator('[name="agreement_check"]');
  if (await agreementSelect.isVisible()) {
    await agreementSelect.selectOption({ index: 0 });
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Section 3: Opponent priority guess — pick first option
  await page.locator('[name="opponent_priority"]').first().click();

  await page.getByRole('button', { name: /next|continue/i }).click();
}

/**
 * Fills the final post-survey sections (NASA-TLX + AI Trust + Outcomes + Feedback).
 */
export async function fillFinalSurvey(page: Page): Promise<void> {
  // NASA-TLX (6 items: mental, physical, temporal, performance, effort, frustration)
  const tlxItems = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'];
  for (const item of tlxItems) {
    await page.locator(`[name="${item}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // AI Trust (3 items: at1..at3)
  for (let i = 1; i <= 3; i++) {
    await page.locator(`[name="at${i}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // SVI Instrumental (4 items: svi_i1..svi_i4)
  for (let i = 1; i <= 4; i++) {
    await page.locator(`[name="svi_i${i}"]`).nth(3).click();
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Feedback (open text — optional)
  const feedback = page.locator('[name="feedback"]');
  if (await feedback.isVisible()) {
    await feedback.fill('Test run — no feedback.');
  }
  await page.getByRole('button', { name: /submit|complete/i }).click();
}

// ─── Navigation helpers ────────────────────────────────────────────────────────

export function negotiateUrl(sessionId: string, participantId: string): string {
  return `/negotiate/${sessionId}?participant=${participantId}`;
}

export function preSurveyUrl(sessionId: string, participantId: string): string {
  return `/pre-survey/${sessionId}?participant=${participantId}`;
}

export function postSurveyUrl(sessionId: string, participantId: string): string {
  return `/post-survey/${sessionId}?participant=${participantId}`;
}

export function debriefUrl(participantId: string): string {
  return `/debrief?participant=${participantId}`;
}
