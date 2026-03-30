/**
 * dsri-smoke.spec.ts
 *
 * Smoke tests against the live DSRI deployment.
 * Target: https://neg-platform.apps.dsri2.unimaas.nl
 *
 * Run with:
 *   npx playwright test --config playwright.config.dsri.ts --ui
 *   npx playwright test --config playwright.config.dsri.ts
 *
 * Requires latest code deployed on DSRI:
 *   oc start-build neg-platform --from-dir=. --follow --wait
 *   oc rollout restart deployment/neg-platform deployment/ollama
 *
 * Creates minimal data (a few test participants + sessions).
 * Clean up afterwards via: /admin
 *
 * Each test is self-contained — no shared state so fixture-type switching
 * (request → page) doesn't cause stale context issues.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

// ─── Session factory ────────────────────────────────────────────────────────
// Creates two participants + a started session; returns IDs.

async function createSmokeSession(request: APIRequestContext) {
  const suffix = Date.now() + Math.random().toString(36).slice(2, 6);

  const p1 = await (await request.post('/api/participants', {
    data: { email: `smoke-p1-${suffix}@dsri.local` },
  })).json() as { id: string };

  const p2 = await (await request.post('/api/participants', {
    data: { email: `smoke-p2-${suffix}@dsri.local` },
  })).json() as { id: string };

  const sessRes = await request.post('/api/sessions', {
    data: { timeLimitMinutes: 45, aiQueryLimit: 100 },
  });
  if (!sessRes.ok()) throw new Error(`Create session failed: ${await sessRes.text()}`);
  // DB column is session_code, not code
  const session = await sessRes.json() as { id: string; session_code: string };

  // available-role returns a bare string: 'pm' | 'developer' | null (not an object)
  const firstRole = await (
    await request.get(`/api/sessions/${session.id}/available-role`)
  ).json() as string;
  if (!firstRole) throw new Error('No role available on fresh session');
  const secondRole = firstRole === 'pm' ? 'developer' : 'pm';

  const j1 = await request.post('/api/sessions/join', {
    data: { sessionCode: session.session_code, participantId: p1.id, role: firstRole },
  });
  if (!j1.ok()) throw new Error(`p1 join failed (${j1.status()}): ${await j1.text()}`);

  const j2 = await request.post('/api/sessions/join', {
    data: { sessionCode: session.session_code, participantId: p2.id, role: secondRole },
  });
  if (!j2.ok()) throw new Error(`p2 join failed (${j2.status()}): ${await j2.text()}`);
  await request.post(`/api/sessions/${session.id}/start`);

  return { sessionId: session.id, participantId: p1.id };
}

// ─── 1. Infrastructure ─────────────────────────────────────────────────────

test('app health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok(), `App health failed (${res.status()}): ${await res.text()}`).toBe(true);
  console.log('✓ App is reachable on DSRI');
});

test('Ollama health: /api/assistant/health returns status ok + model loaded', async ({ request }) => {
  const res = await request.get('/api/assistant/health');
  const contentType = res.headers()['content-type'] ?? '';

  if (contentType.includes('text/html')) {
    throw new Error(
      `DSRI app returned HTML — latest code not deployed yet.\n` +
      `  oc start-build neg-platform --from-dir=. --follow --wait\n` +
      `  oc rollout restart deployment/neg-platform`,
    );
  }

  expect(
    res.status(),
    `Ollama unreachable (${res.status()}). Check:\n` +
    `  oc get pods -l app=ollama\n  oc logs -l app=ollama\n` +
    `Response: ${await res.text()}`,
  ).toBe(200);

  const body = await res.json() as {
    status: string; ollamaUrl: string; model: string; modelsAvailable: number;
  };
  expect(body.status).toBe('ok');
  expect(
    body.modelsAvailable,
    `No models in Ollama. Pull one:\n  oc exec $(oc get pod -l app=ollama -o name) -- ollama pull llama3.2:3b`,
  ).toBeGreaterThan(0);

  console.log(`✓ Ollama OK — model: ${body.model}, ${body.modelsAvailable} model(s) available`);
});

// ─── 2. LLM wiring — REST only (no browser) ────────────────────────────────

test('assistant /query returns a real LLM response', async ({ request }) => {
  // CPU inference on DSRI can take 3–5 minutes for llama3.2:3b — give it plenty of room
  test.setTimeout(360_000);

  const { sessionId, participantId } = await createSmokeSession(request);

  const res = await request.post('/api/assistant/query', {
    data: {
      sessionId,
      participantId,
      query: 'In one sentence, what is integrative bargaining?',
      conversationHistory: [],
    },
    timeout: 330_000,
  });

  expect(
    res.status(),
    `LLM query failed (${res.status()}) — Ollama not running or model not loaded.\n${await res.text()}`,
  ).toBe(200);

  const body = await res.json() as {
    response: string; tokensUsed: number; responseTimeMs: number;
    provider: string; model: string;
  };
  expect(body.response.length, 'LLM returned empty response').toBeGreaterThan(10);
  expect(body.response).not.toContain('No response generated');
  expect(body.tokensUsed).toBeGreaterThan(0);
  expect(body.provider).toBe('ollama');

  console.log(`✓ LLM responded in ${body.responseTimeMs}ms · ${body.tokensUsed} tokens · model: ${body.model}`);
  console.log(`  "${body.response.slice(0, 120)}..."`);
});

// ─── 2b. Diagnostic: verify session_participant was persisted ──────────────

test('session_participant is readable after join', async ({ request }) => {
  const { sessionId, participantId } = await createSmokeSession(request);

  // This is the same call NegotiatePage makes to load participant info
  const res = await request.get(`/api/sessions/${sessionId}/participant/${participantId}`);
  expect(
    res.status(),
    `GET /sessions/:id/participant/:pid returned ${res.status()}: ${await res.text()}`,
  ).toBe(200);
  const body = await res.json();
  expect(body, 'session_participant is null/empty after join').toBeTruthy();
  console.log(`✓ session_participant record: role=${(body as Record<string, unknown>).role}`);
});

// ─── 3. Browser: AI panel renders ──────────────────────────────────────────

test('assistant panel is visible in the negotiate page', async ({ page, request }) => {
  const { sessionId, participantId } = await createSmokeSession(request);

  await page.goto(`/negotiate/${sessionId}?participant=${participantId}`);

  // AssistantPanel header title: "AI Assistant" (from LLM_CONFIG.ui.panelTitle)
  await expect(
    page.getByText('AI Assistant').first(),
  ).toBeVisible({ timeout: 20_000 });

  // AssistantPanel uses <input type="text">, chat uses <textarea>
  const assistantInput = page.locator('input[type="text"]').last();
  await expect(assistantInput).toBeVisible({ timeout: 10_000 });
  await expect(assistantInput).toBeEnabled();

  console.log('✓ AI panel rendered and input is active');
});

// ─── 4. Browser: full E2E — type → Thinking… → response ───────────────────

test('typing a question shows Thinking… then an LLM response bubble', async ({ page, request }) => {
  // CPU inference on DSRI can take 3–5 minutes for llama3.2:3b on CPU
  test.setTimeout(360_000);

  const { sessionId, participantId } = await createSmokeSession(request);

  await page.goto(`/negotiate/${sessionId}?participant=${participantId}`);

  await expect(page.getByText('AI Assistant').first()).toBeVisible({ timeout: 20_000 });

  // Wait until the input is enabled (component fully initialised) before sending
  const assistantInput = page.locator('input[type="text"]').last();
  await expect(assistantInput).toBeEnabled({ timeout: 15_000 });

  await assistantInput.fill('What is a good opening strategy in a multi-issue negotiation?');
  await assistantInput.press('Enter');

  // Spinner must appear promptly after send
  await expect(page.getByText('Thinking...')).toBeVisible({ timeout: 10_000 });

  // Wait for model response — CPU inference on DSRI can take 3–5 minutes
  await expect(page.getByText('Thinking...')).not.toBeVisible({ timeout: 330_000 });

  // "Assistant" label inside each response bubble (MessageBubble component)
  await expect(page.getByText('Assistant').first()).toBeVisible({ timeout: 10_000 });

  // Confirm no error state shown
  await expect(page.getByText(/Failed to get response/i)).not.toBeVisible();

  console.log('✓ LLM response rendered in browser — Ollama ↔ app ↔ UI wiring confirmed');
});
