/**
 * RoundLobbyPage (pool flow)
 *
 * Participant waits to be matched for a round (slot 1, 2, or 3).
 * Batch participants match only through the batch schedule (created when the group fills).
 * Without a batch, polls tryMatchPoolRound (caller gets match); if null, checks
 * getSessionForParticipantRound so the partner (matched by the other's call) is redirected too.
 */

import { useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import { addToRoundQueue, getOrCreateRoundSession, tryMatchPoolRound, getSessionForParticipantRound } from '@/lib/data'

function RoundLobbyPage() {
  const { slotIndex: slotParam } = useParams<{ slotIndex: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const participantId = searchParams.get('participant')
  const batchId = searchParams.get('batch')
  const slotIndex = slotParam ? parseInt(slotParam, 10) : 0
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Add to round queue as soon as lobby loads so we are in the queue before first poll
  useEffect(() => {
    if (!participantId || slotIndex < 1 || slotIndex > 3) return
    addToRoundQueue(participantId, slotIndex)
  }, [participantId, slotIndex])

  useEffect(() => {
    if (!participantId || slotIndex < 1 || slotIndex > 3) return

    let cancelled = false

    const poll = async () => {
      // Schedule path: look up assigned partner, create session when both ready (null until the group is full)
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
        // Batch participants only ever match through the schedule, which is created when the
        // group fills (6, 12 or 18). Someone who reaches the lobby before that keeps polling here;
        // the condition-based fallback below would pair them with whoever else is early and
        // strand their scheduled partners (2026-09-24 session).
        return
      }
      // No batch: condition-based matching
      const result = await tryMatchPoolRound(participantId, slotIndex)
      if (result) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        navigate(`/briefing/${result.session_id}?participant=${participantId}`)
        return
      }
      // Partner path: we were matched by the other's call; check by round
      const existing = await getSessionForParticipantRound(participantId, slotIndex)
      if (existing) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        navigate(`/briefing/${existing.session.id}?participant=${participantId}`)
        return
      }
    }

    const run = async () => {
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
          Finding a partner for this round…
        </p>
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default RoundLobbyPage
