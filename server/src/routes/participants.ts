/**
 * Participant routes.
 *
 * CRUD operations for participants.
 * Mirrors: createParticipant, getParticipant, getParticipantByEmail,
 *          updateParticipant
 */

import { Router } from 'express'
import { query, queryOne } from '../db.js'

export const participantsRouter = Router()

/** POST / -- create a new participant */
participantsRouter.post('/', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ error: 'email is required' })
      return
    }
    const row = await queryOne(
      `INSERT INTO participants (id, email) VALUES (uuid_generate_v4(), $1)
       RETURNING *`,
      [email]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id -- get participant by UUID */
participantsRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM participants WHERE id = $1', [req.params.id])
    if (!row) { res.status(404).json({ error: 'Participant not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /by-email/:email -- get participant by email */
participantsRouter.get('/by-email/:email', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM participants WHERE email = $1', [req.params.email])
    // Return null (not 404) when participant not found
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** PATCH /:id -- update participant fields */
participantsRouter.patch('/:id', async (req, res) => {
  try {
    const updates = req.body
    const keys = Object.keys(updates)
    if (keys.length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    // Build SET clause dynamically
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`)
    const values = keys.map(k => updates[k])
    const sql = `UPDATE participants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`
    const row = await queryOne(sql, [req.params.id, ...values])
    if (!row) { res.status(404).json({ error: 'Participant not found' }); return }
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

