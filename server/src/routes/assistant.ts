/**
 * Assistant routes.
 *
 * Proxies LLM queries to Ollama (or other providers) and logs them.
 * Proxies LLM queries to Ollama and logs them to the database.
 * Mirrors: logAssistantQuery, getAssistantQueries, getAssistantQueryCount
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'

export const assistantRouter = Router()

// System prompt for the negotiation assistant (same as Edge Function)
const SYSTEM_PROMPT = `You are an assistant supporting a participant in a multi-issue negotiation experiment.

Your role:
- Help the participant think through their options and trade-offs
- Answer questions about negotiation strategy and tactics
- Keep responses concise (2-3 sentences maximum)

Important constraints:
- You do NOT have access to either party's specific point values, priorities, or payoff tables. If asked about specific numbers or what to offer, say that you do not have this information.
- Do not recommend a specific strategy orientation (competitive or collaborative). Help the participant reason through their own approach.
- Do not make decisions for the participant or tell them what to accept or reject.
- Do not speculate about what the other party values or wants.

Context: The participant is negotiating over multiple issues with another person. Each issue has several options. Different options are worth different amounts to each party, but you do not know these values.`

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
        model: process.env.LLM_MODEL || 'llama3.1:8b',
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
    const model = process.env.LLM_MODEL || 'llama3.1:8b'

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
      { role: 'system', content: SYSTEM_PROMPT },
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
          options: { num_predict: 300, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(60_000),
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
        res.status(503).json({
          error: 'assistant_warming',
          message: 'The assistant is starting up — try again in a moment.',
        })
        return
      }
      res.status(502).json({ error: `LLM error ${llmRes.status}: ${text}` })
      return
    }

    const llmData = await llmRes.json() as {
      message?: { content?: string }
      eval_count?: number
      prompt_eval_count?: number
    }

    const responseText = llmData.message?.content || 'No response generated'
    const tokensUsed = (llmData.eval_count || 0) + (llmData.prompt_eval_count || 0)
    const responseTimeMs = Date.now() - startTime

    // Log query to assistant_queries table
    pool.query(
      `INSERT INTO assistant_queries (id, session_id, participant_id, query_text, response_text, tokens_used, response_time_ms)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)`,
      [sessionId, participantId, userQuery, responseText, tokensUsed, responseTimeMs]
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
      })]
    ).catch(() => {})

    res.json({
      response: responseText,
      tokensUsed,
      responseTimeMs,
      queriesRemaining: 999,
      provider: 'ollama',
      model,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Assistant query error:', msg)
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
