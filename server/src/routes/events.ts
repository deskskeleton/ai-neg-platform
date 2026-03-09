/**
 * Event logging routes.
 *
 * Research event tracking.
 * Mirrors: logEvent, logEvents, getSessionEvents
 */

import { Router } from 'express'
import { query, queryOne } from '../db.js'

export const eventsRouter = Router()

/** POST / -- log a single event */
eventsRouter.post('/', async (req, res) => {
  try {
    const { session_id, participant_id, event_type, event_data = {} } = req.body
    const row = await queryOne(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4)
       RETURNING *`,
      [session_id, participant_id, event_type, JSON.stringify(event_data)]
    )
    res.json(row)
  } catch (err: unknown) {
    // Don't fail hard on event logging -- keep the request alive even if logging fails
    console.warn('Failed to log event:', err)
    res.json({ id: '', timestamp: new Date().toISOString(), ...req.body })
  }
})

/** POST /batch -- log multiple events at once */
eventsRouter.post('/batch', async (req, res) => {
  try {
    const { events } = req.body as { events: Array<{ session_id: string; participant_id: string; event_type: string; event_data?: unknown }> }
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: 'events array is required' })
      return
    }

    // Build a multi-row INSERT
    const placeholders: string[] = []
    const values: unknown[] = []
    let idx = 1
    for (const e of events) {
      placeholders.push(`(uuid_generate_v4(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`)
      values.push(e.session_id, e.participant_id, e.event_type, JSON.stringify(e.event_data ?? {}))
      idx += 4
    }

    const rows = await query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    )
    res.json(rows)
  } catch (err: unknown) {
    console.warn('Failed to log events:', err)
    res.json([])
  }
})

/** GET /session/:sessionId -- get events for a session, optionally filtered by type */
eventsRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const eventType = req.query.eventType as string | undefined
    let sql = 'SELECT * FROM event_log WHERE session_id = $1'
    const params: unknown[] = [req.params.sessionId]
    if (eventType) {
      sql += ' AND event_type = $2'
      params.push(eventType)
    }
    sql += ' ORDER BY timestamp ASC'
    const rows = await query(sql, params)
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
