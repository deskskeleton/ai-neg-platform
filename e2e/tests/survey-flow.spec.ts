/**
 * survey-flow.spec.ts
 *
 * Covers the full participant survey lifecycle:
 *   1. Pre-survey: form fills → submit → data persisted in pre_questionnaire_data
 *   2. Per-round post-survey (isMinimalMode): form fills → submit → data in post_round_survey_data
 *   3. Final post-survey: state trust + feedback → submit → data in post_questionnaire_data → debrief
 *
 * Each test navigates directly to the survey URL (bypassing the lobby/negotiation)
 * and verifies the saved data via GET /participants/:id after submission.
 */

import { test, expect } from '@playwright/test';
import { ApiHelper } from '../fixtures/api-helpers';
import {
  createMatchedPair,
  fillPreSurvey,
  fillPostRoundSurvey,
  fillFinalSurvey,
  preSurveyUrl,
  postRoundSurveyUrl,
  finalSurveyUrl,
  debriefUrl,
} from '../fixtures/test-helpers';

test.describe('Pre-survey', () => {
  test.beforeAll(async ({ request }) => {
    await new ApiHelper(request).clearAll();
  });

  test('fills and submits pre-survey; data is persisted', async ({ page, request }) => {
    const api = new ApiHelper(request);
    const pair = await createMatchedPair(request);

    // Navigate to pre-survey with batch context so the form navigates back correctly
    await page.goto(preSurveyUrl(pair.p1.id, { batchId: pair.batch.id, sessionId: pair.sessionId }));

    // Wait for the age field to confirm the page loaded
    await expect(page.getByLabel(/age/i)).toBeVisible({ timeout: 10_000 });

    await fillPreSurvey(page);

    // After submit the page navigates away (to /join/…)
    await expect(page).not.toHaveURL(/\/pre-survey/, { timeout: 15_000 });

    // Verify data was persisted
    const participant = await api.getParticipant(pair.p1.id);
    expect(participant.pre_questionnaire_data).toBeTruthy();

    const pre = participant.pre_questionnaire_data as Record<string, unknown>;
    expect(pre.demographics).toBeTruthy();
    expect((pre.demographics as Record<string, unknown>).age).toBe(25);
    expect(pre.machine_trust).toBeTruthy();
    expect(pre.ai_expected_trust).toBeTruthy();
    expect(pre.experience).toBeTruthy();
  });
});

test.describe('Per-round post-survey', () => {
  test.beforeAll(async ({ request }) => {
    await new ApiHelper(request).clearAll();
  });

  test('fills round 1 post-survey; data is persisted in post_round_survey_data', async ({ page, request }) => {
    const api = new ApiHelper(request);
    const pair = await createMatchedPair(request);

    // End the session with an agreement so the survey has context
    await api.endSession(pair.sessionId, true, { I1: 0, I2: 1, I3: 0, I4: 0 });

    await page.goto(
      postRoundSurveyUrl(pair.p1.id, {
        sessionId: pair.sessionId,
        round: 1,
        batchId: pair.batch.id,
      }),
    );

    // Wait for at least one radiogroup (SVI questions) to appear
    await expect(page.getByRole('radiogroup').first()).toBeVisible({ timeout: 10_000 });

    await fillPostRoundSurvey(page);

    // After "Continue" the page leaves the post-survey URL
    await expect(page).not.toHaveURL(/\/post-survey/, { timeout: 15_000 });

    // Verify data was persisted
    const participant = await api.getParticipant(pair.p1.id);
    expect(participant.post_round_survey_data).toBeTruthy();

    const roundData = participant.post_round_survey_data as Record<string, unknown>;
    // Stored as { "1": { svi_relationship, svi_instrumental, nasa_tlx, ... } }
    expect(roundData['1']).toBeTruthy();
    const round1 = roundData['1'] as Record<string, unknown>;
    expect(round1.svi_relationship).toBeTruthy();
    expect(round1.nasa_tlx).toBeTruthy();
  });
});

test.describe('Final post-survey', () => {
  test.beforeAll(async ({ request }) => {
    await new ApiHelper(request).clearAll();
  });

  test('fills final survey; data persisted and redirects to debrief', async ({ page, request }) => {
    const api = new ApiHelper(request);
    const pair = await createMatchedPair(request);
    await api.endSession(pair.sessionId, true, { I1: 0, I2: 1, I3: 0, I4: 0 });

    // Final survey URL: no round param
    await page.goto(finalSurveyUrl(pair.p1.id, { batchId: pair.batch.id }));

    // Wait for the State Trust section (first radiogroup)
    await expect(page.getByRole('radiogroup').first()).toBeVisible({ timeout: 10_000 });

    await fillFinalSurvey(page);

    // Should redirect to /debrief after final submit
    await expect(page).toHaveURL(/\/debrief/, { timeout: 15_000 });

    // Verify data was persisted
    const participant = await api.getParticipant(pair.p1.id);
    expect(participant.post_questionnaire_data).toBeTruthy();

    const post = participant.post_questionnaire_data as Record<string, unknown>;
    expect(post.ai_trust_state).toBeTruthy();
    const trust = post.ai_trust_state as Record<string, unknown>;
    // fillFinalSurvey uses val=4 for all Likerts
    expect(typeof trust.ai1).toBe('number');
    expect(typeof trust.ai2).toBe('number');
    expect(typeof trust.ai3).toBe('number');
  });

  test('debrief page loads after final survey', async ({ page, request }) => {
    const api = new ApiHelper(request);
    const pair = await createMatchedPair(request);
    await api.endSession(pair.sessionId, true, { I1: 0, I2: 1, I3: 0, I4: 0 });

    await page.goto(debriefUrl(pair.p1.id));

    // Debrief should eventually show the Total: label
    await expect(page.getByText('Total:')).toBeVisible({ timeout: 15_000 });
  });
});
