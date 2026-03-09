/**
 * Participant routes.
 *
 * CRUD operations for participants.
 * Mirrors: createParticipant, getParticipant, getParticipantByEmail,
 *          updateParticipant, generateCompletionCode
 */

import { Router } from 'express'
import { query, queryOne } from '../db.js'

export const participantsRouter = Router()

// Characters for completion code (exclude ambiguous 0/O, 1/I)
const COMPLETION_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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

/** POST /:id/completion-code -- generate unique completion code */
participantsRouter.post('/:id/completion-code', async (req, res) => {
  try {
    const existing = await queryOne<{ completion_code: string | null }>(
      'SELECT completion_code FROM participants WHERE id = $1',
      [req.params.id]
    )
    if (!existing) { res.status(404).json({ error: 'Participant not found' }); return }
    if (existing.completion_code) { res.json({ completion_code: existing.completion_code }); return }

    for (let attempt = 0; attempt < 10; attempt++) {
      let code = ''
      for (let i = 0; i < 8; i++) {
        code += COMPLETION_CODE_CHARS[Math.floor(Math.random() * COMPLETION_CODE_CHARS.length)]
      }
      try {
        const row = await queryOne<{ completion_code: string }>(
          `UPDATE participants SET completion_code = $1 WHERE id = $2 RETURNING completion_code`,
          [code, req.params.id]
        )
        if (row?.completion_code) { res.json(row); return }
      } catch {
        // unique violation -- retry
        continue
      }
    }
    res.status(500).json({ error: 'Failed to generate unique completion code' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
