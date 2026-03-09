/**
 * Batch routes.
 *
 * Experiment batch management and round matchmaking.
 * Mirrors: createBatch, getBatchByCode, getBatch, getBatchHasSchedule,
 *          joinBatch, getBatchParticipant, addToRoundQueue,
 *          getOrCreateRoundSession, tryMatchPoolRound, matchBatchForRound,
 *          getBatchRoundQueueCounts, clearAllBatchesAndRoundSessions,
 *          tryMatchRound, createRoundForPair
 */

import { Router } from 'express'
import { query, queryOne } from '../db.js'

export const batchesRouter = Router()

/** POST / -- create a new experiment batch */
batchesRouter.post('/', async (req, res) => {
  try {
    const { maxParticipants = 18 } = req.body
    const row = await queryOne(
      `SELECT * FROM create_batch($1)`,
      [maxParticipants]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /by-code/:code -- get batch by 6-char code */
batchesRouter.get('/by-code/:code', async (req, res) => {
  try {
    if (!req.params.code?.trim()) { res.json(null); return }
    const row = await queryOne(
      `SELECT * FROM experiment_batches WHERE batch_code = $1`,
      [req.params.code.toUpperCase()]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id -- get batch by UUID */
batchesRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM experiment_batches WHERE id = $1`,
      [req.params.id]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /:id/has-schedule -- check if batch has pre-seeded round assignments */
batchesRouter.get('/:id/has-schedule', async (req, res) => {
  try {
    const row = await queryOne<{ batch_has_schedule: boolean }>(
      `SELECT batch_has_schedule($1) AS batch_has_schedule`,
      [req.params.id]
    )
    res.json(Boolean(row?.batch_has_schedule))
  } catch (err: unknown) {
    console.warn('getBatchHasSchedule error:', err)
    res.json(false)
  }
})

/** POST /:id/join -- join a batch (atomic condition assignment) */
batchesRouter.post('/:id/join', async (req, res) => {
  try {
    const { participantId } = req.body
    if (!participantId) {
      res.status(400).json({ error: 'participantId is required' })
      return
    }
    const row = await queryOne(
      `SELECT * FROM join_batch_atomic($1, $2)`,
      [req.params.id, participantId]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('full')) {
      res.status(400).json({ error: 'Batch is full', code: 'BATCH_FULL' })
    } else if (msg.includes('not open')) {
      res.status(400).json({ error: 'Batch is not open for joining', code: 'BATCH_CLOSED' })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})

/** GET /:id/participant/:participantId -- get batch participant record */
batchesRouter.get('/:id/participant/:participantId', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM batch_participants WHERE batch_id = $1 AND participant_id = $2`,
      [req.params.id, req.params.participantId]
    )
    res.json(row)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /round-queue -- add participant to round queue (idempotent) */
batchesRouter.post('/round-queue', async (req, res) => {
  try {
    const { participantId, roundNumber } = req.body
    if (roundNumber < 1 || roundNumber > 3) { res.json({ ok: true }); return }
    await queryOne(
      `SELECT add_to_round_queue($1, $2)`,
      [participantId, roundNumber]
    )
    res.json({ ok: true })
  } catch (err: unknown) {
    console.warn('addToRoundQueue error:', err)
    res.json({ ok: true })
  }
})

/** POST /get-or-create-round-session -- pre-seeded matchmaking */
batchesRouter.post('/get-or-create-round-session', async (req, res) => {
  try {
    const { batchId, participantId, roundNumber } = req.body
    if (roundNumber < 1 || roundNumber > 3) { res.json(null); return }
    const rows = await query(
      `SELECT * FROM get_or_create_round_session($1, $2, $3)`,
      [batchId, participantId, roundNumber]
    )
    const row = rows[0] as { session_id: string; session_code: string; role: string; dyad_id: string } | undefined
    if (!row?.session_id) { res.json(null); return }
    res.json({
      session_id: row.session_id,
      session_code: row.session_code,
      role: row.role,
      dyad_id: row.dyad_id,
    })
  } catch (err: unknown) {
    console.warn('getOrCreateRoundSession error:', err)
    res.json(null)
  }
})

/** POST /try-match-pool-round -- pool-based matchmaking (no schedule) */
batchesRouter.post('/try-match-pool-round', async (req, res) => {
  try {
    const { participantId, slotIndex } = req.body
    if (slotIndex < 1 || slotIndex > 3) { res.json(null); return }
    const rows = await query(
      `SELECT * FROM try_match_pool_round($1, $2)`,
      [participantId, slotIndex]
    )
    const row = rows[0] as { session_id: string; session_code: string; role: string; dyad_id: string } | undefined
    if (!row?.session_id) { res.json(null); return }
    res.json({
      session_id: row.session_id,
      session_code: row.session_code,
      role: row.role,
      dyad_id: row.dyad_id,
    })
  } catch (err: unknown) {
    console.warn('tryMatchPoolRound error:', err)
    res.json(null)
  }
})

/** POST /try-match-round -- legacy pair-based matchmaking */
batchesRouter.post('/try-match-round', async (req, res) => {
  try {
    const { participantId, roundNumber } = req.body
    if (roundNumber < 1 || roundNumber > 3) { res.json(null); return }
    const rows = await query(
      `SELECT * FROM try_match_round($1, $2)`,
      [participantId, roundNumber]
    )
    const row = rows[0] as { session_id: string; session_code: string; role: string; dyad_id: string } | undefined
    if (!row?.session_id) { res.json(null); return }
    res.json({
      session_id: row.session_id,
      session_code: row.session_code,
      role: row.role,
      dyad_id: row.dyad_id,
    })
  } catch (err: unknown) {
    console.warn('tryMatchRound error:', err)
    res.json(null)
  }
})

/** POST /create-round-for-pair -- create a round session for a pair */
batchesRouter.post('/create-round-for-pair', async (req, res) => {
  try {
    const { pairSessionId, roundNumber } = req.body
    if (roundNumber < 1 || roundNumber > 3) {
      res.status(400).json({ error: 'roundNumber must be 1, 2, or 3' })
      return
    }
    const row = await queryOne<{ create_round_for_pair: string }>(
      `SELECT create_round_for_pair($1, $2)`,
      [pairSessionId, roundNumber]
    )
    res.json(row?.create_round_for_pair ?? null)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** POST /match-batch-for-round -- batch match all queued participants */
batchesRouter.post('/match-batch-for-round', async (req, res) => {
  try {
    const { batchId, slotIndex } = req.body
    if (slotIndex < 1 || slotIndex > 3) { res.json(0); return }
    const row = await queryOne<{ match_batch_for_round: number }>(
      `SELECT match_batch_for_round($1, $2)`,
      [batchId, slotIndex]
    )
    res.json(row?.match_batch_for_round ?? 0)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.warn('matchBatchForRound error:', msg)
    res.status(500).json({ error: msg })
  }
})

/** POST /queue-counts -- get queue counts per batch and round */
batchesRouter.post('/queue-counts', async (req, res) => {
  try {
    const { batchIds } = req.body as { batchIds: string[] }
    if (!batchIds || batchIds.length === 0) { res.json({}); return }
    const rows = await query<{ batch_id: string; round_number: number; queue_count: number }>(
      `SELECT * FROM get_batch_round_queue_counts($1)`,
      [batchIds]
    )
    const out: Record<string, { 1: number; 2: number; 3: number }> = {}
    for (const bid of batchIds) {
      out[bid] = { 1: 0, 2: 0, 3: 0 }
    }
    for (const r of rows) {
      if (out[r.batch_id] && r.round_number >= 1 && r.round_number <= 3) {
        out[r.batch_id][r.round_number as 1 | 2 | 3] = Number(r.queue_count)
      }
    }
    res.json(out)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.warn('getBatchRoundQueueCounts error:', msg)
    res.status(500).json({ error: msg })
  }
})

/** DELETE /clear-all -- remove all batches, round sessions, and queue entries */
batchesRouter.delete('/clear-all', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM clear_all_batches_and_round_sessions()`
    )
    const row = rows[0] as { sessions_deleted?: number; queue_deleted?: number; batches_deleted?: number } | undefined
    res.json({
      sessions_deleted: Number(row?.sessions_deleted ?? 0),
      queue_deleted: Number(row?.queue_deleted ?? 0),
      batches_deleted: Number(row?.batches_deleted ?? 0),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
