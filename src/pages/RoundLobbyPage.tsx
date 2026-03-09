/**
 * RoundLobbyPage (pool flow)
 *
 * Participant waits to be matched for a round (slot 1, 2, or 3).
 * Polls tryMatchPoolRound (caller gets match); if null, checks getSessionForParticipantRound
 * so the partner (matched by the other's call) also gets redirected to briefing.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import { addToRoundQueue, getOrCreateRoundSession, tryMatchPoolRound, getSessionForParticipantRound, getBatchParticipant, getBatch, getBatchHasSchedule, getBatchRoundQueueCounts, matchBatchForRound } from '@/lib/data'
import { getRoundLabel as getRoundLabelUtil } from '@/utils/roundLabels'

function getRoundLabel(condition: string | null): string {
  if (!condition) return 'this round'
  return getRoundLabelUtil(condition) || condition
}

function RoundLobbyPage() {
  const { slotIndex: slotParam } = useParams<{ slotIndex: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const participantId = searchParams.get('participant')
  const batchId = searchParams.get('batch')
  const slotIndex = slotParam ? parseInt(slotParam, 10) : 0
  const [roundLabel, setRoundLabel] = useState<string>('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasTriggeredAutoMatchRef = useRef(false)
  /** When true, batch has pre-seeded schedule; do not use condition-based fallback so we only match with designated partner. */
  const hasPreSeededScheduleRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!batchId || !participantId || slotIndex < 1 || slotIndex > 3) return

    getBatchParticipant(batchId, participantId).then((bp) => {
      const order = bp?.condition_order as string[] | undefined
      const condition = order?.[slotIndex - 1] ?? null
      setRoundLabel(getRoundLabel(condition))
    })
  }, [batchId, participantId, slotIndex])

  // Add to round queue as soon as lobby loads so we are in the queue before first poll
  useEffect(() => {
    if (!participantId || slotIndex < 1 || slotIndex > 3) return
    addToRoundQueue(participantId, slotIndex)
  }, [participantId, slotIndex])

  useEffect(() => {
    if (!participantId || slotIndex < 1 || slotIndex > 3) return

    let cancelled = false

    const poll = async () => {
      // Pre-seeded path (batch has 18 and schedule exists): look up assigned partner, create session when both ready
      if (batchId) {
        const preSeeded = await getOrCreateRoundSession(batchId, participantId, slotIndex)
        if (preSeeded) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          const params = new URLSearchParams({ participant: participantId })
          params.set('batch', batchId)
          navigate(`/briefing/${preSeeded.session_id}?${params.toString()}`)
          return
        }
        // Partner may have created the session (we were waiting on lock or network); check before fallback
        const existingPreSeeded = await getSessionForParticipantRound(participantId, slotIndex)
        if (existingPreSeeded) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          const params = new URLSearchParams({ participant: participantId })
          params.set('batch', batchId)
          navigate(`/briefing/${existingPreSeeded.session.id}?${params.toString()}`)
          return
        }
        // When batch has pre-seeded schedule, do NOT use condition-based matching: wait only for designated partner
        if (hasPreSeededScheduleRef.current === true) {
          return
        }
      }
      // Fallback: condition-based matching (batches without schedule, e.g. < 18 joined)
      const result = await tryMatchPoolRound(participantId, slotIndex)
      if (result) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        const params = new URLSearchParams({ participant: participantId })
        if (batchId) params.set('batch', batchId)
        navigate(`/briefing/${result.session_id}?${params.toString()}`)
        return
      }
      // Auto-match when queue is full (batch flow without pre-seed): trigger batch match once
      if (batchId && !hasTriggeredAutoMatchRef.current) {
        try {
          const [batch, queueCounts] = await Promise.all([
            getBatch(batchId),
            getBatchRoundQueueCounts([batchId]),
          ])
          const max = batch?.max_participants ?? 0
          const count = queueCounts[batchId]?.[slotIndex as 1 | 2 | 3] ?? 0
          if (max > 0 && count >= max) {
            hasTriggeredAutoMatchRef.current = true
            await matchBatchForRound(batchId, slotIndex)
          }
        } catch (_) {
          // Ignore; admin can still press R1/R2/R3
        }
      }
      // Partner path: we were matched (by batch match or other's call); check by round
      const existing = await getSessionForParticipantRound(participantId, slotIndex)
      if (existing) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        const params = new URLSearchParams({ participant: participantId })
        if (batchId) params.set('batch', batchId)
        navigate(`/briefing/${existing.session.id}?${params.toString()}`)
        return
      }
    }

    const run = async () => {
      if (batchId) {
        try {
          const has = await getBatchHasSchedule(batchId)
          if (!cancelled) hasPreSeededScheduleRef.current = has
        } catch (_) {
          if (!cancelled) hasPreSeededScheduleRef.current = false
        }
      }
      await poll()
      if (!cancelled) pollingRef.current = setInterval(poll, 2000)
    }
    run()

    return () => {
      cancelled = true
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [participantId, slotIndex, batchId, navigate])

  if (!participantId || slotIndex < 1 || slotIndex > 3) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="card max-w-md text-center">
          <p className="text-neutral-600">Missing participant or invalid round. Return to join page.</p>
          <a href="/" className="btn-primary mt-4 inline-block">Return</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
          <Users className="w-8 h-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Waiting for a partner
        </h1>
        <p className="text-neutral-600 mb-6">
          {roundLabel ? `Waiting for a partner for ${roundLabel}...` : 'Finding someone for this round...'}
        </p>
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default RoundLobbyPage
