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
const SYSTEM_PROMPT = `You are a helpful negotiation assistant supporting a participant in a multi-issue negotiation experiment.

Your role:
- Provide strategic advice for integrative bargaining
- Help identify opportunities for value creation (win-win solutions)
- Suggest trade-offs that could benefit both parties
- Keep responses concise (2-3 sentences maximum)

Important guidelines:
- Do NOT reveal the other party's payoffs or priorities
- Focus on general negotiation principles, not specific numbers
- Encourage collaborative problem-solving
- Be supportive but don't make decisions for the participant

The negotiation involves multiple issues where parties have different priorities. 
Good outcomes come from identifying where to make concessions vs. stand firm.`

/**
 * POST /query -- query the LLM and log the result.
 * Handles all LLM query routing and response logging.
 */
assistantRouter.post('/query', async (req, res) => {
  try {
    const { sessionId, participantId, query: userQuery, conversationHistory = [] } = req.body
    if (!sessionId || !participantId || !userQuery) {
      res.status(400).json({ error: 'sessionId, participantId, and query are required' })
      return
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    const model = process.env.LLM_MODEL || 'llama3.2'

    // Build message array for Ollama's OpenAI-compatible chat endpoint
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userQuery },
    ]

    const startTime = Date.now()

    const llmRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { num_predict: 300, temperature: 0.7 },
      }),
    })

    if (!llmRes.ok) {
      const text = await llmRes.text()
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
