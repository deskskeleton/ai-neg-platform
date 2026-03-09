/**
 * Session routes.
 *
 * CRUD + lifecycle operations for negotiation sessions.
 * Mirrors: createSession, getSession, getSessionByCode, getSessionWithParticipants,
 *          updateSession, startSession, endSession, joinSession, getAvailableRole,
 *          isSessionReady, getOtherParticipant, getSessionParticipantByIds,
 *          forceEndSession, setBriefingReady, getSessionParticipants,
 *          getRoundSessionsForParticipant, getRoundSessionsByPairSessionId,
 *          getSessionForParticipantRound
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'

export const sessionsRouter = Router()

/** POST / -- create a new session via the create_session RPC */
sessionsRouter.post('/', async (req, res) => {
  try {
    const { scenario = null, timeLimitMinutes = 45, aiQueryLimit = 100 } = req.body
    // Call the RPC function that auto-generates a session code
    const session = await queryOne(
      `SELECT * FROM create_session($1, $2)`,
      [scenario, timeLimitMinutes]
    )
    if (!session) { res.status(500).json({ error: 'create_session returned no data' }); return }

    // Update ai_query_limit if non-default
    if (aiQueryLimit !== 100) {
      const updated = await queryOne(
        `UPDATE sessions SET ai_query_limit = $1 WHERE id = $2 RETURNING *`,
        [aiQueryLimit, (session as Record<string, unknown>).id]
      )
      res.json(updated)
      return
    }
    res.json(session)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id -- get session by UUID */
sessionsRouter.get('/:id', async (req, res) => {
  try {
    // Guard against paths like "by-code", "join" etc. that aren't UUIDs
    if (!isUUID(req.params.id)) { res.status(400).json({ error: 'Invalid UUID' }); return }
    const row = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id])
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /by-code/:code -- get session by 6-char code */
sessionsRouter.get('/by-code/:code', async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT * FROM sessions WHERE session_code = $1',
      [req.params.code.toUpperCase()]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/with-participants -- session with nested participants + their participant profile */
sessionsRouter.get('/:id/with-participants', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id])
    if (!session) { res.json(null); return }

    const participants = await query(
      `SELECT sp.*, row_to_json(p.*) AS participant
       FROM session_participants sp
       JOIN participants p ON p.id = sp.participant_id
       WHERE sp.session_id = $1`,
      [req.params.id]
    )
    res.json({ ...(session as Record<string, unknown>), session_participants: participants })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** PATCH /:id -- update session fields */
sessionsRouter.patch('/:id', async (req, res) => {
  try {
    const updates = req.body
    const keys = Object.keys(updates)
    if (keys.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`)
    const values = keys.map(k => updates[k])
    const sql = `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`
    const row = await queryOne(sql, [req.params.id, ...values])
    if (!row) { res.status(404).json({ error: 'Session not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /:id/start -- start session (set status=active, started_at=now) */
sessionsRouter.post('/:id/start', async (req, res) => {
  try {
    const row = await queryOne(
      `UPDATE sessions SET status = 'active', started_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!row) { res.status(404).json({ error: 'Session not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /:id/end -- end session */
sessionsRouter.post('/:id/end', async (req, res) => {
  try {
    const { agreementReached, finalAgreement = {} } = req.body
    const row = await queryOne(
      `UPDATE sessions
       SET status = 'completed', ended_at = NOW(),
           agreement_reached = $2, final_agreement = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, agreementReached, JSON.stringify(finalAgreement)]
    )
    if (!row) { res.status(404).json({ error: 'Session not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /join -- join a session by code */
sessionsRouter.post('/join', async (req, res) => {
  try {
    const { sessionCode, participantId, role } = req.body
    if (!sessionCode || !participantId || !role) {
      res.status(400).json({ error: 'sessionCode, participantId, and role are required' })
      return
    }

    const session = await queryOne<Record<string, unknown>>(
      `SELECT * FROM sessions WHERE session_code = $1`,
      [sessionCode.toUpperCase()]
    )
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    if (session.status !== 'waiting') {
      res.status(400).json({ error: `Cannot join session with status: ${session.status}` })
      return
    }

    // Check already joined
    const existing = await queryOne(
      `SELECT id FROM session_participants WHERE session_id = $1 AND participant_id = $2`,
      [session.id, participantId]
    )
    if (existing) { res.status(400).json({ error: 'Already joined this session' }); return }

    // Check role taken
    const roleCheck = await queryOne(
      `SELECT id FROM session_participants WHERE session_id = $1 AND role = $2`,
      [session.id, role]
    )
    if (roleCheck) { res.status(400).json({ error: `Role '${role}' is already taken` }); return }

    const sp = await queryOne(
      `INSERT INTO session_participants (id, session_id, participant_id, role)
       VALUES (uuid_generate_v4(), $1, $2, $3) RETURNING *`,
      [session.id, participantId, role]
    )

    // Log join event (fire and forget)
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'session_joined', $3)`,
      [session.id, participantId, JSON.stringify({ role, session_code: sessionCode })]
    ).catch(() => {})

    res.json({ session, sessionParticipant: sp })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/available-role -- which role is still open */
sessionsRouter.get('/:id/available-role', async (req, res) => {
  try {
    const rows = await query<{ role: string }>(
      'SELECT role FROM session_participants WHERE session_id = $1',
      [req.params.id]
    )
    const taken = rows.map(r => r.role)
    if (!taken.includes('pm')) { res.json('pm'); return }
    if (!taken.includes('developer')) { res.json('developer'); return }
    res.json(null)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/ready -- true if 2 participants */
sessionsRouter.get('/:id/ready', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id FROM session_participants WHERE session_id = $1',
      [req.params.id]
    )
    res.json(rows.length === 2)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/other-participant/:participantId -- get the other participant */
sessionsRouter.get('/:id/other-participant/:participantId', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM session_participants
       WHERE session_id = $1 AND participant_id != $2 LIMIT 1`,
      [req.params.id, req.params.participantId]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/participant/:participantId -- get session_participant by composite key */
sessionsRouter.get('/:id/participant/:participantId', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM session_participants WHERE session_id = $1 AND participant_id = $2`,
      [req.params.id, req.params.participantId]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/participants -- all session participants */
sessionsRouter.get('/:id/participants', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM session_participants WHERE session_id = $1',
      [req.params.id]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /:id/force-end -- force-end a session (timer expiry) */
sessionsRouter.post('/:id/force-end', async (req, res) => {
  try {
    const { participantId } = req.body
    if (participantId) {
      pool.query(
        `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
         VALUES (uuid_generate_v4(), $1, $2, 'timer_expired', $3)`,
        [req.params.id, participantId, JSON.stringify({ ended_by: 'timer_auto_termination', timestamp: new Date().toISOString() })]
      ).catch(() => {})
    }
    const row = await queryOne(
      `UPDATE sessions
       SET status = 'completed', ended_at = NOW(),
           agreement_reached = false,
           final_agreement = '{"ended_reason":"timer_expired"}'::jsonb
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!row) { res.status(404).json({ error: 'Session not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /:id/briefing-ready -- mark participant ready after briefing */
sessionsRouter.post('/:id/briefing-ready', async (req, res) => {
  try {
    const { participantId } = req.body
    await pool.query(
      `UPDATE session_participants SET briefing_ready_at = NOW()
       WHERE session_id = $1 AND participant_id = $2`,
      [req.params.id, participantId]
    )
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /round-sessions/by-participant/:participantId -- rounds 1-3 for a participant */
sessionsRouter.get('/round-sessions/by-participant/:participantId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT s.* FROM sessions s
       JOIN session_participants sp ON sp.session_id = s.id
       WHERE sp.participant_id = $1 AND s.round_number IN (1,2,3)
       ORDER BY s.round_number ASC`,
      [req.params.participantId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /round-sessions/by-pair/:pairSessionId -- rounds 1-3 for a pair session */
sessionsRouter.get('/round-sessions/by-pair/:pairSessionId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM sessions
       WHERE pair_session_id = $1 AND round_number IN (1,2,3)
       ORDER BY round_number ASC`,
      [req.params.pairSessionId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /session-for-participant-round -- check if participant already matched for round */
sessionsRouter.post('/session-for-participant-round', async (req, res) => {
  try {
    const { participantId, roundNumber } = req.body
    const rows = await query<Record<string, unknown>>(
      `SELECT sp.*, row_to_json(s.*) AS session
       FROM session_participants sp
       JOIN sessions s ON s.id = sp.session_id
       WHERE sp.participant_id = $1 AND s.round_number = $2`,
      [participantId, roundNumber]
    )
    if (rows.length === 0) { res.json(null); return }
    const row = rows[0]
    const session = row.session
    const { session: _s, ...sessionParticipant } = row
    res.json({ session, sessionParticipant })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

// Helper: quick UUID format check
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
