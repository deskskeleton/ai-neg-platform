import { Routes, Route } from 'react-router-dom'

// Layout imports
import { ErrorBoundary } from '@/components/layout'

// Page imports
import AdminPage from '@/pages/AdminPage'
import JoinSessionPage from '@/pages/JoinSessionPage'
import TokenEntryPage from '@/pages/TokenEntryPage'  // Pre-generated URLs (may be over-engineering)
import PreSurveyPage from '@/pages/PreSurveyPage'
import RoleBriefingPage from '@/pages/RoleBriefingPage'
import NegotiatePage from '@/pages/NegotiatePage'
import PostSurveyPage from '@/pages/PostSurveyPage'
import DebriefPage from '@/pages/DebriefPage'
import RoundLobbyPage from '@/pages/RoundLobbyPage'
import RoundReadyPage from '@/pages/RoundReadyPage'

/**
 * Main App Component
 *
 * Defines the routing structure for the negotiation experiment platform.
 *
 * Routes:
 * - /                           : Redirects to /join (participant entry)
 * - <VITE_ADMIN_ROUTE>          : Admin dashboard (password protected; default /admin_umdad)
 * - /join                       : Manual session code entry
 * - /join/:code                 : Direct join with session code in URL
 * - /p/:token                   : Pre-generated participant URL (lab mode)
 * - /pre-survey/:participantId  : Pre-negotiation questionnaire
 * - /briefing/:sessionId        : Role briefing before negotiation
 * - /negotiate/:sessionId       : Main negotiation interface
 * - /post-survey/:participantId : Post-negotiation questionnaire
 * - /debrief                    : Study debrief and information page
 */

// Admin dashboard is served at an obscured path so curious participants
// visiting `/admin` don't discover it. Overridable at build time via
// --build-arg VITE_ADMIN_ROUTE=/your_path.
const ADMIN_ROUTE = (import.meta.env.VITE_ADMIN_ROUTE as string | undefined) || '/admin_umdad'

function App() {
  return (
    <ErrorBoundary title="Application Error" showHomeButton>
      <div className="min-h-screen bg-neutral-50">
        <Routes>
          {/* Root redirects to join page for participants */}
          <Route path="/" element={<JoinSessionPage />} />

          {/* Admin Route — obscured path + client-side password gate.
              Server-side /api/admin/* runs in network-trust mode. */}
          <Route path={ADMIN_ROUTE} element={<AdminPage />} />
          
          {/* Join Session Routes - Entry point for participants */}
          <Route path="/join" element={<JoinSessionPage />} />
          <Route path="/join/:code" element={<JoinSessionPage />} />
          
          {/* Token Entry Route - Pre-generated URLs for lab mode */}
          {/* NOTE: May be over-engineering. See DEVELOPMENT_LOG.md */}
          <Route path="/p/:token" element={<TokenEntryPage />} />
          
          {/* Pre-Survey Route - Questionnaire before negotiation */}
          <Route path="/pre-survey/:participantId" element={<PreSurveyPage />} />

          {/* Round Lobby - Pool matchmaking (slot 1, 2, or 3) */}
          <Route path="/round-lobby/:slotIndex" element={<RoundLobbyPage />} />

          {/* Role Briefing Route - Confidential role materials */}
          <Route path="/briefing/:sessionId" element={<RoleBriefingPage />} />

          {/* Round Ready - Both participants ready before 15-min timer starts */}
          <Route path="/round-ready/:sessionId" element={<RoundReadyPage />} />
          
          {/* Negotiate Route - Main negotiation interface (wrapped separately for better error isolation) */}
          <Route 
            path="/negotiate/:sessionId" 
            element={
              <ErrorBoundary title="Negotiation Error">
                <NegotiatePage />
              </ErrorBoundary>
            } 
          />
          
          {/* Post-Survey Route - Questionnaire after negotiation */}
          <Route path="/post-survey/:participantId" element={<PostSurveyPage />} />
          
          {/* Debrief Route - Study information and debrief */}
          <Route path="/debrief" element={<DebriefPage />} />
          
          {/* 404 Fallback - Handle unknown routes */}
          <Route 
            path="*" 
            element={
              <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-neutral-900 mb-2">404</h1>
                  <p className="text-neutral-600 mb-4">Page not found</p>
                  <a href="/" className="btn-primary inline-block">
                    Return Home
                  </a>
                </div>
              </div>
            } 
          />
        </Routes>
      </div>
    </ErrorBoundary>
  )
}

export default App
