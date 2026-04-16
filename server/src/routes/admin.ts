/**
 * Admin routes.
 *
 * Session listing, deletion, data export, and participant management.
 * Admin-only REST endpoints for session/batch management.
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const adminRouter = Router()

// Optionally protect all admin routes
adminRouter.use(requireAdmin)

/** GET /sessions -- list all sessions with participant counts and batch_id for round sessions */
adminRouter.get('/sessions', async (req, res) => {
  try {
    const rows = await query(
      `SELECT s.*,
              COALESCE(json_agg(sp.*) FILTER (WHERE sp.id IS NOT NULL), '[]') AS participants,
              (
                SELECT bp.batch_id
                FROM session_participants sp2
                JOIN batch_participants bp ON bp.participant_id = sp2.participant_id
                WHERE sp2.session_id = s.id
                LIMIT 1
              ) AS batch_id
       FROM sessions s
       LEFT JOIN session_participants sp ON sp.session_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /batches -- list all batches with participant counts */
adminRouter.get('/batches', async (req, res) => {
  try {
    const rows = await query(
      `SELECT b.*,
              COUNT(bp.id)::int AS participant_count
       FROM experiment_batches b
       LEFT JOIN batch_participants bp ON bp.batch_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC`
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** DELETE /sessions/:id -- delete a session and its related data */
adminRouter.delete('/sessions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** DELETE /session-participants/:sessionId/:participantId -- remove one participant */
adminRouter.delete('/session-participants/:sessionId/:participantId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM session_participants WHERE session_id = $1 AND participant_id = $2',
      [req.params.sessionId, req.params.participantId]
    )
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** DELETE /session-participants/:sessionId -- remove ALL participants from a session */
adminRouter.delete('/session-participants/:sessionId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM session_participants WHERE session_id = $1',
      [req.params.sessionId]
    )
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/**
 * GET /batches/:id/points -- per-participant point breakdown for a completed batch.
 * Returns raw session data (scenario, role, final_agreement) so the frontend can
 * call calculatePoints() with the existing payoff tables.
 */
adminRouter.get('/batches/:id/points', async (req, res) => {
  try {
    const rows = await query(
      `SELECT
         p.id            AS participant_id,
         p.email,
         s.id            AS session_id,
         s.round_number,
         s.negotiation_scenario,
         s.agreement_reached,
         s.final_agreement,
         sp.role
       FROM batch_participants bp
       JOIN participants p ON p.id = bp.participant_id
       JOIN session_participants sp ON sp.participant_id = p.id
       JOIN sessions s ON s.id = sp.session_id
         AND s.round_number IS NOT NULL
       WHERE bp.batch_id = $1
       ORDER BY p.id, s.round_number`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/**
 * GET /batches/:id/export -- full batch data export (JSON).
 * Returns all participants, all round sessions with messages/events/AI queries,
 * and per-participant survey data for the batch.
 */
adminRouter.get('/batches/:id/export', async (req, res) => {
  try {
    const batchId = req.params.id

    const [batchRows, participantRows, sessionRows] = await Promise.all([
      query('SELECT * FROM experiment_batches WHERE id = $1', [batchId]),
      query(
        `SELECT p.id, p.email, p.pre_questionnaire_data, p.post_questionnaire_data,
                bp.condition_order, bp.joined_at AS batch_joined_at
         FROM batch_participants bp
         JOIN participants p ON p.id = bp.participant_id
         WHERE bp.batch_id = $1
         ORDER BY bp.joined_at ASC`,
        [batchId]
      ),
      query(
        `SELECT s.*
         FROM sessions s
         JOIN session_participants sp ON sp.session_id = s.id
         JOIN batch_participants bp ON bp.participant_id = sp.participant_id
         WHERE bp.batch_id = $1 AND s.round_number IS NOT NULL
         GROUP BY s.id
         ORDER BY s.round_number ASC, s.created_at ASC`,
        [batchId]
      ),
    ])

    const batch = batchRows[0]
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return }

    // For each session, fetch participants, messages, events, and AI queries in parallel
    const sessionIds: string[] = (sessionRows as Array<{ id: string }>).map(s => s.id)

    const [allSessionParticipants, allMessages, allEvents, allAiQueries] = await Promise.all([
      sessionIds.length > 0
        ? query(
            `SELECT sp.session_id, sp.participant_id, sp.role, sp.joined_at,
                    sp.pre_survey_completed_at, sp.post_survey_completed_at,
                    sp.briefing_ready_at, sp.treatment_condition
             FROM session_participants sp WHERE sp.session_id = ANY($1)`,
            [sessionIds]
          )
        : Promise.resolve([]),
      sessionIds.length > 0
        ? query(
            `SELECT * FROM messages WHERE session_id = ANY($1) ORDER BY timestamp ASC`,
            [sessionIds]
          )
        : Promise.resolve([]),
      sessionIds.length > 0
        ? query(
            `SELECT * FROM event_log WHERE session_id = ANY($1) ORDER BY timestamp ASC`,
            [sessionIds]
          )
        : Promise.resolve([]),
      sessionIds.length > 0
        ? query(
            `SELECT * FROM assistant_queries WHERE session_id = ANY($1) ORDER BY created_at ASC`,
            [sessionIds]
          )
        : Promise.resolve([]),
    ])

    // Group by session_id
    type Row = Record<string, unknown>
    const spBySession = new Map<string, Row[]>()
    const msgBySession = new Map<string, Row[]>()
    const evtBySession = new Map<string, Row[]>()
    const aiBySession = new Map<string, Row[]>()

    for (const r of allSessionParticipants as Row[]) {
      const sid = r.session_id as string
      if (!spBySession.has(sid)) spBySession.set(sid, [])
      spBySession.get(sid)!.push(r)
    }
    for (const r of allMessages as Row[]) {
      const sid = r.session_id as string
      if (!msgBySession.has(sid)) msgBySession.set(sid, [])
      msgBySession.get(sid)!.push(r)
    }
    for (const r of allEvents as Row[]) {
      const sid = r.session_id as string
      if (!evtBySession.has(sid)) evtBySession.set(sid, [])
      evtBySession.get(sid)!.push(r)
    }
    for (const r of allAiQueries as Row[]) {
      const sid = r.session_id as string
      if (!aiBySession.has(sid)) aiBySession.set(sid, [])
      aiBySession.get(sid)!.push(r)
    }

    const sessions = (sessionRows as Row[]).map(s => ({
      session: s,
      participants: spBySession.get(s.id as string) ?? [],
      messages: msgBySession.get(s.id as string) ?? [],
      events: evtBySession.get(s.id as string) ?? [],
      assistant_queries: aiBySession.get(s.id as string) ?? [],
    }))

    res.json({
      batch,
      participants: participantRows,
      sessions,
      exported_at: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /export/:sessionId -- full session data export (JSON) */
adminRouter.get('/export/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId

    // Fetch session, participants with profile, messages, events in parallel
    const [sessionRows, participantRows, messageRows, eventRows] = await Promise.all([
      query('SELECT * FROM sessions WHERE id = $1', [sessionId]),
      query(
        `SELECT sp.participant_id, sp.role, sp.joined_at,
                p.pre_questionnaire_data, p.post_questionnaire_data
         FROM session_participants sp
         JOIN participants p ON p.id = sp.participant_id
         WHERE sp.session_id = $1`,
        [sessionId]
      ),
      query(
        'SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC',
        [sessionId]
      ),
      query(
        'SELECT * FROM event_log WHERE session_id = $1 ORDER BY timestamp ASC',
        [sessionId]
      ),
    ])

    const session = sessionRows[0]
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }

    res.json({
      session,
      participants: participantRows,
      messages: messageRows,
      events: eventRows,
      exported_at: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
