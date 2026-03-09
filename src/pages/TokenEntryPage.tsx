import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { 
  Users, 
  ArrowRight, 
  AlertCircle, 
  Loader2
} from 'lucide-react'
import { 
  getToken,
  claimToken,
  getSession,
  ApiError,
  isBackendConfigured
} from '@/lib/data'
import type { ParticipantToken } from '@/types/database.types'

// ============================================
// NOTE: This page may be over-engineering.
// See DEVELOPMENT_LOG.md for revert instructions.
// ============================================

/**
 * TokenEntryPage Component
 * 
 * Handles pre-generated participant URLs for lab settings.
 * URL format: /p/{token}?from=qualtrics&rid={responseId}
 * 
 * UPDATED FLOW (Match-First, Survey-After):
 * 1. Load token from URL
 * 2. Show consent checkbox
 * 3. Claim token → auto-create participant & join session
 * 4. Navigate to waiting room (JoinSessionPage)
 * 5. After BOTH participants joined → Pre-survey
 * 6. After BOTH complete survey → Role briefing → Negotiate
 * 
 * This ensures both participants are present before survey time is "spent"
 * and keeps trust measures temporally close to the negotiation.
 */

type PageState = 
  | 'loading'
  | 'consent'
  | 'claiming'
  | 'error'

function TokenEntryPage() {
  const { token: urlToken } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  // URL params for Qualtrics integration (kept for potential future use)
  const fromQualtrics = searchParams.get('from') === 'qualtrics'
  const qualtricsResponseId = searchParams.get('rid')
  
  // State
  const [pageState, setPageState] = useState<PageState>('loading')
  const [tokenData, setTokenData] = useState<ParticipantToken | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasConsented, setHasConsented] = useState(false)

  // ============================================
  // Token Validation
  // ============================================

  useEffect(() => {
    if (!isBackendConfigured()) {
      setError('Database not configured')
      setPageState('error')
      return
    }

    if (!urlToken) {
      setError('No token provided')
      setPageState('error')
      return
    }

    validateToken(urlToken.toUpperCase())
  }, [urlToken])

  async function validateToken(token: string) {
    setPageState('loading')
    
    try {
      const data = await getToken(token)
      
      if (!data) {
        setError('Invalid or expired token. Please check your URL.')
        setPageState('error')
        return
      }
      
      if (data.claimed_at) {
        setError('This token has already been used.')
        setPageState('error')
        return
      }
      
      // Get session info
      const sessionData = await getSession(data.session_id)
      
      if (!sessionData) {
        setError('Session not found.')
        setPageState('error')
        return
      }
      
      if (sessionData.status !== 'waiting') {
        setError(`Session is ${sessionData.status}. Cannot join.`)
        setPageState('error')
        return
      }
      
      setTokenData(data)
      setPageState('consent')
      
    } catch (err) {
      console.error('Token validation error:', err)
      setError('Failed to validate token. Please try again.')
      setPageState('error')
    }
  }

  // ============================================
  // Claim Token & Join
  // ============================================

  async function handleClaimToken() {
    if (!tokenData || !hasConsented) return
    
    setPageState('claiming')
    
    try {
      // Build metadata for Qualtrics integration
      const metadata: Record<string, unknown> = {}
      if (fromQualtrics && qualtricsResponseId) {
        metadata.qualtrics_response_id = qualtricsResponseId
        metadata.from_qualtrics = true
      }
      
      const result = await claimToken(tokenData.token, metadata)
      
      // MATCH-FIRST FLOW: Navigate to waiting room
      // Pre-survey happens AFTER both participants have joined
      // Navigate to JoinSessionPage which handles the waiting room + survey flow
      navigate(`/join/${result.session.session_code}?participant=${result.participant.id}&from=token`)
      
    } catch (err) {
      console.error('Claim token error:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to join session. Please try again.')
      }
      setPageState('error')
    }
  }

  // ============================================
  // Render
  // ============================================

  if (pageState === 'loading' || pageState === 'claiming') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600">
            {pageState === 'claiming' ? 'Joining session...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-error-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Unable to Join</h1>
          <div className="card">
            <p className="text-neutral-600 mb-4">{error}</p>
            <p className="text-sm text-neutral-500">
              Please contact the researcher for assistance.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (pageState === 'consent') {
    const roleLabel = tokenData?.role === 'pm' ? 'Project Manager' : 'Developer'
    
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <Users className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Welcome to the Negotiation Study
            </h1>
            <p className="text-neutral-600">
              Your role: <span className="font-semibold">{roleLabel}</span>
            </p>
          </div>

          <div className="card">
            {fromQualtrics && (
              <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-md text-sm text-primary-700">
                ✓ Connected from Qualtrics survey
              </div>
            )}
            
            <div className="bg-neutral-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-neutral-900 mb-2">Study Information</h3>
              <p className="text-sm text-neutral-600">
                You are about to participate in a negotiation experiment. You will be 
                paired with another participant. Your conversation will be recorded 
                for research purposes.
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
              onClick={handleClaimToken}
              disabled={!hasConsented}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Join Session
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // This should not be reached - all states are handled above
  return null
}

export default TokenEntryPage
