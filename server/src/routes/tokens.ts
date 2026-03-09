/**
 * Token routes.
 *
 * Pre-generated participant entry tokens for BEElab sessions.
 * Mirrors: getToken, claimToken, generateSessionTokens, getSessionTokens
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'

export const tokensRouter = Router()

/** GET /session/:sessionId -- get all tokens for a session */
tokensRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM participant_tokens WHERE session_id = $1 ORDER BY role ASC`,
      [req.params.sessionId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /generate/:sessionId -- generate tokens for a session (calls RPC) */
tokensRouter.post('/generate/:sessionId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM create_token_batch($1)`,
      [req.params.sessionId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:token -- get token by its short code */
tokensRouter.get('/:token', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM participant_tokens WHERE token = $1`,
      [req.params.token.toUpperCase()]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /:token/claim -- claim a token (create participant, join session) */
tokensRouter.post('/:token/claim', async (req, res) => {
  try {
    const { metadata = {} } = req.body
    const tokenCode = req.params.token.toUpperCase()

    // Get the token
    const tokenData = await queryOne<Record<string, unknown>>(
      `SELECT * FROM participant_tokens WHERE token = $1`,
      [tokenCode]
    )
    if (!tokenData) { res.status(404).json({ error: 'Invalid token' }); return }
    if (tokenData.claimed_at) { res.status(400).json({ error: 'Token already used' }); return }

    // Get the session
    const session = await queryOne<Record<string, unknown>>(
      `SELECT * FROM sessions WHERE id = $1`,
      [tokenData.session_id]
    )
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    if (session.status !== 'waiting') {
      res.status(400).json({ error: `Session is ${session.status}, cannot join` })
      return
    }

    // Create anonymous participant
    const anonId = `token_${tokenData.token}_${Date.now()}`
    const participant = await queryOne(
      `INSERT INTO participants (id, email) VALUES (uuid_generate_v4(), $1) RETURNING *`,
      [`${anonId}@lab.local`]
    )
    if (!participant) { res.status(500).json({ error: 'Failed to create participant' }); return }
    const pid = (participant as Record<string, unknown>).id as string

    // Join the session with pre-assigned role
    await pool.query(
      `INSERT INTO session_participants (id, session_id, participant_id, role)
       VALUES (uuid_generate_v4(), $1, $2, $3)`,
      [tokenData.session_id, pid, tokenData.role]
    )

    // Update token as claimed, merge metadata
    const existingMeta = typeof tokenData.metadata === 'object' && tokenData.metadata !== null
      ? tokenData.metadata as Record<string, unknown>
      : {}
    const mergedMeta = { ...existingMeta, ...metadata }

    const updatedToken = await queryOne(
      `UPDATE participant_tokens
       SET participant_id = $1, claimed_at = NOW(), metadata = $2
       WHERE id = $3 RETURNING *`,
      [pid, JSON.stringify(mergedMeta), tokenData.id]
    )

    // Log claim event (fire and forget)
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'token_claimed', $3)`,
      [tokenData.session_id, pid, JSON.stringify({ token: tokenData.token, role: tokenData.role, ...metadata })]
    ).catch(() => {})

    res.json({ token: updatedToken, participant, session })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
