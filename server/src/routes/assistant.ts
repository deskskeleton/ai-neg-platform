/**
 * Assistant routes.
 *
 * Proxies LLM queries to Ollama (or other providers) and logs them.
 * Proxies LLM queries to Ollama and logs them to the database.
 * Mirrors: logAssistantQuery, getAssistantQueries, getAssistantQueryCount
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'
import {
  ASSISTANT_CONFIG,
  GENERAL_COACHING_PROMPT,
  ROUND_DATA,
  buildInformedAdvisoryPrompt,
  looksLikePromptLeak,
  renderPayoffTable,
  renderRoleInstructions,
  roleSide,
  type AssistantProfile,
} from '../config/assistant.js'

export const assistantRouter = Router()

/**
 * Build the system prompt for this request. The general-coaching profile is
 * static. The informed-advisory profile injects the participant's own role
 * text, payoff table, round number, the current offer and this round's
 * visible offers/messages, all read from the database (never from the
 * client). Falls back to general-coaching when the session is not one of the
 * v1 round configurations, and reports which profile was actually used.
 */
async function buildSystemPrompt(
  sessionId: string,
  participantId: string,
): Promise<{ prompt: string; profile: AssistantProfile; contextSnapshot: string | null }> {
  if (ASSISTANT_CONFIG.profile !== 'informed-advisory') {
    return { prompt: GENERAL_COACHING_PROMPT, profile: 'general-coaching', contextSnapshot: null }
  }

  const session = await queryOne<{ negotiation_scenario: string | null; round_number: number | null; time_limit_minutes: number | null }>(
    `SELECT negotiation_scenario, round_number, time_limit_minutes FROM sessions WHERE id = $1`,
    [sessionId],
  )
  const me = await queryOne<{ role: string }>(
    `SELECT role FROM session_participants WHERE session_id = $1 AND participant_id = $2`,
    [sessionId, participantId],
  )
  const round = session?.negotiation_scenario ? ROUND_DATA[session.negotiation_scenario] : undefined
  const side = roleSide(me?.role)
  if (!round || !side) {
    return { prompt: GENERAL_COACHING_PROMPT, profile: 'general-coaching', contextSnapshot: null }
  }

  const msgs = (await query(
    `SELECT participant_id, content, message_type FROM messages
     WHERE session_id = $1 ORDER BY timestamp ASC`,
    [sessionId],
  )) as Array<{ participant_id: string; content: string; message_type: string }>

  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^📋\s*/, '').replace(/\s+/g, ' ').trim()
  const historyLines: string[] = []
  let currentOffer: string | null = null
  for (const m of msgs) {
    const who = m.participant_id === participantId ? 'You' : 'Other party'
    const text = clean(m.content)
    if (m.message_type === 'offer') {
      historyLines.push(`${who} made an offer: ${text}`)
      currentOffer = `from ${who === 'You' ? 'you' : 'the other party'}: ${text}`
    } else if (m.message_type === 'acceptance') {
      historyLines.push(`${who} accepted the offer on the table.`)
    } else if (m.message_type === 'rejection') {
      historyLines.push(`${who} rejected the offer on the table.`)
      currentOffer = null
    } else if (m.message_type === 'negotiation') {
      historyLines.push(`${who}: "${text}"`)
    }
  }

  const ctx = {
    roleInstructions: renderRoleInstructions(round, side),
    payoffTable: renderPayoffTable(round, side),
    roundNumber: session?.round_number ?? null,
    timeLimitMinutes: session?.time_limit_minutes ?? 15,
    currentOffer,
    historyLines: historyLines.slice(-30),
  }
  const prompt = buildInformedAdvisoryPrompt(ctx)
  const contextSnapshot = prompt.slice(prompt.indexOf('ROLE INSTRUCTIONS'))
  return { prompt, profile: 'informed-advisory', contextSnapshot }
}

/**
 * Record a failed assistant request. Successful responses land in
 * assistant_queries; without this, an outage mid-round would leave no trace
 * that a participant asked and got nothing, which the annotation protocol
 * needs to show. Fire-and-forget.
 */
function logAssistantError(sessionId: string, participantId: string, queryText: string, reason: string, detail: string): void {
  pool.query(
    `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
     VALUES (uuid_generate_v4(), $1, $2, 'assistant_error', $3)`,
    [sessionId, participantId, JSON.stringify({
      reason,
      detail: detail.slice(0, 300),
      query_text: queryText.slice(0, 1000),
      prompt_profile: ASSISTANT_CONFIG.profile,
      prompt_version: ASSISTANT_CONFIG.promptVersion,
      model: ASSISTANT_CONFIG.model,
    })]
  ).catch(() => {})
}

/** GET /health -- check if the Ollama service is reachable */
assistantRouter.get('/health', async (_req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      const data = await response.json() as { models?: unknown[] }
      res.json({
        status: 'ok',
        ollamaUrl,
        model: ASSISTANT_CONFIG.model,
        profile: ASSISTANT_CONFIG.profile,
        promptVersion: ASSISTANT_CONFIG.promptVersion,
        modelsAvailable: Array.isArray(data.models) ? data.models.length : 0,
      })
    } else {
      res.status(502).json({ status: 'error', ollamaUrl, message: `Ollama responded with ${response.status}` })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ status: 'unreachable', ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434', message: msg })
  }
})

/**
 * POST /query -- query the LLM and log the result.
 * Handles all LLM query routing and response logging.
 */
assistantRouter.post('/query', async (req, res) => {
  try {
    const { sessionId, participantId, query: userQuery } = req.body
    if (!sessionId || !participantId || !userQuery) {
      res.status(400).json({ error: 'sessionId, participantId, and query are required' })
      return
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    const model = ASSISTANT_CONFIG.model
    const { prompt: systemPrompt, profile, contextSnapshot } = await buildSystemPrompt(sessionId, participantId)

    // Fetch conversation history from DB (authoritative source — avoids stale client state)
    const priorQueries = await query(
      `SELECT query_text, response_text FROM assistant_queries
       WHERE session_id = $1 AND participant_id = $2
       ORDER BY timestamp ASC`,
      [sessionId, participantId]
    ) as Array<{ query_text: string; response_text: string }>

    const conversationHistory = priorQueries.flatMap((q) => [
      { role: 'user', content: q.query_text },
      { role: 'assistant', content: q.response_text },
    ])

    // Build message array for Ollama's chat endpoint
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userQuery },
    ]

    const startTime = Date.now()

    // Call Ollama with a bounded timeout. If the pod is cold or the model
    // is still being pulled, the first attempt may fail with a connection
    // error — retry once after a short delay before surfacing "warming" to
    // the client, which turns most cold-start windows invisible.
    async function callOllama(): Promise<Response> {
      return fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          // Sampling settings are frozen in server/src/config/assistant.ts.
          // num_thread must match the Ollama container's CPU limit: unpinned,
          // llama-server spawns one thread per host core inside a 4-CPU cgroup
          // and throttles (24 concurrent: 34 s p50 unpinned vs 5.4 s pinned).
          options: {
            num_predict: ASSISTANT_CONFIG.maxTokens,
            temperature: ASSISTANT_CONFIG.temperature,
            num_thread: ASSISTANT_CONFIG.numThread,
          },
        }),
        signal: AbortSignal.timeout(ASSISTANT_CONFIG.requestTimeoutMs),
      })
    }

    let llmRes: Response
    try {
      llmRes = await callOllama()
    } catch (firstErr) {
      // Network/abort error (Ollama unreachable or pod still starting).
      // Distinguish this from a valid HTTP error from Ollama itself.
      await new Promise(r => setTimeout(r, 3_000))
      try {
        llmRes = await callOllama()
      } catch (secondErr) {
        const detail = secondErr instanceof Error ? secondErr.message : String(secondErr)
        console.warn('Assistant warming (Ollama unreachable after retry):', detail, 'first:', firstErr)
        logAssistantError(sessionId, participantId, userQuery, 'unreachable', detail)
        res.status(503).json({
          error: 'assistant_warming',
          message: 'The assistant is starting up — try again in a moment.',
        })
        return
      }
    }

    if (!llmRes.ok) {
      const text = await llmRes.text()
      // "llama runner process has terminated" also looks like a warming state
      // from the user's perspective — the model loader is recovering. Classify
      // it the same way so the UI shows a soft message and retains input.
      if (llmRes.status >= 500 && /llama runner|loading model|model.*loading/i.test(text)) {
        logAssistantError(sessionId, participantId, userQuery, 'model_loading', `${llmRes.status} ${text}`)
        res.status(503).json({
          error: 'assistant_warming',
          message: 'The assistant is starting up — try again in a moment.',
        })
        return
      }
      logAssistantError(sessionId, participantId, userQuery, 'llm_error', `${llmRes.status} ${text}`)
      res.status(502).json({ error: `LLM error ${llmRes.status}: ${text}` })
      return
    }

    const llmData = await llmRes.json() as {
      message?: { content?: string }
      eval_count?: number
      prompt_eval_count?: number
      done_reason?: string
    }

    // Ollama reports done_reason "length" when the reply hit num_predict.
    // Mark it so a cut-off recommendation is not mistaken for a short one,
    // in the panel and in the export.
    const doneReason = llmData.done_reason ?? null
    const rawText = llmData.message?.content || 'No response generated'
    // Prompt-leak guard: the model reproduces its system prompt on request
    // regardless of wording. Replace such a reply with the refusal line; the
    // raw text is kept in the event log for audit.
    const guardTriggered = looksLikePromptLeak(rawText)
    const truncated = !guardTriggered && doneReason === 'length'
    const responseText = guardTriggered
      ? ASSISTANT_CONFIG.refusalLine
      : truncated ? rawText.trimEnd() + ' […]' : rawText
    const tokensUsed = (llmData.eval_count || 0) + (llmData.prompt_eval_count || 0)
    const responseTimeMs = Date.now() - startTime

    // Log query to assistant_queries table, with the instrument that produced it
    pool.query(
      `INSERT INTO assistant_queries
         (id, session_id, participant_id, query_text, response_text, tokens_used, response_time_ms,
          model, prompt_profile, prompt_version, temperature, max_tokens, done_reason, truncated, guard_triggered, context_snapshot)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [sessionId, participantId, userQuery, responseText, tokensUsed, responseTimeMs,
        model, profile, ASSISTANT_CONFIG.promptVersion, ASSISTANT_CONFIG.temperature, ASSISTANT_CONFIG.maxTokens,
        doneReason, truncated, guardTriggered, contextSnapshot]
    ).catch((err) => console.error('Failed to log assistant query:', err))

    // Log event
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'assistant_query', $3)`,
      [sessionId, participantId, JSON.stringify({
        query_length: userQuery.length,
        response_length: responseText.length,
        tokens_used: tokensUsed,
        response_time_ms: responseTimeMs,
        provider: 'ollama',
        model,
        prompt_profile: profile,
        prompt_version: ASSISTANT_CONFIG.promptVersion,
        temperature: ASSISTANT_CONFIG.temperature,
        max_tokens: ASSISTANT_CONFIG.maxTokens,
        done_reason: doneReason,
        truncated,
        guard_triggered: guardTriggered,
        raw_response: guardTriggered ? rawText : undefined,
      })]
    ).catch(() => {})

    res.json({
      response: responseText,
      tokensUsed,
      responseTimeMs,
      queriesRemaining: 999,
      provider: 'ollama',
      model,
      promptProfile: profile,
      promptVersion: ASSISTANT_CONFIG.promptVersion,
      doneReason,
      truncated,
      guardTriggered,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Assistant query error:', msg)
    const b = (req.body ?? {}) as { sessionId?: string; participantId?: string; query?: string }
    if (b.sessionId && b.participantId) logAssistantError(b.sessionId, b.participantId, String(b.query ?? ''), 'exception', msg)
    res.status(500).json({ error: msg })
  }
})

/** POST /log -- log an assistant query (used when frontend calls LLM directly) */
assistantRouter.post('/log', async (req, res) => {
  try {
    const { sessionId, participantId, queryText, responseText, tokensUsed, responseTimeMs } = req.body
    const row = await queryOne(
      `INSERT INTO assistant_queries (id, session_id, participant_id, query_text, response_text, tokens_used, response_time_ms)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sessionId, participantId, queryText, responseText, tokensUsed ?? null, responseTimeMs ?? null]
    )

    // Log event
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'assistant_query', $3)`,
      [sessionId, participantId, JSON.stringify({
        query_length: queryText?.length,
        response_length: responseText?.length,
        tokens_used: tokensUsed,
        response_time_ms: responseTimeMs,
      })]
    ).catch(() => {})

    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /queries/:sessionId/:participantId -- get all queries for a participant in a session */
assistantRouter.get('/queries/:sessionId/:participantId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM assistant_queries
       WHERE session_id = $1 AND participant_id = $2
       ORDER BY timestamp ASC`,
      [req.params.sessionId, req.params.participantId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /count/:sessionId/:participantId -- count queries for rate limiting */
assistantRouter.get('/count/:sessionId/:participantId', async (req, res) => {
  try {
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM assistant_queries
       WHERE session_id = $1 AND participant_id = $2`,
      [req.params.sessionId, req.params.participantId]
    )
    res.json(parseInt(row?.count ?? '0', 10))
  } catch (err: unknown) {
    console.error('Failed to count assistant queries:', err)
    res.json(0)
  }
})
