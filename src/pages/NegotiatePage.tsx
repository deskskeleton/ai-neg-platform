import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { 
  AlertCircle, 
  Loader2,
  CheckCircle,
  X
} from 'lucide-react'
import { 
  getSession,
  getSessionMessages,
  sendMessage,
  subscribeToMessages,
  subscribeToSession,
  logEvent,
  endSession,
  forceEndSession,
  getSessionParticipantByIds,
  isBackendConfigured
} from '@/lib/data'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { NegotiationTimer } from '@/components/chat/NegotiationTimer'
import { ScenarioInfo } from '@/components/chat/ScenarioInfo'
import { AssistantPanel } from '@/components/assistant'
import { OfferPanel, PayoffReference, type OfferSelection } from '@/components/negotiation'
import { SCENARIO_CONFIG, calculatePoints, getRoleKey, getScenarioById, type ScenarioConfig } from '@/config/scenarios'
import { getRoundLabel } from '@/utils/roundLabels'
import type { Session, Message, ParticipantRole } from '@/types/database.types'

// ============================================
// Types
// ============================================

interface ParticipantInfo {
  id: string
  role: ParticipantRole
  treatmentCondition?: string | null
}

// ============================================
// Component
// ============================================

/**
 * NegotiatePage Component
 * 
 * Main negotiation interface with real-time chat.
 * Layout:
 * - Top: Scenario info and timer
 * - Left (70%): Chat interface
 * - Right (30%): AI Assistant panel
 */
function NegotiatePage() {
  // URL params
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const participantId = searchParams.get('participant')
  const pairSessionId = searchParams.get('pair_session')
  const batchId = searchParams.get('batch')

  // State
  const [session, setSession] = useState<Session | null>(null)
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_CONFIG)
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [isTimeExpired, setIsTimeExpired] = useState(false)
  const [autoNavCountdown, setAutoNavCountdown] = useState(5)
  
  // Offer state
  const [pendingOffer, setPendingOffer] = useState<{
    id: string;
    selection: OfferSelection;
    senderRole: string;
    senderParticipantId: string;
    timestamp: Date;
    status: 'pending' | 'accepted' | 'rejected';
  } | null>(null)
  const [agreement, setAgreement] = useState<OfferSelection | null>(null)

  // ============================================
  // Data Loading
  // ============================================

  // Load session and participant data
  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided')
      setIsLoading(false)
      return
    }

    if (!isBackendConfigured()) {
      setError('Backend not configured')
      setIsLoading(false)
      return
    }

    loadSessionData()
  }, [sessionId, participantId])

  async function loadSessionData() {
    if (!sessionId) return
    
    setIsLoading(true)
    setError(null)

    try {
      // Load session
      const sessionData = await getSession(sessionId)
      
      if (!sessionData) {
        setError('Session not found')
        return
      }

      setSession(sessionData)
      
      // Load scenario config based on session's scenario
      const scenarioConfig = getScenarioById(sessionData.negotiation_scenario)
      setScenario(scenarioConfig)

      // Load participant info via data layer
      if (participantId) {
        const participantData = await getSessionParticipantByIds(sessionId, participantId)

        if (participantData) {
          setParticipant({
            id: participantData.participant_id,
            role: participantData.role as ParticipantRole,
            treatmentCondition: (participantData as Record<string, unknown>).treatment_condition as string | null ?? null
          })
        }
      } else {
        // If no participant ID, try to get from session participants
        // (fallback; normally participantId is always provided)
        const participantData = await getSessionParticipantByIds(sessionId, '')

        if (participantData) {
          setParticipant({
            id: participantData.participant_id,
            role: participantData.role as ParticipantRole,
            treatmentCondition: (participantData as Record<string, unknown>).treatment_condition as string | null ?? null
          })
        }
      }

      // Load existing messages
      const existingMessages = await getSessionMessages(sessionId!)
      setMessages(existingMessages)

      // Log page view event
      if (participantId) {
        await logEvent({
          session_id: sessionId!,
          participant_id: participantId,
          event_type: 'page_view',
          event_data: { page: 'negotiate' }
        })
      }

    } catch (err) {
      console.error('Failed to load session:', err)
      setError('Failed to load session data')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================
  // Real-time Subscriptions
  // ============================================

  useEffect(() => {
    if (!sessionId || !session) return

    // Subscribe to new messages
    const messageChannel = subscribeToMessages(sessionId, (newMessage) => {
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.id === newMessage.id)) return prev
        return [...prev, newMessage]
      })
    })

    // Subscribe to session updates
    const sessionChannel = subscribeToSession(sessionId, (updatedSession) => {
      setSession(updatedSession)
      
      if (updatedSession.status === 'completed' && participant) {
        const r = (updatedSession as { round_number?: number | null }).round_number
        const roundQ = r != null ? `&round=${r}` : ''
        const pairQ = pairSessionId ? `&pair_session=${pairSessionId}` : ''
        const batchQ = batchId ? `&batch=${batchId}` : ''
        navigate(`/post-survey/${participant.id}?session=${sessionId}${roundQ}${pairQ}${batchQ}`)
      }
    })

    return () => {
      messageChannel.unsubscribe()
      sessionChannel.unsubscribe()
    }
  }, [sessionId, session, participant, pairSessionId, batchId, navigate])

  // ============================================
  // Message Sending
  // ============================================

  const handleSendMessage = useCallback(async (content: string) => {
    if (!sessionId || !participant) {
      throw new Error('Session or participant not loaded')
    }

    await sendMessage(sessionId, participant.id, content)
  }, [sessionId, participant])

  // ============================================
  // Offer Handling
  // ============================================

  // Check for offer messages and update state
  useEffect(() => {
    // Look for the most recent offer message
    const offerMessages = messages.filter(m => m.message_type === 'offer')
    
    if (offerMessages.length === 0) {
      setPendingOffer(null)
      return
    }
    
    // Get the last offer
    const lastOffer = offerMessages[offerMessages.length - 1]
    
    // Check if the latest offer was accepted or rejected
    // Search from the end to find the most recent acceptance/rejection (not an old one from a prior cycle)
    const reversed = [...messages].reverse()
    const lastAcceptance = reversed.find(
      (m: Message) => m.message_type === 'acceptance' &&
           new Date(m.timestamp) > new Date(lastOffer.timestamp)
    )
    const lastRejection = reversed.find(
      (m: Message) => m.message_type === 'rejection' &&
           new Date(m.timestamp) > new Date(lastOffer.timestamp)
    )
    
    if (lastAcceptance) {
      // Agreement reached!
      const offerData = lastOffer.metadata as { offer?: OfferSelection } | null
      if (offerData?.offer) {
        setAgreement(offerData.offer)
        setPendingOffer(null)
      }
    } else if (lastRejection) {
      // Offer was rejected
      setPendingOffer(null)
    } else {
      // Offer is still pending
      const offerData = lastOffer.metadata as { offer?: OfferSelection; senderRole?: string } | null
      if (offerData?.offer) {
        setPendingOffer({
          id: lastOffer.id,
          selection: offerData.offer,
          senderRole: offerData.senderRole ?? '',
          senderParticipantId: lastOffer.participant_id,
          timestamp: new Date(lastOffer.timestamp),
          status: 'pending',
        })
      }
    }
  }, [messages])

  // Make an offer
  const handleMakeOffer = useCallback(async (selection: OfferSelection) => {
    if (!sessionId || !participant) return
    
    // Send offer as a special message via data layer
    const offerText = formatOfferMessage(selection)
    
    await sendMessage(sessionId, participant.id, offerText, 'offer', {
      offer: selection,
      senderRole: participant.role,
    })
    
    // Log event
    await logEvent({
      session_id: sessionId,
      participant_id: participant.id,
      event_type: 'offer_made',
      event_data: { offer: selection },
    })
  }, [sessionId, participant])

  // Accept an offer - ends the negotiation
  const handleAcceptOffer = useCallback(async () => {
    if (!sessionId || !participant || !pendingOffer) return
    
    // Send acceptance message via data layer
    await sendMessage(sessionId, participant.id, '✅ I accept this offer. Agreement reached!', 'acceptance', {
      acceptedOfferId: pendingOffer.id,
      offer: pendingOffer.selection,
    })
    
    // Calculate points and log
    const roleKey = getRoleKey(participant.role)
    const completeOffer: Record<string, number> = {}
    for (const [key, value] of Object.entries(pendingOffer.selection)) {
      if (value !== undefined) completeOffer[key] = value
    }
    const points = roleKey ? calculatePoints(completeOffer, roleKey) : 0
    
    await logEvent({
      session_id: sessionId,
      participant_id: participant.id,
      event_type: 'offer_accepted',
      event_data: { 
        offer: pendingOffer.selection,
        points,
      },
    })
    
    // Update agreement state locally
    setAgreement(pendingOffer.selection)
    setPendingOffer(null)
    
    // End the session with the agreement
    try {
      await endSession(sessionId, true, pendingOffer.selection)
      // Navigation will happen via session subscription when status changes to 'completed'
    } catch (err) {
      console.error('Failed to end session:', err)
      // Still show agreement locally even if session update fails
    }
  }, [sessionId, participant, pendingOffer])

  // Reject an offer
  const handleRejectOffer = useCallback(async () => {
    if (!sessionId || !participant || !pendingOffer) return
    
    // Send rejection message via data layer
    await sendMessage(sessionId, participant.id, '❌ I cannot accept this offer.', 'rejection', {
      rejectedOfferId: pendingOffer.id,
    })
    
    await logEvent({
      session_id: sessionId,
      participant_id: participant.id,
      event_type: 'offer_rejected',
      event_data: { offer: pendingOffer.selection },
    })
    
    setPendingOffer(null)
  }, [sessionId, participant, pendingOffer])

  // Format offer as readable message
  function formatOfferMessage(selection: OfferSelection): string {
    const lines = ['📋 **Formal Offer:**']
    for (const issue of scenario.issues) {
      const selectedIndex = selection[issue.id]
      if (selectedIndex !== undefined) {
        const option = issue.options[selectedIndex]
        lines.push(`• ${issue.label}: ${option?.label ?? 'Unknown'}`)
      }
    }
    return lines.join('\n')
  }

  // ============================================
  // Session End
  // ============================================

  async function handleEndSession(reachedAgreement: boolean) {
    if (!sessionId) return

    try {
      await endSession(sessionId, reachedAgreement)
      
      if (participant) {
        const roundNum = (session as { round_number?: number | null })?.round_number
        const roundQ = roundNum != null ? `&round=${roundNum}` : ''
        const pairQ = pairSessionId ? `&pair_session=${pairSessionId}` : ''
        const batchQ = batchId ? `&batch=${batchId}` : ''
        navigate(`/post-survey/${participant.id}?session=${sessionId}${roundQ}${pairQ}${batchQ}`)
      }
    } catch (err) {
      console.error('Failed to end session:', err)
      setError('Failed to end session')
    }
  }

  // Timer expiry handler - AUTO-ENDS session without confirmation
  const handleTimeUp = useCallback(async () => {
    if (!sessionId || !participant || isTimeExpired) return
    
    setIsTimeExpired(true)
    
    try {
      // Force end the session due to timer expiry
      await forceEndSession(sessionId, participant.id)
      // Session subscription will handle the status update
    } catch (err) {
      console.error('Failed to auto-end session:', err)
      // Even if the server call fails, show the expired overlay
      // The session may already be ended by the other participant
    }
  }, [sessionId, participant, isTimeExpired])

  // Auto-navigation countdown when time expires
  useEffect(() => {
    if (!isTimeExpired || !participant || !sessionId) return
    
    const timer = setInterval(() => {
      setAutoNavCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          const roundNum = (session as { round_number?: number | null })?.round_number
          const roundQ = roundNum != null ? `&round=${roundNum}` : ''
          const pairQ = pairSessionId ? `&pair_session=${pairSessionId}` : ''
          const batchQ = batchId ? `&batch=${batchId}` : ''
          navigate(`/post-survey/${participant.id}?session=${sessionId}${roundQ}${pairQ}${batchQ}`)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [isTimeExpired, participant, sessionId, session, pairSessionId, batchId, navigate])

  // ============================================
  // Render States
  // ============================================

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-neutral-600">Loading negotiation session...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="card max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Error</h1>
          <p className="text-neutral-600 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Return Home
          </button>
        </div>
      </div>
    )
  }

  if (!session || !participant) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="card max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-warning-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Session Not Found</h1>
          <p className="text-neutral-600 mb-4">Unable to load session or participant data.</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Return Home
          </button>
        </div>
      </div>
    )
  }

  // Session is active only if not expired and status is active
  const isSessionActive = session.status === 'active' && !isTimeExpired
  const isSessionCompleted = session.status === 'completed'

  // ============================================
  // Main Render
  // ============================================

  return (
    <div className="h-screen flex flex-col bg-neutral-100">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-semibold text-neutral-900">Negotiation Session</h1>
            {getRoundLabel(session.negotiation_scenario) && (
              <span className="text-sm font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                {getRoundLabel(session.negotiation_scenario)}
              </span>
            )}
            <span className="text-sm text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
              {session.session_code}
            </span>
            <StatusBadge status={session.status} />
          </div>
          
          <div className="flex items-center gap-4">
            {/* Timer */}
            <NegotiationTimer
              durationMinutes={session.time_limit_minutes}
              startedAt={session.started_at}
              isActive={isSessionActive}
              onTimeUp={handleTimeUp}
            />
            
            {/* End Session Button */}
            {isSessionActive && (
              <button
                onClick={() => setShowEndConfirm(true)}
                className="btn-secondary text-sm"
              >
                End Session
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Scenario Info */}
      <div className="px-4 py-3 flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto">
          <ScenarioInfo 
            scenario={scenario} 
            role={participant.role}
            isExpanded={false}
          />
        </div>
      </div>

      {/* Main Content - Three Column Layout */}
      <div className="flex-1 flex overflow-hidden px-4 pb-4">
        <div className="max-w-screen-2xl mx-auto flex gap-4 w-full h-full">
          
          {/* Left Column - Chat */}
          <div className="flex-1 min-w-0" style={{ flex: '1 1 35%', minWidth: '300px' }}>
            <ChatInterface
              messages={messages}
              currentParticipantId={participant.id}
              currentRole={participant.role}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              disabled={!isSessionActive}
              scenario={scenario}
            />
          </div>

          {/* Middle Column - Payoff Reference + Offer Panel */}
          <div 
            className="flex flex-col gap-3 overflow-y-auto"
            style={{ flex: '0 0 320px', minWidth: '300px', maxWidth: '360px' }}
          >
            {/* Quick Reference - Always visible */}
            <div className="flex-shrink-0">
              <PayoffReference 
                role={participant.role} 
                defaultExpanded={true}
                scenario={scenario}
                treatmentCondition={participant.treatmentCondition as 'payoff_always_visible' | 'payoff_collapsible' | undefined}
              />
            </div>
            
            {/* Offer Panel */}
            <div className="flex-1">
              <OfferPanel
                participantId={participant.id}
                participantRole={participant.role}
                pendingOffer={pendingOffer}
                agreement={agreement}
                onMakeOffer={handleMakeOffer}
                onAcceptOffer={handleAcceptOffer}
                onRejectOffer={handleRejectOffer}
                disabled={!isSessionActive || !!agreement}
                defaultCollapsed={false}
                scenario={scenario}
              />
            </div>
          </div>
          
          {/* Right Column - AI Assistant */}
          <div 
            className="flex flex-col"
            style={{ flex: '0 0 340px', minWidth: '320px', maxWidth: '380px' }}
          >
            <AssistantPanel
              sessionId={sessionId!}
              participantId={participant.id}
              disabled={!isSessionActive}
              maxQueriesOverride={session.ai_query_limit ?? undefined}
            />
          </div>
        </div>
      </div>

      {/* End Session Confirmation Modal */}
      {showEndConfirm && (
        <EndSessionModal
          onClose={() => setShowEndConfirm(false)}
          onEnd={handleEndSession}
        />
      )}

      {/* Session Completed Overlay */}
      {isSessionCompleted && !isTimeExpired && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md text-center">
            <CheckCircle className="w-16 h-16 text-success-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Session Completed
            </h2>
            <p className="text-neutral-600 mb-4">
              The negotiation session has ended.
            </p>
            <button
              onClick={() => {
                const r = (session as { round_number?: number | null })?.round_number
                const roundQ = r != null ? `&round=${r}` : ''
                const pairQ = pairSessionId ? `&pair_session=${pairSessionId}` : ''
                const batchQ = batchId ? `&batch=${batchId}` : ''
                navigate(`/post-survey/${participant.id}?session=${sessionId}${roundQ}${pairQ}${batchQ}`)
              }}
              className="btn-primary"
            >
              Continue to Survey
            </button>
          </div>
        </div>
      )}

      {/* Time Expired Overlay - Takes priority, auto-navigates */}
      {isTimeExpired && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="card max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Time Has Expired
            </h2>
            <p className="text-neutral-600 mb-4">
              The negotiation time limit has been reached. The session has ended automatically.
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              Redirecting to survey in <span className="font-bold text-red-600">{autoNavCountdown}</span> seconds...
            </p>
            <button
              onClick={() => {
                const r = (session as { round_number?: number | null })?.round_number
                const roundQ = r != null ? `&round=${r}` : ''
                const pairQ = pairSessionId ? `&pair_session=${pairSessionId}` : ''
                const batchQ = batchId ? `&batch=${batchId}` : ''
                navigate(`/post-survey/${participant.id}?session=${sessionId}${roundQ}${pairQ}${batchQ}`)
              }}
              className="btn-primary"
            >
              Continue to Survey Now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Helper Components
// ============================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    waiting: 'bg-warning-50 text-warning-700',
    active: 'bg-success-50 text-success-700',
    completed: 'bg-neutral-100 text-neutral-700',
    cancelled: 'bg-error-50 text-error-700'
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.waiting}`}>
      {status}
    </span>
  )
}

// ============================================
// End Session Modal
// ============================================

interface EndSessionModalProps {
  onClose: () => void
  onEnd: (reachedAgreement: boolean) => void
}

function EndSessionModal({ onClose, onEnd }: EndSessionModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card max-w-md mx-4">
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">
          End Negotiation Session
        </h2>
        <p className="text-neutral-600 mb-6">
          Did you and your partner reach an agreement?
        </p>
        
        <div className="space-y-3">
          <button
            onClick={() => onEnd(true)}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Yes, we reached an agreement
          </button>
          <button
            onClick={() => onEnd(false)}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <X className="w-5 h-5" />
            No agreement reached
          </button>
          <button
            onClick={onClose}
            className="w-full text-neutral-500 hover:text-neutral-700 text-sm py-2"
          >
            Cancel - Continue negotiating
          </button>
        </div>
      </div>
    </div>
  )
}

export default NegotiatePage
