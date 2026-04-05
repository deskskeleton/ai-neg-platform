/**
 * RoundReadyPage
 *
 * Lobby after briefing: both participants must be ready before the round (and 15-min timer) starts.
 * On load we mark this participant ready; when both are ready we count down then start the session and go to negotiate.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Users, Loader2 } from 'lucide-react'
import { setBriefingReady, getSessionParticipants, startSession, getSession } from '@/lib/data'

const COUNTDOWN_SECONDS = 3

function RoundReadyPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const participantId = searchParams.get('participant')
  const pairSessionId = searchParams.get('pair_session')
  const batchId = searchParams.get('batch')

  const [bothReady, setBothReady] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const markedReady = useRef(false)

  // Mark self ready on mount
  useEffect(() => {
    if (!sessionId || !participantId || markedReady.current) return
    markedReady.current = true
    setBriefingReady(sessionId, participantId).catch((err) => {
      console.error('setBriefingReady:', err)
      setError('Failed to mark ready.')
    })
  }, [sessionId, participantId])

  // Poll for both ready
  useEffect(() => {
    if (!sessionId || error) return
    const check = async () => {
      const participants = await getSessionParticipants(sessionId)
      const ready = participants.every((p) => p.briefing_ready_at != null)
      setBothReady(ready && participants.length >= 2)
    }
    check()
    const interval = setInterval(check, 1500)
    return () => clearInterval(interval)
  }, [sessionId, error])

  // When both ready, auto-start countdown
  useEffect(() => {
    if (bothReady && countdown === null) setCountdown(COUNTDOWN_SECONDS)
  }, [bothReady, countdown])

  // Countdown tick; at 0 call startSession and navigate
  useEffect(() => {
    if (countdown === null || countdown < 0) return
    if (countdown === 0) {
      startSession(sessionId!).then(() => {
        const params = new URLSearchParams({ participant: participantId ?? '' })
        if (pairSessionId) params.set('pair_session', pairSessionId)
        if (batchId) params.set('batch', batchId)
        navigate(`/negotiate/${sessionId}?${params.toString()}`)
      }).catch((err) => {
        console.error('startSession:', err)
        setError('Failed to start round.')
      })
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c != null ? c - 1 : null)), 1000)
    return () => clearTimeout(t)
  }, [countdown, sessionId, participantId, pairSessionId, batchId, navigate])

  // If session became active (other participant started), go to negotiate
  useEffect(() => {
    if (!sessionId || !participantId) return
    const check = async () => {
      const s = await getSession(sessionId)
      if (s?.status === 'active') {
        const params = new URLSearchParams({ participant: participantId })
        if (pairSessionId) params.set('pair_session', pairSessionId)
        if (batchId) params.set('batch', batchId)
        navigate(`/negotiate/${sessionId}?${params.toString()}`)
      }
    }
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [sessionId, participantId, pairSessionId, batchId, navigate])

  if (!sessionId || !participantId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Missing session or participant. Return to the join page.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center">
        {!bothReady ? (
          <>
            <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Waiting for your partner</h1>
            <p className="text-slate-600 mb-6">
              You are ready. The round will start when your partner has also finished the briefing.
            </p>
            <Loader2 className="w-8 h-8 text-slate-400 mx-auto animate-spin" />
          </>
        ) : countdown === null ? (
          <>
            <Users className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Both ready!</h1>
            <p className="text-slate-600">Starting the 10-minute round in a moment...</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Starting in {countdown}</h1>
            <p className="text-slate-600">Get ready to negotiate.</p>
          </>
        )}
      </div>
    </div>
  )
}

export default RoundReadyPage
