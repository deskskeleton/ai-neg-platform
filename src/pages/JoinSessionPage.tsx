import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { 
  Users, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  User,
  Loader2,
  ClipboardList
} from 'lucide-react'
import { 
  getSessionByCode,
  getBatchByCode,
  getBatch,
  joinBatch,
  getAvailableRole,
  subscribeToParticipants,
  subscribeToSession,
  subscribeToSessionParticipantUpdates,
  isSessionReady,
  checkBothSurveysComplete,
  getSessionParticipantsWithSurveyStatus,
  createRoundForPair,
  createParticipant,
  getSessionParticipantByIds,
  joinSession,
  logEvent,
  ApiError,
  isBackendConfigured
} from '@/lib/data'
import { SCENARIO_CONFIG, getScenarioById, type ScenarioConfig } from '@/config/scenarios'
import type { Session, ParticipantRole } from '@/types/database.types'

// ============================================
// Types
// ============================================

type PageState = 
  | 'loading'
  | 'code_entry'
  | 'consent'
  | 'waiting_room'
  | 'matched'
  | 'pre_survey_pending'
  | 'ready_for_briefing'   // Pair: both surveys done; batch: not used
  | 'batch_ready_round_1'  // Batch: pre-survey done, go to round lobby
  | 'error'

interface WaitingRoomParticipant {
  id: string
  role: ParticipantRole
  isCurrentUser: boolean
  hasSurveyComplete: boolean
}

// ============================================
// Component
// ============================================

/**
 * JoinSessionPage Component (Lab Mode)
 * 
 * Entry point for participants with comprehensive flow handling.
 * 
 * FLOW (Match-First, Survey-After):
 * 1. Enter session code (or get from URL)
 * 2. Consent checkbox (if not from token)
 * 3. Waiting room until BOTH participants join
 * 4. Both proceed to pre-survey
 * 5. Wait for BOTH to complete pre-survey
 * 6. Navigate to role briefing when ready
 * 
 * This ensures:
 * - No wasted survey data if partner doesn't show
 * - Trust measures are taken right before seeing the AI
 * - Clean data linking throughout the flow
 */
function JoinSessionPage() {
  // URL params
  const { code: urlCode } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  // Query params for different entry flows
  const existingParticipantId = searchParams.get('participant')
  const fromToken = searchParams.get('from') === 'token'
  const fromSurvey = searchParams.get('from') === 'survey'
  
  // State
  const [pageState, setPageState] = useState<PageState>('loading')
  const [sessionCode, setSessionCode] = useState(urlCode?.toUpperCase() ?? '')
  const [session, setSession] = useState<Session | null>(null)
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_CONFIG)
  const [participantId, setParticipantId] = useState<string | null>(existingParticipantId)
  const [assignedRole, setAssignedRole] = useState<ParticipantRole | null>(null)
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<WaitingRoomParticipant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasConsented, setHasConsented] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  
  // Helper to get role label from scenario
  const getRoleLabel = (role: ParticipantRole): string => {
    if (role === 'pm') return scenario.roles.roleA.label
    return scenario.roles.roleB.label
  }

  // ============================================
  // Initialization
  // ============================================

  useEffect(() => {
    if (!isBackendConfigured()) {
      setError('Database not configured')
      setPageState('error')
      return
    }

    // FROM TOKEN: Coming from TokenEntryPage with existing participant
    if (fromToken && existingParticipantId && urlCode) {
      initializeFromToken(urlCode.toUpperCase(), existingParticipantId)
      return
    }

    // FROM SURVEY: Returning from PreSurveyPage after completing survey
    if (fromSurvey && existingParticipantId && (urlCode || searchParams.get('batch'))) {
      initializeFromSurvey(urlCode?.toUpperCase() ?? '', existingParticipantId, searchParams.get('batch'))
      return
    }

    // DIRECT FLOW: Normal session code entry
    if (urlCode) {
      validateSession(urlCode.toUpperCase())
    } else {
      setPageState('code_entry')
    }
  }, [urlCode, fromToken, fromSurvey, existingParticipantId, searchParams])

  /**
   * Initialize from TokenEntryPage (participant just joined via token)
   */
  async function initializeFromToken(code: string, pId: string) {
    setPageState('loading')
    
    try {
      const sessionData = await getSessionByCode(code)
      
      if (!sessionData) {
        setError('Session not found')
        setPageState('error')
        return
      }
      
      setSession(sessionData)
      setScenario(getScenarioById(sessionData.negotiation_scenario))
      setSessionCode(code)
      setParticipantId(pId)
      
      // Get participant's role
      const spData = await getSessionParticipantByIds(sessionData.id, pId)
      
      if (spData) {
        setAssignedRole(spData.role as ParticipantRole)
      }
      
      // Check if both participants have joined
      const ready = await isSessionReady(sessionData.id)
      console.log('initializeFromToken:', { ready, sessionId: sessionData.id, participantId: pId })
      
      if (ready) {
        // Both joined - check survey status
        const surveysComplete = await checkBothSurveysComplete(sessionData.id)
        console.log('Both ready, surveys complete?', surveysComplete)
        if (surveysComplete) {
          setPageState('ready_for_briefing')
        } else {
          setPageState('matched')
        }
        loadAllParticipants(sessionData.id, pId)
      } else {
        console.log('Not ready yet, setting to waiting_room')
        setPageState('waiting_room')
        if (spData) {
          setWaitingRoomParticipants([{
            id: pId,
            role: spData.role as ParticipantRole,
            isCurrentUser: true,
            hasSurveyComplete: false
          }])
        }
      }
      
    } catch (err) {
      console.error('Initialize from token error:', err)
      setError('Failed to load session')
      setPageState('error')
    }
  }

  /**
   * Initialize from PreSurveyPage (participant just completed survey).
   * Batch flow: show "Continue to Round 1". Pair flow: show wait for partner or ready for briefing.
   */
  async function initializeFromSurvey(code: string, pId: string, batchIdParam: string | null = null) {
    setPageState('loading')
    try {
      // When returning from pre-survey with batch= in URL, resolve batch first so we never show "waiting for partner"
      let batch: Awaited<ReturnType<typeof getBatch>> = null
      if (batchIdParam) {
        batch = await getBatch(batchIdParam)
      }
      if (!batch && code?.trim()) {
        batch = await getBatchByCode(code)
      }
      if (batch) {
        setBatchId(batch.id)
        setSession(null)
        setSessionCode(batch.batch_code)
        setParticipantId(pId)
        setPageState('batch_ready_round_1')
        return
      }

      if (!code?.trim()) {
        setError('Missing session or batch. Please return to the join page and enter your code.')
        setPageState('error')
        return
      }

      const sessionData = await getSessionByCode(code)
      if (!sessionData) {
        setError('Session not found')
        setPageState('error')
        return
      }

      setSession(sessionData)
      setScenario(getScenarioById(sessionData.negotiation_scenario))
      setSessionCode(code)
      setParticipantId(pId)

      const spData = await getSessionParticipantByIds(sessionData.id, pId)

      if (spData) setAssignedRole(spData.role as ParticipantRole)

      const surveysComplete = await checkBothSurveysComplete(sessionData.id)
      if (surveysComplete) setPageState('ready_for_briefing')
      else setPageState('pre_survey_pending')

      loadAllParticipants(sessionData.id, pId)
    } catch (err) {
      console.error('Initialize from survey error:', err)
      setError('Failed to load session')
      setPageState('error')
    }
  }

  async function validateSession(code: string) {
    setPageState('loading')
    setError(null)

    try {
      const batch = await getBatchByCode(code)
      if (batch && batch.status === 'open') {
        setBatchId(batch.id)
        setSession(null)
        setSessionCode(code)
        setPageState('consent')
        return
      }
      if (batch) {
        setError('This batch is not open or is full.')
        setPageState('code_entry')
        return
      }

      const foundSession = await getSessionByCode(code)
      if (!foundSession) {
        setError('Session or batch not found. Please check the code and try again.')
        setPageState('code_entry')
        return
      }

      if (foundSession.status === 'completed') {
        setError('This session has already ended.')
        setPageState('error')
        return
      }

      if (foundSession.status === 'cancelled') {
        setError('This session has been cancelled.')
        setPageState('error')
        return
      }

      const availableRole = await getAvailableRole(foundSession.id)
      if (!availableRole && foundSession.status === 'waiting') {
        setError('This session is full. Both participants have already joined.')
        setPageState('error')
        return
      }

      if (foundSession.status === 'active') {
        setError('This session is already in progress.')
        setPageState('error')
        return
      }

      setBatchId(null)
      setSession(foundSession)
      setScenario(getScenarioById(foundSession.negotiation_scenario))
      setSessionCode(code)
      setPageState('consent')
    } catch (err) {
      console.error('Session validation error:', err)
      setError('Failed to validate. Please try again.')
      setPageState('code_entry')
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sessionCode.length === 6) {
      validateSession(sessionCode)
    }
  }

  // ============================================
  // Join Session (Direct Flow - Anonymous)
  // ============================================

  /** Batch flow: create participant, join batch, go to pre-survey */
  async function handleJoinBatch() {
    if (!batchId || !hasConsented) return
    setIsSubmitting(true)
    setError(null)
    try {
      const anonId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newParticipant = await createParticipant(`${anonId}@lab.local`)
      await joinBatch(batchId, newParticipant.id)
      setParticipantId(newParticipant.id)
      navigate(`/pre-survey/${newParticipant.id}?batch=${batchId}&code=${sessionCode}`)
    } catch (err) {
      console.error('Join batch error:', err)
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to join batch. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleJoinSession() {
    if (!session || !hasConsented) return

    setIsSubmitting(true)
    setError(null)

    try {
      const role = await getAvailableRole(session.id)
      
      if (!role) {
        setError('Session is full. Both roles have been taken.')
        setPageState('error')
        return
      }

      // Create anonymous participant and join session via data layer
      const anonId = `lab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newParticipant = await createParticipant(`${anonId}@lab.local`)

      await joinSession(sessionCode, newParticipant.id, role)

      // Log the join event
      await logEvent({
        session_id: session.id,
        participant_id: newParticipant.id,
        event_type: 'session_joined',
        event_data: { role, session_code: sessionCode }
      })

      setParticipantId(newParticipant.id)
      setAssignedRole(role)

      setWaitingRoomParticipants([{
        id: newParticipant.id,
        role,
        isCurrentUser: true,
        hasSurveyComplete: false
      }])

      const ready = await isSessionReady(session.id)
      
      if (ready) {
        setPageState('matched')
        loadAllParticipants(session.id, newParticipant.id)
      } else {
        setPageState('waiting_room')
      }

    } catch (err) {
      console.error('Join session error:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to join session. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ============================================
  // Participant Loading & Updates
  // ============================================

  const loadAllParticipants = useCallback(async (sessionId: string, currentParticipantId: string) => {
    try {
      const participants = await getSessionParticipantsWithSurveyStatus(sessionId)
      
      setWaitingRoomParticipants(
        participants.map(p => ({
          id: p.participant_id,
          role: p.role as ParticipantRole,
          isCurrentUser: p.participant_id === currentParticipantId,
          hasSurveyComplete: p.has_completed_survey
        }))
      )
    } catch (err) {
      console.error('Failed to load participants:', err)
    }
  }, [])

  // Subscribe to realtime updates
  useEffect(() => {
    if (!session || !participantId) return
    if (!['waiting_room', 'matched', 'pre_survey_pending'].includes(pageState)) return

    // Subscribe to new participants joining
    const participantChannel = subscribeToParticipants(session.id, (newParticipant) => {
      console.log('New participant joined via realtime:', newParticipant)
      setWaitingRoomParticipants(prev => {
        if (prev.some(p => p.role === newParticipant.role)) return prev
        
        const updated = [...prev, {
          id: newParticipant.participant_id,
          role: newParticipant.role as ParticipantRole,
          isCurrentUser: newParticipant.participant_id === participantId,
          hasSurveyComplete: newParticipant.pre_survey_completed_at !== null
        }]
        
        console.log('Updated participants:', updated.length, 'pageState:', pageState)
        // If we now have 2 participants and were in waiting_room, move to matched
        if (updated.length >= 2 && pageState === 'waiting_room') {
          console.log('Transitioning to matched state')
          setPageState('matched')
        }
        
        return updated
      })
    })

    // Subscribe to session status changes
    const sessionChannel = subscribeToSession(session.id, (updatedSession) => {
      setSession(updatedSession)
      
      if (updatedSession.status === 'active') {
        // Session started by someone else, navigate to briefing
        navigate(`/briefing/${session.id}?participant=${participantId}`)
      }
    })

    // Subscribe to session participant updates (for survey completion tracking)
    const spUpdateChannel = subscribeToSessionParticipantUpdates(session.id, async (updatedSP) => {
      // Update participant's survey status
      setWaitingRoomParticipants(prev => 
        prev.map(p => 
          p.id === updatedSP.participant_id
            ? { ...p, hasSurveyComplete: updatedSP.pre_survey_completed_at !== null }
            : p
        )
      )
      
      // Check if both surveys are now complete
      if (pageState === 'pre_survey_pending') {
        const surveysComplete = await checkBothSurveysComplete(session.id)
        if (surveysComplete) {
          setPageState('ready_for_briefing')
        }
      }
    })

    // Load existing participants
    loadAllParticipants(session.id, participantId)

    return () => {
      participantChannel.unsubscribe()
      sessionChannel.unsubscribe()
      spUpdateChannel.unsubscribe()
    }
  }, [session, pageState, participantId, navigate, loadAllParticipants])

  // Check if ready after participants update
  useEffect(() => {
    if (waitingRoomParticipants.length >= 2 && pageState === 'waiting_room') {
      setPageState('matched')
    }
  }, [waitingRoomParticipants, pageState])

  // ============================================
  // Navigation Actions
  // ============================================

  function handleProceedToSurvey() {
    console.log('handleProceedToSurvey called', { session: session?.id, participantId, sessionCode })
    if (!session || !participantId) {
      console.warn('Missing session or participantId, cannot proceed to survey')
      return
    }
    const url = `/pre-survey/${participantId}?session=${session.id}&code=${sessionCode}`
    console.log('Navigating to pre-survey:', url)
    navigate(url)
  }

  /** Pair-based flow: create round 1 session for this pair, then go to briefing. */
  async function handleStartSession() {
    if (!session || !participantId) return

    setIsSubmitting(true)
    try {
      const roundSessionId = await createRoundForPair(session.id, 1)
      navigate(`/briefing/${roundSessionId}?participant=${participantId}&pair_session=${session.id}`)
    } catch (err) {
      console.error('Failed to create round session:', err)
      setError('Failed to start. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Batch flow: go to round lobby for slot 1 (matchmaking will pair there). */
  function handleContinueToRound1() {
    if (!participantId || !batchId) return
    navigate(`/round-lobby/1?participant=${participantId}&batch=${batchId}`)
  }

  // ============================================
  // Render Functions
  // ============================================

  function renderCodeEntry() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Users className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Join Negotiation Session
          </h1>
          <p className="text-neutral-600">
            Enter the 6-character session code provided by the researcher
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-error-50 border border-error-200 rounded-md text-error-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="label">Session Code</label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                className="input text-center font-mono text-2xl tracking-widest"
                maxLength={6}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={sessionCode.length !== 6}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    )
  }

  function renderConsent() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Users className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Ready to Join
          </h1>
          <p className="text-neutral-600">
            Session: <span className="font-mono font-medium">{sessionCode}</span>
          </p>
        </div>

        <div className="card">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error-50 border border-error-200 rounded-md text-error-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-neutral-50 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-neutral-900 mb-2">Study Information</h3>
            <p className="text-sm text-neutral-600">
              {batchId
                ? 'You are about to participate in a negotiation experiment. You will complete three rounds with different partners. Your conversation will be recorded for research purposes.'
                : `You are about to participate in a negotiation experiment. You will be paired with another participant and assigned a role (${scenario.roles.roleA.label} or ${scenario.roles.roleB.label}). Your conversation will be recorded for research purposes.`}
            </p>
          </div>

          <div className="flex items-start gap-3 mb-6">
            <input
              type="checkbox"
              id="consent"
              checked={hasConsented}
              onChange={(e) => setHasConsented(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="consent" className="text-sm text-neutral-700">
              I understand and agree to participate in this research study. I consent to 
              having my responses recorded and used for academic research purposes.
            </label>
          </div>

          <button
            onClick={batchId ? handleJoinBatch : handleJoinSession}
            disabled={!hasConsented || isSubmitting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {batchId ? 'Joining...' : 'Joining...'}
              </>
            ) : (
              <>
                {batchId ? 'Continue to Pre-Survey' : 'Join Session'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            setPageState('code_entry')
            setSessionCode('')
          }}
          className="w-full text-center text-sm text-neutral-500 mt-4 hover:text-neutral-700"
        >
          Use a different session code
        </button>
      </div>
    )
  }

  function renderWaitingRoom() {
    const otherParticipant = waitingRoomParticipants.find(p => !p.isCurrentUser)
    
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Clock className="w-8 h-8 text-primary-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Waiting Room
          </h1>
          <p className="text-neutral-600">
            Session: <span className="font-mono font-medium">{sessionCode}</span>
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Participants
          </h2>

          <div className="space-y-3">
            {/* Current user */}
            <div className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
              <div className="p-2 bg-primary-100 rounded-full">
                <User className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-neutral-900">
                  You ({assignedRole ? getRoleLabel(assignedRole) : 'Waiting for role'})
                </p>
                <p className="text-sm text-neutral-600">Ready</p>
              </div>
              <CheckCircle className="w-5 h-5 text-success-600" />
            </div>

            {/* Other participant */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              otherParticipant 
                ? 'bg-success-50 border-success-200' 
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <div className={`p-2 rounded-full ${
                otherParticipant ? 'bg-success-100' : 'bg-neutral-100'
              }`}>
                <User className={`w-4 h-4 ${
                  otherParticipant ? 'text-success-600' : 'text-neutral-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${
                  otherParticipant ? 'text-neutral-900' : 'text-neutral-500'
                }`}>
                  {otherParticipant 
                    ? `Partner (${getRoleLabel(otherParticipant.role)})`
                    : 'Waiting for partner...'
                  }
                </p>
                <p className="text-sm text-neutral-600">
                  {otherParticipant ? 'Ready' : 'Not joined yet'}
                </p>
              </div>
              {otherParticipant ? (
                <CheckCircle className="w-5 h-5 text-success-600" />
              ) : (
                <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
              )}
            </div>
          </div>

          <div className="mt-6 p-4 bg-neutral-50 rounded-lg text-center">
            <p className="text-sm text-neutral-600">
              Waiting for the other participant to join...
            </p>
          </div>
        </div>
      </div>
    )
  }

  function renderMatched() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Partner Joined!
          </h1>
          <p className="text-neutral-600">
            Please complete a brief survey before the negotiation
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Participants
          </h2>

          <div className="space-y-3 mb-6">
            {waitingRoomParticipants.map((p, idx) => (
              <div 
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  p.isCurrentUser 
                    ? 'bg-primary-50 border-primary-200' 
                    : 'bg-success-50 border-success-200'
                }`}
              >
                <div className={`p-2 rounded-full ${
                  p.isCurrentUser ? 'bg-primary-100' : 'bg-success-100'
                }`}>
                  <User className={`w-4 h-4 ${
                    p.isCurrentUser ? 'text-primary-600' : 'text-success-600'
                  }`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">
                    {p.isCurrentUser ? 'You' : 'Partner'} ({getRoleLabel(p.role)})
                  </p>
                </div>
                <CheckCircle className="w-5 h-5 text-success-600" />
              </div>
            ))}
          </div>

          <div className="p-4 bg-blue-50 rounded-lg mb-6">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium text-blue-900">Next Step: Pre-Survey</h3>
            </div>
            <p className="text-sm text-blue-700">
              Before the negotiation, please complete a brief questionnaire about your expectations.
              This will take about 3-5 minutes.
            </p>
          </div>

          <button
            onClick={handleProceedToSurvey}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            Continue to Survey
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  function renderPreSurveyPending() {
    const currentUser = waitingRoomParticipants.find(p => p.isCurrentUser)
    const partner = waitingRoomParticipants.find(p => !p.isCurrentUser)
    
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <Clock className="w-8 h-8 text-primary-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Survey Complete!
          </h1>
          <p className="text-neutral-600">
            Waiting for your partner to finish their survey
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Survey Progress
          </h2>

          <div className="space-y-3 mb-6">
            {/* Current user */}
            <div className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-lg">
              <div className="p-2 bg-success-100 rounded-full">
                <User className="w-4 h-4 text-success-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-neutral-900">
                  You ({currentUser ? getRoleLabel(currentUser.role) : ''})
                </p>
                <p className="text-sm text-success-600">Survey complete ✓</p>
              </div>
              <CheckCircle className="w-5 h-5 text-success-600" />
            </div>

            {/* Partner */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              partner?.hasSurveyComplete
                ? 'bg-success-50 border-success-200' 
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <div className={`p-2 rounded-full ${
                partner?.hasSurveyComplete ? 'bg-success-100' : 'bg-neutral-100'
              }`}>
                <User className={`w-4 h-4 ${
                  partner?.hasSurveyComplete ? 'text-success-600' : 'text-neutral-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${
                  partner?.hasSurveyComplete ? 'text-neutral-900' : 'text-neutral-500'
                }`}>
                  Partner ({partner ? getRoleLabel(partner.role) : ''})
                </p>
                <p className={`text-sm ${
                  partner?.hasSurveyComplete ? 'text-success-600' : 'text-neutral-500'
                }`}>
                  {partner?.hasSurveyComplete ? 'Survey complete ✓' : 'Completing survey...'}
                </p>
              </div>
              {partner?.hasSurveyComplete ? (
                <CheckCircle className="w-5 h-5 text-success-600" />
              ) : (
                <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
              )}
            </div>
          </div>

          <div className="p-4 bg-neutral-50 rounded-lg text-center">
            <p className="text-sm text-neutral-600">
              Please wait while your partner completes their survey...
            </p>
          </div>
        </div>
      </div>
    )
  }

  function renderReadyForBriefing() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Ready to Begin!
          </h1>
          <p className="text-neutral-600">
            Both surveys are complete. Time for your role briefing.
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Participants
          </h2>

          <div className="space-y-3 mb-6">
            {waitingRoomParticipants.map((p, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-lg"
              >
                <div className="p-2 bg-success-100 rounded-full">
                  <User className="w-4 h-4 text-success-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-neutral-900">
                    {p.isCurrentUser ? 'You' : 'Partner'} ({getRoleLabel(p.role)})
                  </p>
                  <p className="text-sm text-success-600">Survey complete ✓</p>
                </div>
                <CheckCircle className="w-5 h-5 text-success-600" />
              </div>
            ))}
          </div>

          <div className="p-4 bg-neutral-50 rounded-lg mb-6">
            <h3 className="font-medium text-neutral-900 mb-2">
              Your Role: {assignedRole ? getRoleLabel(assignedRole) : 'Loading...'}
            </h3>
            <p className="text-sm text-neutral-600">
              You will receive detailed confidential information about your role on the next page.
            </p>
          </div>

          <button
            onClick={handleStartSession}
            disabled={isSubmitting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                Continue to Role Briefing
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  function renderBatchReadyRound1() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Pre-Survey Complete
          </h1>
          <p className="text-neutral-600">
            You will now be matched with a partner for Round 1. Click below to enter the lobby.
          </p>
        </div>
        <div className="card">
          <button
            onClick={handleContinueToRound1}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            Continue to Round 1
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  function renderError() {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-error-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Unable to Join
          </h1>
        </div>

        <div className="card text-center">
          <p className="text-neutral-600 mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null)
              setSessionCode('')
              setPageState('code_entry')
            }}
            className="btn-primary"
          >
            Try Different Code
          </button>
        </div>
      </div>
    )
  }

  function renderLoading() {
    return (
      <div className="w-full max-w-md text-center">
        <Loader2 className="w-12 h-12 text-primary-600 mx-auto mb-4 animate-spin" />
        <p className="text-neutral-600">Loading session...</p>
      </div>
    )
  }

  // ============================================
  // Main Render
  // ============================================

  // Debug logging
  console.log('JoinSessionPage render:', { pageState, participantId, sessionCode, session: session?.id })
  
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      {pageState === 'loading' && renderLoading()}
      {pageState === 'code_entry' && renderCodeEntry()}
      {pageState === 'consent' && renderConsent()}
      {pageState === 'waiting_room' && renderWaitingRoom()}
      {pageState === 'matched' && renderMatched()}
      {pageState === 'pre_survey_pending' && renderPreSurveyPending()}
      {pageState === 'ready_for_briefing' && renderReadyForBriefing()}
      {pageState === 'batch_ready_round_1' && renderBatchReadyRound1()}
      {pageState === 'error' && renderError()}
    </div>
  )
}

export default JoinSessionPage
