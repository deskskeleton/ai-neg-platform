/**
 * Higher-level test helpers built on top of ApiHelper.
 *
 * These orchestrate multi-step flows (creating matched pairs, filling surveys)
 * so individual spec files stay concise.
 *
 * SELECTOR NOTES:
 * - LikertScale renders radio buttons inside role="radiogroup" with aria-label={question}.
 *   It uses a React useId() for the name attribute, NOT the field id — so
 *   locator('[name="mt1"]') will NOT work. Use getByRole('radiogroup') instead.
 * - SliderScale renders <input type="range"> with no name or stable id.
 *   Set via .fill(value) or .evaluate() on the input element.
 * - RadioGroup (SelectInput, comprehension check) renders standard radio inputs
 *   with visible text labels — use getByRole('radio', { name: /label/i }).
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

  // 5. Trigger matching (server expects 1-indexed slot, same as roundNumber)
  await api.matchBatchForRound(batch.id, roundNumber);

  // 6. Retrieve session from each participant's perspective
  const session1 = await api.getSessionForParticipantRound(p1.id, roundNumber);
  const session2 = await api.getSessionForParticipantRound(p2.id, roundNumber);

  if (!session1 || !session2) {
    throw new Error(`Matching failed for batch ${batch.id} slot ${slotIndex}`);
  }

  // 7. Start the session via API (bypasses RoundReadyPage lobby)
  await api.markBriefingReady(session1.session_id, p1.id);
  await api.markBriefingReady(session1.session_id, p2.id);
  await api.startSession(session1.session_id);

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

// ─── Likert / Slider helpers ──────────────────────────────────────────────────

/**
 * Clicks value `val` (default 4) in all LikertScale radiogroups currently
 * visible on the page.  LikertScale renders each question as a role="radiogroup"
 * with individual radio buttons labelled "{n} out of {max}".
 */
export async function fillAllLikerts(page: Page, val = 4, max = 7): Promise<void> {
  const groups = page.getByRole('radiogroup');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    await groups.nth(i).getByRole('radio', { name: `${val} out of ${max}` }).click();
  }
}

/**
 * Sets all <input type="range"> sliders on the page to `val` (default 4).
 * Used for NASA-TLX SliderScale items (1-7 scale).
 */
export async function fillAllSliders(page: Page, val = 4): Promise<void> {
  const sliders = page.locator('input[type="range"]');
  const count = await sliders.count();
  for (let i = 0; i < count; i++) {
    await sliders.nth(i).fill(String(val));
    // Trigger the onChange handler
    await sliders.nth(i).dispatchEvent('input');
    await sliders.nth(i).dispatchEvent('change');
  }
}

// ─── Pre-survey helper ────────────────────────────────────────────────────────

/**
 * Fills and submits the pre-survey for a participant already on PreSurveyPage.
 *
 * Pre-survey sections (each separated by a "Next" button):
 *   1. Demographics: age, gender (select), field of study
 *   2. Machine Trust Propensity: 6 LikertScale items (mt1..mt6)
 *   3. AI Expected Trust: 3 LikertScale items (ai1..ai3)
 *   4. Experience: 2 LikertScale items (exp_negotiation, exp_ai)
 *   → Submit
 */
export async function fillPreSurvey(page: Page): Promise<void> {
  // ── Section 1: Demographics ──────────────────────────────────────────────
  await page.getByLabel(/age/i).fill('25');

  // Gender is a SelectInput — try native <select> first, then custom
  const genderSelect = page.locator('select').filter({ hasText: /gender|select/i }).first();
  if (await genderSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await genderSelect.selectOption('prefer-not');
  } else {
    // Custom select: click container then pick option
    await page.getByLabel(/gender/i).click();
    await page.getByText('Prefer not to say').click();
  }

  await page.getByLabel(/field of study/i).fill('Computer Science');
  await page.getByRole('button', { name: /next/i }).click();

  // ── Section 2: Machine Trust (6 Likert scales) ───────────────────────────
  await fillAllLikerts(page, 4);
  await page.getByRole('button', { name: /next/i }).click();

  // ── Section 3: AI Expected Trust (3 Likert scales) ───────────────────────
  await fillAllLikerts(page, 4);
  await page.getByRole('button', { name: /next/i }).click();

  // ── Section 4: Experience (2 Likert scales) ──────────────────────────────
  await fillAllLikerts(page, 4);

  // Submit
  await page.getByRole('button', { name: /submit|complete/i }).click();
}

// ─── Per-round post-survey helper ────────────────────────────────────────────

/**
 * Fills the per-round post-survey (isMinimalMode).
 * All sections render on a single page — no section-level pagination.
 *
 * Sections (per-round, after each negotiation round):
 *   1. SVI Relationship:  4 LikertScale items
 *   2. SVI Instrumental:  4 LikertScale items (some have N/A option — we pick 4)
 *   3. NASA-TLX:          2 SliderScale items (input[type=range], 1-7)
 *   4. Comprehension:     role radio + agreement radio
 *   5. Opponent Priority: one issue radio button
 *   → "Continue" button
 */
export async function fillPostRoundSurvey(page: Page): Promise<void> {
  // Fill all 8 Likert scales (relationship + instrumental sections)
  await fillAllLikerts(page, 4);

  // Fill the 2 NASA-TLX sliders
  await fillAllSliders(page, 4);

  // Comprehension: pick the first visible role option
  const roleOptions = page.getByRole('radio').filter({ hasText: /manager|developer|pm/i });
  if (await roleOptions.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await roleOptions.first().click();
  } else {
    // RadioGroup renders as buttons — pick first available option text
    await page.getByRole('radio').first().click();
  }

  // Agreement check — pick "Yes"
  await page.getByRole('radio', { name: /yes.*agreement|reached.*agreement/i }).click();

  // Opponent priority — pick the first issue option (I1/I2/I3/I4)
  const priorityOptions = page.getByRole('radio', { name: /^I[1-4]/i });
  if (await priorityOptions.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await priorityOptions.first().click();
  } else {
    // Fallback: last radiogroup's first option
    const groups = page.getByRole('radiogroup');
    const count = await groups.count();
    await groups.nth(count - 1).getByRole('radio').first().click();
  }

  await page.getByRole('button', { name: /continue/i }).click();
}

// ─── Final post-survey helper ─────────────────────────────────────────────────

/**
 * Fills the final post-survey (2 sections with pagination).
 *
 * Final survey (once, after the last round):
 *   1. State Trust in AI (3 LikertScale items: state_ai1..state_ai3) → Next
 *   2. Feedback (optional text field)                                  → Submit & Finish
 *
 * NOTE: The submit button is gated by a 500ms timer (canSubmit) after reaching
 * section 2. The helper waits for it to become enabled.
 */
export async function fillFinalSurvey(page: Page): Promise<void> {
  // ── Section 1: State Trust in AI (3 Likert scales) ──────────────────────
  await fillAllLikerts(page, 4);
  await page.getByRole('button', { name: /next/i }).click();

  // ── Section 2: Feedback (optional) ──────────────────────────────────────
  const feedback = page.getByLabel(/comment|feedback/i);
  if (await feedback.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await feedback.fill('Test run — no feedback.');
  }

  // Wait for the 500ms submit gate to enable the button
  const submitBtn = page.getByRole('button', { name: /submit.*finish/i });
  await submitBtn.waitFor({ state: 'visible', timeout: 5_000 });
  // Poll until enabled (the canSubmit timer)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      return btn !== null && !btn.disabled;
    },
    { timeout: 5_000 },
  );
  await submitBtn.click();
}

// ─── Navigation helpers ────────────────────────────────────────────────────────

export function negotiateUrl(sessionId: string, participantId: string): string {
  return `/negotiate/${sessionId}?participant=${participantId}`;
}

export function preSurveyUrl(participantId: string, opts?: { batchId?: string; sessionId?: string }): string {
  const params = new URLSearchParams();
  if (opts?.batchId) params.set('batch', opts.batchId);
  if (opts?.sessionId) params.set('session', opts.sessionId);
  const qs = params.toString();
  return `/pre-survey/${participantId}${qs ? `?${qs}` : ''}`;
}

/**
 * Per-round post-survey URL (isMinimalMode = round param present).
 * Requires session, round, and either batch or pair_session.
 */
export function postRoundSurveyUrl(
  participantId: string,
  opts: { sessionId: string; round: number; batchId?: string; pairSessionId?: string },
): string {
  const params = new URLSearchParams({ session: opts.sessionId, round: String(opts.round) });
  if (opts.batchId) params.set('batch', opts.batchId);
  if (opts.pairSessionId) params.set('pair_session', opts.pairSessionId);
  return `/post-survey/${participantId}?${params.toString()}`;
}

/**
 * Final post-survey URL (full survey mode: no round param).
 * Pass batch or pair_session so the chat history sidebar loads.
 */
export function finalSurveyUrl(
  participantId: string,
  opts?: { batchId?: string; pairSessionId?: string },
): string {
  const params = new URLSearchParams();
  if (opts?.batchId) params.set('batch', opts.batchId);
  if (opts?.pairSessionId) params.set('pair_session', opts.pairSessionId);
  const qs = params.toString();
  return `/post-survey/${participantId}${qs ? `?${qs}` : ''}`;
}

export function debriefUrl(participantId: string): string {
  return `/debrief?participant=${participantId}`;
}
