/**
 * Survey routes.
 *
 * Pre-survey completion tracking.
 * Mirrors: markPreSurveyComplete, checkBothSurveysComplete,
 *          getSessionParticipantsWithSurveyStatus
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'

export const surveysRouter = Router()

/** POST /mark-complete -- mark a participant's pre-survey as complete */
surveysRouter.post('/mark-complete', async (req, res) => {
  try {
    const { sessionId, participantId } = req.body
    if (!sessionId || !participantId) {
      res.status(400).json({ error: 'sessionId and participantId are required' })
      return
    }

    const row = await queryOne(
      `UPDATE session_participants
       SET pre_survey_completed_at = NOW()
       WHERE session_id = $1 AND participant_id = $2
       RETURNING *`,
      [sessionId, participantId]
    )
    if (!row) { res.status(404).json({ error: 'Session participant not found' }); return }

    // Log event (fire and forget)
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'pre_survey_completed', $3)`,
      [sessionId, participantId, JSON.stringify({ completed_at: new Date().toISOString() })]
    ).catch(() => {})

    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /both-complete/:sessionId -- check if both participants completed pre-survey */
surveysRouter.get('/both-complete/:sessionId', async (req, res) => {
  try {
    const rows = await query<{ pre_survey_completed_at: string | null }>(
      `SELECT pre_survey_completed_at FROM session_participants WHERE session_id = $1`,
      [req.params.sessionId]
    )
    if (rows.length !== 2) { res.json(false); return }
    res.json(rows.every(p => p.pre_survey_completed_at !== null))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /status/:sessionId -- get all participants with survey status */
surveysRouter.get('/status/:sessionId', async (req, res) => {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM session_participants WHERE session_id = $1`,
      [req.params.sessionId]
    )
    const withStatus = rows.map(p => ({
      ...p,
      has_completed_survey: p.pre_survey_completed_at !== null,
    }))
    res.json(withStatus)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
