import { useState, useEffect } from 'react'
import { 
  Plus, 
  Users, 
  Clock, 
  CheckCircle, 
  Play, 
  Square, 
  Copy, 
  RefreshCw,
  AlertCircle,
  Trash2,
  Link,
  X,
  Printer,
  User,
  Timer,
  PlusCircle,
  Download,
  FileText
} from 'lucide-react'
import {
  createBatch,
  matchBatchForRound,
  getBatchRoundQueueCounts,
  clearAllBatchesAndRoundSessions,
  updateSession,
  generateSessionTokens,
  getSessionTokens,
  getSessionMessages,
  getSessionEvents,
  fetchAdminSessions,
  fetchAdminBatches,
  fetchBatchPoints,
  deleteSession,
  removeSessionParticipant,
  clearSessionParticipants,
  exportSessionData,
  ApiError
} from '@/lib/data'
import { getScenarioById, calculatePoints, getRoleKey } from '@/config/scenarios'
import type { Session, SessionParticipant, ParticipantToken, ExperimentBatch } from '@/types/database.types'

// Batches have no form fields; Create Batch is a single action

// ============================================
// Types
// ============================================

interface SessionWithParticipantCount extends Session {
  participant_count: number
  participants: SessionParticipant[]
}

interface BatchWithCount extends ExperimentBatch {
  participant_count: number
}

interface BatchPointRow {
  participant_id: string
  email: string
  session_id: string
  round_number: number
  negotiation_scenario: string | null
  agreement_reached: boolean | null
  final_agreement: Record<string, number> | null
  role: string
}

// ============================================
// Component
// ============================================

/**
 * AdminPage Component
 * 
 * Dashboard for researchers to manage negotiation experiment sessions.
 * Features:
 * - Create new sessions with auto-generated codes
 * - View all sessions with their status
 * - Start/end sessions
 * - Copy session codes for sharing
 */
// Admin password from environment variable
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin'

function AdminPage() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if already authenticated in this session
    return sessionStorage.getItem('admin_auth') === 'true'
  })
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState(false)

  // State
  const [sessions, setSessions] = useState<SessionWithParticipantCount[]>([])
  const [batches, setBatches] = useState<BatchWithCount[]>([])
  const [batchQueueCounts, setBatchQueueCounts] = useState<Record<string, { 1: number; 2: number; 3: number }>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Token modal state (for pre-generated URLs feature)
  const [tokenModalSession, setTokenModalSession] = useState<SessionWithParticipantCount | null>(null)
  const [sessionTokens, setSessionTokens] = useState<ParticipantToken[]>([])
  const [isGeneratingTokens, setIsGeneratingTokens] = useState(false)
  
  // Participant management modal
  const [participantModalSession, setParticipantModalSession] = useState<SessionWithParticipantCount | null>(null)

  // Batch points distribution
  const [batchPointsId, setBatchPointsId] = useState<string | null>(null)
  const [batchPointsData, setBatchPointsData] = useState<BatchPointRow[]>([])
  const [isLoadingPoints, setIsLoadingPoints] = useState(false)
  
  // Timer state - trigger re-render every second for active session timers
  const [, setTimerTick] = useState(0)
  
  // Update timer display every second
  useEffect(() => {
    const hasActiveSessions = sessions.some(s => s.status === 'active')
    if (!hasActiveSessions) return
    
    const interval = setInterval(() => {
      setTimerTick(t => t + 1)
    }, 1000)
    
    return () => clearInterval(interval)
  }, [sessions])

  // No form for Create Batch (single button action)

  // ============================================
  // Data Fetching - MUST be before any conditional returns
  // ============================================

  // Fetch all sessions when authenticated, and auto-refresh every 15 seconds
  useEffect(() => {
    if (!isAuthenticated) return
    fetchSessions(true)
    const interval = setInterval(() => fetchSessions(false), 15_000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // ============================================
  // Authentication
  // ============================================

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      sessionStorage.setItem('admin_auth', 'true')
      setAuthError(false)
    } else {
      setAuthError(true)
    }
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Admin Access
            </h1>
            <p className="text-neutral-600">
              Enter password to access the dashboard
            </p>
          </div>
          
          <form onSubmit={handleLogin} className="card">
            {authError && (
              <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded-md text-error-700 text-sm">
                Incorrect password
              </div>
            )}
            
            <div className="mb-4">
              <label className="label">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="input"
                autoFocus
              />
            </div>
            
            <button type="submit" className="btn-primary w-full">
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  async function fetchSessions(showLoading = true) {
    if (showLoading) setIsLoading(true)
    setError(null)

    try {
      // Fetch sessions and batches via data layer
      const [sessionsData, batchesData] = await Promise.all([
        fetchAdminSessions(),
        fetchAdminBatches(),
      ])

      const sessionsWithCounts = (sessionsData as Array<Session & { participants?: SessionParticipant[] }>).map(session => ({
        ...session,
        participant_count: session.participants?.length ?? 0,
        participants: session.participants ?? [],
      })) as SessionWithParticipantCount[]
      setSessions(sessionsWithCounts)

      const batchIds = (batchesData as Array<ExperimentBatch & { participant_count?: number }>).map(b => b.id)
      setBatches((batchesData as Array<ExperimentBatch & { participant_count?: number }>).map(b => ({
        ...b,
        participant_count: b.participant_count ?? 0,
      })))
      if (batchIds.length > 0) {
        const queueCounts = await getBatchRoundQueueCounts(batchIds)
        setBatchQueueCounts(queueCounts)
      } else {
        setBatchQueueCounts({})
      }
      setHasLoaded(true)
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
      setError('Failed to load sessions. Check your backend configuration.')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================
  // Session Actions
  // ============================================

  /** Create a batch (18 = full run, 6 = test batch with pre-seeded matching). */
  async function onCreateBatch(maxParticipants: number) {
    setIsCreating(true)
    setError(null)
    try {
      const newBatch = await createBatch(maxParticipants)
      setBatches(prev => [{ ...newBatch, participant_count: 0 }, ...prev])
      setShowCreateForm(false)
    } catch (err) {
      console.error('Failed to create batch:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to create batch. Please try again.')
      }
    } finally {
      setIsCreating(false)
    }
  }

  async function handleViewBatchPoints(batchId: string) {
    if (batchPointsId === batchId) {
      setBatchPointsId(null)
      return
    }
    setIsLoadingPoints(true)
    setBatchPointsId(batchId)
    try {
      const rows = await fetchBatchPoints(batchId)
      setBatchPointsData(rows as BatchPointRow[])
    } catch (err) {
      console.error('Failed to load batch points:', err)
    } finally {
      setIsLoadingPoints(false)
    }
  }

  async function handleClearBatchesAndRoundSessions() {
    if (!window.confirm('Remove all batches, all round sessions, and the round queue? Participants will remain. This cannot be undone.')) return
    setError(null)
    try {
      const result = await clearAllBatchesAndRoundSessions()
      await fetchSessions()
      setError(null)
      alert(`Cleared: ${result.sessions_deleted} round session(s), ${result.queue_deleted} queue row(s), ${result.batches_deleted} batch(es).`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('Clear failed: ' + msg)
    }
  }

  /** Start all round sessions that are waiting and have 2 participants (paired but not yet started). */
  async function handleStartAllWaitingRoundSessions() {
    const toStart = sessions.filter(
      s => s.round_number != null && s.status === 'waiting' && s.participant_count === 2
    )
    if (toStart.length === 0) return
    setError(null)
    try {
      const now = new Date().toISOString()
      await Promise.all(
        toStart.map(s => updateSession(s.id, { status: 'active', started_at: now }))
      )
      await fetchSessions()
    } catch (err) {
      console.error('Start all waiting failed:', err)
      setError('Failed to start some sessions. Try starting them individually.')
    }
  }

  async function handleStartSession(sessionId: string) {
    try {
      await updateSession(sessionId, {
        status: 'active',
        started_at: new Date().toISOString()
      })
      
      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, status: 'active', started_at: new Date().toISOString() }
          : s
      ))
    } catch (err) {
      console.error('Failed to start session:', err)
      setError('Failed to start session.')
    }
  }

  async function handleEndSession(sessionId: string) {
    try {
      await updateSession(sessionId, {
        status: 'completed',
        ended_at: new Date().toISOString()
      })
      
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, status: 'completed', ended_at: new Date().toISOString() }
          : s
      ))
    } catch (err) {
      console.error('Failed to end session:', err)
      setError('Failed to end session.')
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) {
      return
    }

    try {
      await deleteSession(sessionId)
      
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (err) {
      console.error('Failed to delete session:', err)
      setError('Failed to delete session.')
    }
  }

  function copySessionCode(code: string) {
    // Build URL robustly - fallback to constructing from parts if origin is incomplete
    const origin = window.location.origin.length > 10 
      ? window.location.origin 
      : `${window.location.protocol}//${window.location.host}`
    const url = `${origin}/join/${code}`
    
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopiedCode(code)
        setTimeout(() => setCopiedCode(null), 2000)
      })
      .catch((err) => {
        console.error('Failed to copy:', err)
        // Fallback: prompt user to copy manually
        prompt('Copy this URL:', url)
      })
  }

  // ============================================
  // Token Management (Pre-generated URLs)
  // NOTE: May be over-engineering. See DEVELOPMENT_LOG.md
  // ============================================

  async function openTokenModal(session: SessionWithParticipantCount) {
    setTokenModalSession(session)
    setIsGeneratingTokens(true)
    
    try {
      // First check if tokens already exist
      const existingTokens = await getSessionTokens(session.id)
      
      if (existingTokens.length > 0) {
        setSessionTokens(existingTokens)
      } else {
        // Generate new tokens then fetch full data
        await generateSessionTokens(session.id)
        const fullTokens = await getSessionTokens(session.id)
        setSessionTokens(fullTokens)
      }
    } catch (err) {
      console.error('Failed to get/generate tokens:', err)
      setError('Failed to generate participant URLs. Make sure you ran the 003_participant_tokens.sql migration.')
    } finally {
      setIsGeneratingTokens(false)
    }
  }

  function copyTokenUrl(token: string) {
    // Build URL robustly - fallback to constructing from parts if origin is incomplete
    const origin = window.location.origin.length > 10 
      ? window.location.origin 
      : `${window.location.protocol}//${window.location.host}`
    const url = `${origin}/p/${token}`
    
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopiedCode(token)
        setTimeout(() => setCopiedCode(null), 2000)
      })
      .catch((err) => {
        console.error('Failed to copy:', err)
        // Fallback: prompt user to copy manually
        prompt('Copy this URL:', url)
      })
  }

  function printTokens() {
    window.print()
  }

  // ============================================
  // Participant Management
  // ============================================

  async function handleRemoveParticipant(sessionId: string, participantId: string) {
    if (!confirm('Remove this participant from the session?')) return

    try {
      await removeSessionParticipant(sessionId, participantId)

      // Update local state
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          const updatedParticipants = s.participants.filter(p => p.participant_id !== participantId)
          return {
            ...s,
            participants: updatedParticipants,
            participant_count: updatedParticipants.length
          }
        }
        return s
      }))

      // Update modal state if open
      if (participantModalSession?.id === sessionId) {
        setParticipantModalSession(prev => {
          if (!prev) return null
          const updatedParticipants = prev.participants.filter(p => p.participant_id !== participantId)
          return {
            ...prev,
            participants: updatedParticipants,
            participant_count: updatedParticipants.length
          }
        })
      }
    } catch (err) {
      console.error('Failed to remove participant:', err)
      setError('Failed to remove participant.')
    }
  }

  async function handleClearAllParticipants(sessionId: string) {
    if (!confirm('Remove ALL participants from this session? They will need to rejoin.')) return

    try {
      await clearSessionParticipants(sessionId)

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, participants: [], participant_count: 0 }
          : s
      ))

      // Close modal
      setParticipantModalSession(null)
    } catch (err) {
      console.error('Failed to clear participants:', err)
      setError('Failed to clear participants.')
    }
  }

  // ============================================
  // Timer Extension
  // ============================================

  async function handleExtendTime(sessionId: string, minutes: number = 5) {
    try {
      const session = sessions.find(s => s.id === sessionId)
      if (!session) return
      
      // Extend the time limit
      const newTimeLimit = session.time_limit_minutes + minutes
      
      await updateSession(sessionId, {
        time_limit_minutes: newTimeLimit
      })
      
      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, time_limit_minutes: newTimeLimit }
          : s
      ))
    } catch (err) {
      console.error('Failed to extend time:', err)
      setError('Failed to extend session time.')
    }
  }

  // ============================================
  // Data Export Functions
  // ============================================

  // Helper to convert data to CSV
  function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
    const escapeCSV = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }
    
    const headerRow = headers.map(escapeCSV).join(',')
    const dataRows = rows.map(row => row.map(escapeCSV).join(','))
    return [headerRow, ...dataRows].join('\n')
  }

  // Trigger file download
  function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Export messages for a session
  async function handleExportMessages(sessionId: string, sessionCode: string) {
    try {
      const messages = await getSessionMessages(sessionId)
      
      if (messages.length === 0) {
        alert('No messages to export for this session.')
        return
      }
      
      const headers = ['timestamp', 'participant_id', 'message_type', 'content']
      const rows = messages.map(m => [
        m.timestamp,
        m.participant_id,
        m.message_type,
        m.content
      ])
      
      const csv = toCSV(headers, rows)
      downloadCSV(csv, `session_${sessionCode}_messages.csv`)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Failed to export messages.')
    }
  }

  // Export events for a session
  async function handleExportEvents(sessionId: string, sessionCode: string) {
    try {
      const events = await getSessionEvents(sessionId)
      
      if (events.length === 0) {
        alert('No events to export for this session.')
        return
      }
      
      const headers = ['timestamp', 'participant_id', 'event_type', 'event_data']
      const rows = events.map(e => [
        e.timestamp,
        e.participant_id,
        e.event_type,
        JSON.stringify(e.event_data)
      ])
      
      const csv = toCSV(headers, rows)
      downloadCSV(csv, `session_${sessionCode}_events.csv`)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Failed to export events.')
    }
  }

  // Export all session data (session info + participants + messages + events)
  async function handleExportSession(session: SessionWithParticipantCount) {
    try {
      // Fetch full session export data via data layer
      const sessionData = await exportSessionData(session.id)
      
      // Download as JSON (more structured than CSV for nested data)
      const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `session_${session.session_code}_full.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Failed to export session data.')
    }
  }
  
  // Kept for potential future use - exports just events
  void handleExportEvents // suppress unused warning

  // ============================================
  // Stats Calculation
  // ============================================
  // Unique participants: count distinct participant_id across all sessions so the same
  // person is not counted multiple times (e.g. in round 1 and round 2).
  const uniqueParticipantIds = new Set(
    sessions.flatMap(s => (s.participants ?? []).map(p => p.participant_id))
  )
  const stats = {
    active: sessions.filter(s => s.status === 'active').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    totalParticipants: uniqueParticipantIds.size
  }

  // Only round sessions (round 1/2/3 from batch matchmaking); excludes pair/join sessions
  const roundSessions = sessions.filter(s => s.round_number != null)

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">
                Negotiation Experiment Platform
              </h1>
              <p className="text-neutral-600 mt-1">
                Manage your research sessions
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => fetchSessions(false)}
                className="btn-secondary flex items-center gap-2"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button 
                onClick={() => setShowCreateForm(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Batch
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-error-50 border border-error-200 rounded-lg text-error-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button 
              onClick={() => setError(null)} 
              className="ml-auto text-error-500 hover:text-error-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-lg">
                <Clock className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-neutral-600">Active Sessions</p>
                <p className="text-2xl font-bold text-neutral-900">{stats.active}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-success-600" />
              </div>
              <div>
                <p className="text-sm text-neutral-600">Completed</p>
                <p className="text-2xl font-bold text-neutral-900">{stats.completed}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-neutral-100 rounded-lg">
                <Users className="w-6 h-6 text-neutral-600" />
              </div>
              <div>
                <p className="text-sm text-neutral-600">Total Participants</p>
                <p className="text-2xl font-bold text-neutral-900">{stats.totalParticipants}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Create Batch Modal - no scenario/time; fixed 45 min, Round A/B/C in backend */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="card w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">
                Create Experiment Batch
              </h2>
              <p className="text-sm text-neutral-600 mb-4">
                Participants enter the batch code to join. Rounds A/B/C and 10 min per round are fixed. When the batch is full, matching is pre-seeded so everyone gets a partner.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => onCreateBatch(18)}
                  disabled={isCreating}
                  className="btn-primary w-full"
                >
                  {isCreating ? 'Creating...' : 'Create batch (18 participants)'}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateBatch(12)}
                  disabled={isCreating}
                  className="btn-secondary w-full border border-primary-200 text-primary-700 hover:bg-primary-50"
                >
                  {isCreating ? 'Creating...' : 'Create batch (12 participants)'}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateBatch(6)}
                  disabled={isCreating}
                  className="btn-secondary w-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                >
                  {isCreating ? 'Creating...' : 'Create test batch (6 participants)'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="btn-secondary w-full"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Token Modal - Pre-generated participant URLs */}
        {tokenModalSession && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:bg-white print:block">
            <div className="card w-full max-w-lg mx-4 print:shadow-none print:max-w-none print:mx-0">
              <div className="flex items-center justify-between mb-4 print:hidden">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Participant URLs
                </h2>
                <button 
                  onClick={() => setTokenModalSession(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Print header */}
              <div className="hidden print:block mb-6">
                <h1 className="text-xl font-bold">Negotiation Session: {tokenModalSession.session_code}</h1>
                <p className="text-sm text-neutral-600">Print these URLs for participants</p>
              </div>
              
              {isGeneratingTokens ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-neutral-400 mx-auto mb-2 animate-spin" />
                  <p className="text-neutral-600">Generating participant URLs...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessionTokens.map((token) => (
                    <div 
                      key={token.id} 
                      className="p-4 border border-neutral-200 rounded-lg print:border-2 print:p-6"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-neutral-900">
                          {token.role === 'pm' ? 'Project Manager' : 'Developer'}
                        </span>
                        {token.claimed_at && (
                          <span className="text-xs bg-success-100 text-success-700 px-2 py-1 rounded print:hidden">
                            Already claimed
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-neutral-100 px-3 py-2 rounded font-mono print:bg-neutral-50">
                          {window.location.origin}/p/{token.token}
                        </code>
                        <button
                          onClick={() => copyTokenUrl(token.token)}
                          className="p-2 text-neutral-400 hover:text-neutral-600 print:hidden"
                          title="Copy URL"
                        >
                          {copiedCode === token.token ? (
                            <CheckCircle className="w-4 h-4 text-success-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      
                      {/* Print-only instructions */}
                      <div className="hidden print:block mt-3 text-sm text-neutral-600 border-t pt-3">
                        <p>Terminal #: _______ </p>
                        <p className="mt-1">Open this URL in your browser to join the session.</p>
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex gap-3 pt-4 print:hidden">
                    <button
                      onClick={() => setTokenModalSession(null)}
                      className="btn-secondary flex-1"
                    >
                      Close
                    </button>
                    <button
                      onClick={printTokens}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Print URLs
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Participant Management Modal */}
        {participantModalSession && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="card w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Participants - {participantModalSession.session_code}
                </h2>
                <button 
                  onClick={() => setParticipantModalSession(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {participantModalSession.participants.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No participants yet</p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {participantModalSession.participants.map((p) => (
                    <div 
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-neutral-200 rounded-full">
                          <User className="w-4 h-4 text-neutral-600" />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900">
                            {p.role === 'pm' ? 'Project Manager' : 'Developer'}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Joined {new Date(p.joined_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveParticipant(participantModalSession.id, p.participant_id)}
                        className="p-2 text-error-600 hover:bg-error-50 rounded"
                        title="Remove participant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => setParticipantModalSession(null)}
                  className="btn-secondary flex-1"
                >
                  Close
                </button>
                {participantModalSession.participants.length > 0 && (
                  <button
                    onClick={() => handleClearAllParticipants(participantModalSession.id)}
                    className="btn-secondary flex-1 text-error-600 border-error-200 hover:bg-error-50"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-900">
              Sessions
            </h2>
            {isLoading && hasLoaded && (
              <span className="flex items-center gap-1 text-xs text-neutral-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Refreshing…
              </span>
            )}
          </div>

          {isLoading && !hasLoaded ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 text-neutral-400 mx-auto mb-2 animate-spin" />
              <p className="text-neutral-600">Loading sessions...</p>
            </div>
          ) : (
            <>
              {/* Batches section - pool-based experiment runs */}
              <div className="card mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-neutral-900">Batches</h3>
                  {(batches.length > 0 || sessions.some(s => s.round_number != null)) && (
                    <button
                      type="button"
                      onClick={handleClearBatchesAndRoundSessions}
                      className="btn-secondary text-sm text-error-600 border-error-200 hover:bg-error-50"
                      title="Remove all batches, round sessions, and queue for a fresh start"
                    >
                      Clear batches &amp; round sessions
                    </button>
                  )}
                </div>
                {batches.length === 0 ? (
                  <p className="text-neutral-600 mb-4">No batches yet. Create a batch for participants to join (up to 18 per batch).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-200">
                          <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">Batch Code</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">Participants</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">Created</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-neutral-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((batch) => (
                          <tr key={batch.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{batch.batch_code}</span>
                                <button
                                  onClick={() => copySessionCode(batch.batch_code)}
                                  className="p-1 text-neutral-400 hover:text-neutral-600"
                                  title="Copy batch code"
                                >
                                  {copiedCode === batch.batch_code ? (
                                    <CheckCircle className="w-4 h-4 text-success-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-neutral-600">
                              {batch.participant_count}/{batch.max_participants}
                            </td>
                            <td className="py-3 px-4">
                              <StatusBadge status={batch.status} />
                            </td>
                            <td className="py-3 px-4 text-sm text-neutral-600">
                              {new Date(batch.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleViewBatchPoints(batch.id)}
                                  className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                                  title="View point distribution for this batch"
                                >
                                  <Download className="w-3 h-3" />
                                  Points
                                </button>
                                <BatchMatchRoundButtons
                                  batchId={batch.id}
                                  batchCode={batch.batch_code}
                                  maxParticipants={batch.max_participants}
                                  queueCounts={batchQueueCounts[batch.id]}
                                  onMatched={fetchSessions}
                                  setError={setError}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Batch point distribution panel */}
                    {batchPointsId && batches.some(b => b.id === batchPointsId) && (
                      <div className="mt-4 border border-neutral-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-700">
                            Point Distribution — {batches.find(b => b.id === batchPointsId)?.batch_code}
                          </span>
                          <button onClick={() => setBatchPointsId(null)} className="text-neutral-400 hover:text-neutral-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {isLoadingPoints ? (
                          <div className="p-4 text-center text-sm text-neutral-500">Loading…</div>
                        ) : (
                          <BatchPointsTable rows={batchPointsData} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Round sessions (from matchmaking) - only sessions with round_number 1/2/3 */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Round Sessions</h3>
                {roundSessions.filter(s => s.status === 'waiting' && s.participant_count === 2).length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleStartAllWaitingRoundSessions()}
                    className="btn-primary text-sm"
                    title="Start all paired round sessions that are waiting"
                  >
                    <Play className="w-4 h-4 inline mr-1" />
                    Start all waiting
                  </button>
                )}
              </div>
              {roundSessions.length === 0 ? (
                <p className="text-neutral-600">No round sessions yet. Match participants for a round (R1/R2/R3) to create sessions here.</p>
              ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Session Code
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Round
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Participants
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Timer
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Scenario
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-600">
                      Created
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-neutral-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roundSessions.map((session) => (
                    <tr key={session.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {session.session_code}
                          </span>
                          <button
                            onClick={() => copySessionCode(session.session_code)}
                            className="p-1 text-neutral-400 hover:text-neutral-600"
                            title="Copy join link"
                          >
                            {copiedCode === session.session_code ? (
                              <CheckCircle className="w-4 h-4 text-success-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-600">
                        R{session.round_number ?? '?'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={session.status} />
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setParticipantModalSession(session)}
                          className="flex items-center gap-1 hover:bg-neutral-100 px-2 py-1 rounded -ml-2"
                          title="Manage participants"
                        >
                          <Users className="w-4 h-4 text-neutral-400" />
                          <span className="text-sm text-neutral-600">
                            {session.participant_count}/2
                          </span>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <AdminSessionTimer 
                          session={session} 
                          onExtend={() => handleExtendTime(session.id)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-600">
                        {session.negotiation_scenario ?? 'Default'}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-600">
                        {new Date(session.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-1">
                          {/* Generate URLs button - for lab pre-registration */}
                          {session.status === 'waiting' && (
                            <button
                              onClick={() => openTokenModal(session)}
                              className="p-2 text-primary-600 hover:bg-primary-50 rounded"
                              title="Generate participant URLs"
                            >
                              <Link className="w-4 h-4" />
                            </button>
                          )}
                          {session.status === 'waiting' && session.participant_count === 2 && (
                            <button
                              onClick={() => handleStartSession(session.id)}
                              className="p-2 text-success-600 hover:bg-success-50 rounded"
                              title="Start session"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {session.status === 'active' && (
                            <button
                              onClick={() => handleEndSession(session.id)}
                              className="p-2 text-warning-600 hover:bg-warning-50 rounded"
                              title="End session"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                          )}
                          {/* Export buttons - for completed/active sessions */}
                          {(session.status === 'completed' || session.status === 'active') && (
                            <>
                              <button
                                onClick={() => handleExportMessages(session.id, session.session_code)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                title="Export messages (CSV)"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleExportSession(session)}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                                title="Export full session (JSON)"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {session.status !== 'active' && (
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="p-2 text-error-600 hover:bg-error-50 rounded"
                              title="Delete session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ============================================
// Helper Components
// ============================================

/** Buttons to run batch match for round 1/2/3. Shows queue count (e.g. 5/18) per round. */
function BatchMatchRoundButtons({
  batchId,
  batchCode,
  maxParticipants,
  queueCounts,
  onMatched,
  setError,
}: {
  batchId: string
  batchCode: string
  maxParticipants: number
  queueCounts?: { 1: number; 2: number; 3: number } | null
  onMatched: () => void
  setError: (msg: string | null) => void
}) {
  const [matchingSlot, setMatchingSlot] = useState<number | null>(null)
  const counts = queueCounts ?? { 1: 0, 2: 0, 3: 0 }

  async function handleMatch(slot: number) {
    setError(null)
    setMatchingSlot(slot)
    try {
      await matchBatchForRound(batchId, slot)
      onMatched()
      setError(null)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err)
      setError(`Match round ${slot} failed: ${msg}`)
    } finally {
      setMatchingSlot(null)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {[1, 2, 3].map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => handleMatch(slot)}
          disabled={matchingSlot !== null}
          className="btn-secondary text-xs py-1.5 px-2"
          title={`Match all queued participants for round ${slot} (batch ${batchCode}). Queue: ${counts[slot as 1 | 2 | 3]}/${maxParticipants}`}
        >
          {matchingSlot === slot ? '…' : `R${slot} (${counts[slot as 1 | 2 | 3]}/${maxParticipants})`}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    waiting: 'bg-warning-50 text-warning-700',
    active: 'bg-success-50 text-success-700',
    completed: 'bg-neutral-100 text-neutral-700',
    cancelled: 'bg-error-50 text-error-700',
    open: 'bg-success-50 text-success-700',
    closed: 'bg-neutral-100 text-neutral-700',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] ?? styles.waiting}`}>
      {status}
    </span>
  )
}

// ============================================
// Admin Session Timer Component
// ============================================

interface AdminSessionTimerProps {
  session: SessionWithParticipantCount
  onExtend: () => void
}

function AdminSessionTimer({ session, onExtend }: AdminSessionTimerProps) {
  // For non-active sessions, show time limit or completed status
  if (session.status === 'waiting') {
    return (
      <span className="text-sm text-neutral-500">
        {session.time_limit_minutes}min limit
      </span>
    )
  }
  
  if (session.status === 'completed') {
    return (
      <span className="text-sm text-neutral-400">
        Completed
      </span>
    )
  }
  
  // For active sessions, calculate remaining time
  if (!session.started_at) {
    return <span className="text-sm text-neutral-500">–</span>
  }
  
  const startTime = new Date(session.started_at).getTime()
  const endTime = startTime + (session.time_limit_minutes * 60 * 1000)
  const now = Date.now()
  const remainingMs = endTime - now
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  
  // Determine color based on time remaining
  const isWarning = remainingSeconds <= 300 && remainingSeconds > 60 // < 5 min
  const isCritical = remainingSeconds <= 60 // < 1 min
  const isExpired = remainingSeconds === 0
  
  let colorClasses = 'text-success-600'
  if (isWarning) colorClasses = 'text-amber-600'
  if (isCritical) colorClasses = 'text-red-600 font-bold'
  if (isExpired) colorClasses = 'text-red-700 font-bold'
  
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 ${colorClasses}`}>
        <Timer className="w-4 h-4" />
        <span className="font-mono text-sm">
          {isExpired ? 'EXPIRED' : formattedTime}
        </span>
      </div>
      {/* Extend time button */}
      <button
        onClick={onExtend}
        className="p-1 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded"
        title="Add 5 minutes"
      >
        <PlusCircle className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================
// Batch Points Distribution Table
// ============================================

function BatchPointsTable({ rows }: { rows: BatchPointRow[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-neutral-500">No session data found for this batch.</p>
  }

  // Group by participant, calculate total points per participant
  const byParticipant = new Map<string, { email: string; rounds: { round: number; scenario: string | null; points: number; agreed: boolean }[]; total: number }>()

  for (const row of rows) {
    if (!byParticipant.has(row.participant_id)) {
      byParticipant.set(row.participant_id, { email: row.email, rounds: [], total: 0 })
    }
    const entry = byParticipant.get(row.participant_id)!

    let points = 0
    if (row.agreement_reached && row.final_agreement && row.negotiation_scenario) {
      const sc = getScenarioById(row.negotiation_scenario)
      const rk = getRoleKey(row.role as 'pm' | 'developer', sc)
      if (rk) points = calculatePoints(row.final_agreement, rk, sc)
    }

    entry.rounds.push({ round: row.round_number, scenario: row.negotiation_scenario, points, agreed: !!row.agreement_reached })
    entry.total += points
  }

  const participants = [...byParticipant.values()].sort((a, b) => b.total - a.total)
  const maxPoints = 600

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="text-left py-2 px-4 text-xs font-medium text-neutral-500">Participant</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Rnd 1</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Rnd 2</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Rnd 3</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Total</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {participants.map(({ email, rounds, total }) => {
            const roundsByNum = new Map(rounds.map(r => [r.round, r]))
            return (
              <tr key={email} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 px-4 text-xs text-neutral-600 font-mono">{email}</td>
                {[1, 2, 3].map(n => {
                  const r = roundsByNum.get(n)
                  return (
                    <td key={n} className="py-2 px-3 text-xs">
                      {r ? (
                        r.agreed
                          ? <span className="text-neutral-800 font-medium">{r.points} pts</span>
                          : <span className="text-neutral-400">0 (no deal)</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-xs font-bold text-neutral-900">{total} pts</td>
                <td className="py-2 px-3 text-xs font-bold text-green-700">
                  €{((total / maxPoints) * 10).toFixed(2)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default AdminPage
