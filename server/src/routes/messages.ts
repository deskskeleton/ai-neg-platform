/**
 * Message routes.
 *
 * Send and retrieve negotiation messages.
 * Mirrors: sendMessage, sendOffer, getSessionMessages
 */

import { Router } from 'express'
import { pool, query, queryOne } from '../db.js'

export const messagesRouter = Router()

/** POST / -- send a message */
messagesRouter.post('/', async (req, res) => {
  try {
    const { sessionId, participantId, content, messageType = 'negotiation', metadata = {} } = req.body
    if (!sessionId || !participantId || !content) {
      res.status(400).json({ error: 'sessionId, participantId, and content are required' })
      return
    }

    const row = await queryOne(
      `INSERT INTO messages (id, session_id, participant_id, content, message_type, metadata)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, participantId, content, messageType, JSON.stringify(metadata)]
    )

    // Log event (fire and forget)
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'message_sent', $3)`,
      [sessionId, participantId, JSON.stringify({ message_type: messageType, content_length: content.length })]
    ).catch(() => {})

    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /offer -- send an offer message */
messagesRouter.post('/offer', async (req, res) => {
  try {
    const { sessionId, participantId, offerDetails } = req.body
    if (!sessionId || !participantId || !offerDetails) {
      res.status(400).json({ error: 'sessionId, participantId, and offerDetails are required' })
      return
    }

    const content = formatOfferContent(offerDetails)
    const metadata = { offer_details: offerDetails }

    const row = await queryOne(
      `INSERT INTO messages (id, session_id, participant_id, content, message_type, metadata)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'offer', $4)
       RETURNING *`,
      [sessionId, participantId, content, JSON.stringify(metadata)]
    )

    // Log event
    pool.query(
      `INSERT INTO event_log (id, session_id, participant_id, event_type, event_data)
       VALUES (uuid_generate_v4(), $1, $2, 'message_sent', $3)`,
      [sessionId, participantId, JSON.stringify({ message_type: 'offer', content_length: content.length })]
    ).catch(() => {})

    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /session/:sessionId -- get all messages for a session */
messagesRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC`,
      [req.params.sessionId]
    )
    res.json(rows)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** Format offer details into readable content */
function formatOfferContent(offer: Record<string, unknown>): string {
  const parts: string[] = []
  if (offer.salary) parts.push(`Salary: $${offer.salary}`)
  if (offer.bonus) parts.push(`Bonus: $${offer.bonus}`)
  if (offer.vacation_days) parts.push(`Vacation: ${offer.vacation_days} days`)
  if (offer.remote_days) parts.push(`Remote: ${offer.remote_days} days/week`)
  return parts.length > 0 ? `Offer: ${parts.join(', ')}` : 'New offer'
}
