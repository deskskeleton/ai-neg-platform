/**
 * RoleBriefingPage Component
 * 
 * Displays role-specific confidential briefing materials to participants
 * before the negotiation begins. This is a critical stage where participants
 * learn their objectives, priorities, and point values.
 * 
 * Flow: PreSurveyPage → JoinSessionPage (waiting room) → RoleBriefingPage → NegotiatePage
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  BookOpen, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  Clock,
  Target,
  Lock,
  ArrowRight
} from 'lucide-react';
import { 
  SCENARIO_CONFIG, 
  getRoleKey, 
  getBriefingForRole,
  getScenarioById,
  type RoleBriefing,
  type ScenarioConfig
} from '@/config/scenarios';
import { getSessionParticipantByIds, getSession } from '@/lib/data';
import type { ParticipantRole } from '@/types/database.types';

// ============================================
// Component
// ============================================

function RoleBriefingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const participantId = searchParams.get('participant');
  const pairSessionId = searchParams.get('pair_session');
  const batchId = searchParams.get('batch');
  const navigate = useNavigate();

  // State
  const [role, setRole] = useState<ParticipantRole | null>(null);
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    priorities: true,
    confidential: true,
    issues: true,
  });
  
  // Comprehension quiz state
  const [quizAnswers, setQuizAnswers] = useState({
    roleQuestion: '',
    maxPointsQuestion: '',
    bestIssueQuestion: '',
  });
  const [quizErrors, setQuizErrors] = useState({
    roleQuestion: false,
    maxPointsQuestion: false,
    bestIssueQuestion: false,
  });
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Fetch participant role and session scenario
  useEffect(() => {
    async function fetchRoleAndScenario() {
      if (!sessionId || !participantId) {
        setError(`Missing ${!sessionId ? 'session' : 'participant'} information. Please return to the waiting room.`);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch session to get scenario
        const session = await getSession(sessionId);
        if (!session) {
          setError('Session not found. Please return to the waiting room.');
          setIsLoading(false);
          return;
        }
        
        const scenarioConfig = getScenarioById(session.negotiation_scenario);
        setScenario(scenarioConfig);

        // Fetch participant role
        const sessionParticipant = await getSessionParticipantByIds(sessionId, participantId);
        if (sessionParticipant) {
          setRole(sessionParticipant.role as ParticipantRole);
        } else {
          setError('Could not find your role assignment. Please return to the waiting room and try again.');
        }
      } catch (err) {
        console.error('Failed to fetch role:', err);
        setError('Failed to load role information. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchRoleAndScenario();
  }, [sessionId, participantId]);

  // Get briefing content using the session's scenario
  const briefing: RoleBriefing | undefined = role ? getBriefingForRole(role, scenario) : undefined;
  const roleKey = role ? getRoleKey(role) : undefined;
  const roleConfig = roleKey ? scenario.roles[roleKey] : undefined;

  // Calculate correct answers for quiz
  const maxPoints = roleKey 
    ? scenario.issues.reduce((sum, issue) => {
        return sum + Math.max(...issue.payoffs[roleKey]);
      }, 0)
    : 0;
  
  // Find the issue with highest single-option value for this role
  const bestIssue = roleKey 
    ? scenario.issues.reduce((best, issue) => {
        const maxForIssue = Math.max(...issue.payoffs[roleKey]);
        if (!best || maxForIssue > Math.max(...best.payoffs[roleKey])) {
          return issue;
        }
        return best;
      }, scenario.issues[0])
    : null;

  // Check if quiz is passed
  const isQuizPassed = quizSubmitted && 
    !quizErrors.roleQuestion && 
    !quizErrors.maxPointsQuestion && 
    !quizErrors.bestIssueQuestion &&
    quizAnswers.roleQuestion !== '' &&
    quizAnswers.maxPointsQuestion !== '' &&
    quizAnswers.bestIssueQuestion !== '';

  // Handle quiz submission
  function handleQuizSubmit() {
    const errors = {
      roleQuestion: quizAnswers.roleQuestion !== role,
      maxPointsQuestion: quizAnswers.maxPointsQuestion !== String(maxPoints),
      bestIssueQuestion: quizAnswers.bestIssueQuestion !== bestIssue?.id,
    };
    
    setQuizErrors(errors);
    setQuizSubmitted(true);
  }

  // Handle continue: go to round-ready lobby so both participants start the 10-min timer together
  function handleContinue() {
    if (!isQuizPassed || !sessionId) return;
    const params = new URLSearchParams({ participant: participantId ?? '' });
    if (pairSessionId) params.set('pair_session', pairSessionId);
    if (batchId) params.set('batch', batchId);
    navigate(`/round-ready/${sessionId}?${params.toString()}`);
  }

  // Toggle section
  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  // Color classes based on role
  const roleColors = {
    pm: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      accent: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    developer: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      accent: 'bg-green-100',
      button: 'bg-green-600 hover:bg-green-700',
    },
  };

  const colors = role ? roleColors[role] : roleColors.pm;

  // ============================================
  // Render
  // ============================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your role materials...</p>
        </div>
      </div>
    );
  }

  if (error || !briefing || !role) {
    // Determine the specific issue for better debugging
    const errorMessage = error 
      || (!role ? 'Role not assigned. Please return to the waiting room.' 
      : !briefing ? 'Briefing content not found for your role.' 
      : 'Could not load your role materials.');
    
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Unable to Load Briefing
          </h1>
          <p className="text-slate-600 mb-4">
            {errorMessage}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-secondary w-full"
            >
              Return to Home
            </button>
          </div>
          {/* Debug info - can be removed in production */}
          <p className="text-xs text-slate-400 mt-4">
            Session: {sessionId?.slice(0, 8) || 'none'} | Participant: {participantId?.slice(0, 8) || 'none'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className={`${colors.bg} border-b ${colors.border}`}>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${colors.accent}`}>
              <BookOpen className={`w-6 h-6 ${colors.text}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Role Briefing
              </h1>
              <p className={`text-sm font-medium ${colors.text}`}>
                {roleConfig?.label || role}
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-sm">
            Please read your confidential role materials carefully before the negotiation begins.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Important Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Confidential Information</p>
            <p className="text-sm text-amber-700">
              The information below is confidential to your role. Do not share your point values 
              or priorities with your negotiation partner.
            </p>
          </div>
        </div>

        {/* Scenario Overview */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4">
          <button
            onClick={() => toggleSection('overview')}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-900">Your Situation</span>
            </div>
            {expandedSections.overview ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {expandedSections.overview && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="pt-4">
                <h3 className="font-medium text-slate-900 mb-2">{briefing.title}</h3>
                <p className="text-slate-600 whitespace-pre-wrap">{briefing.overview}</p>
              </div>
            </div>
          )}
        </div>

        {/* Your Priorities */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4">
          <button
            onClick={() => toggleSection('priorities')}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-900">Your Priorities</span>
            </div>
            {expandedSections.priorities ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {expandedSections.priorities && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <ul className="pt-4 space-y-2">
                {briefing.priorities.map((priority, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600">
                      {idx + 1}
                    </span>
                    <span className="text-slate-700">{priority}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Issues to Negotiate */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4">
          <button
            onClick={() => toggleSection('issues')}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-900">Issues to Negotiate</span>
            </div>
            {expandedSections.issues ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {expandedSections.issues && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="pt-4 space-y-4">
                {scenario.issues.map((issue) => (
                  <div key={issue.id} className="bg-slate-50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-900 mb-1">{issue.label}</h4>
                    {issue.description && (
                      <p className="text-sm text-slate-600 mb-2">{issue.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {issue.options.map((option) => (
                        <span
                          key={option.value}
                          className="px-2 py-1 bg-white border border-slate-200 rounded text-sm text-slate-700"
                        >
                          {option.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confidential Point Values - Table Format */}
        <div className={`${colors.bg} rounded-lg border-2 border-dashed ${colors.border} mb-6`}>
          <button
            onClick={() => toggleSection('confidential')}
            className="w-full flex items-center justify-between p-4 hover:opacity-90"
          >
            <div className="flex items-center gap-3">
              <Lock className={`w-5 h-5 ${colors.text}`} />
              <span className={`font-semibold ${colors.text}`}>
                🔒 Confidential Point Values
              </span>
            </div>
            {expandedSections.confidential ? (
              <ChevronUp className={`w-5 h-5 ${colors.text}`} />
            ) : (
              <ChevronDown className={`w-5 h-5 ${colors.text}`} />
            )}
          </button>
          {expandedSections.confidential && (
            <div className="px-4 pb-4 border-t border-dashed border-slate-300">
              <div className="pt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${colors.border}`}>
                      <th className={`text-left py-2 px-3 font-semibold ${colors.text}`}>Issue</th>
                      {scenario.issues[0]?.options.map((_, idx) => (
                        <th key={idx} className={`text-center py-2 px-3 font-semibold ${colors.text}`}>
                          Option {idx + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.issues.map((issue) => (
                      <tr key={issue.id} className="border-b border-slate-200">
                        <td className={`py-2 px-3 font-medium ${colors.text}`}>{issue.label}</td>
                        {issue.options.map((option, idx) => {
                          const points = roleKey ? issue.payoffs[roleKey][idx] : 0;
                          return (
                            <td key={option.value} className="text-center py-2 px-3">
                              <div className="text-slate-600">{option.label}</div>
                              <div className={`font-bold ${colors.text}`}>{points} pts</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`mt-4 p-3 rounded ${colors.bg} border ${colors.border}`}>
                <p className={`text-sm font-semibold ${colors.text}`}>
                  Maximum possible: {scenario.issues.reduce((sum, issue) => {
                    const maxPoints = roleKey ? Math.max(...issue.payoffs[roleKey]) : 0;
                    return sum + maxPoints;
                  }, 0)} points
                </p>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                ⚠️ Do not share these point values with your negotiation partner
              </p>
            </div>
          )}
        </div>

        {/* Comprehension Quiz */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">
            📝 Comprehension Check
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Please answer these questions to confirm you understand the negotiation. 
            You can refer to the information above.
          </p>
          
          <div className="space-y-5">
            {/* Question 1: Role */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                1. What is your role in this negotiation?
              </label>
              <div className="space-y-2">
                {[
                  { value: 'pm', label: scenario.roles.roleA.label },
                  { value: 'developer', label: scenario.roles.roleB.label },
                ].map((option) => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="roleQuestion"
                      value={option.value}
                      checked={quizAnswers.roleQuestion === option.value}
                      onChange={(e) => setQuizAnswers(prev => ({ 
                        ...prev, 
                        roleQuestion: e.target.value 
                      }))}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">{option.label}</span>
                  </label>
                ))}
              </div>
              {quizSubmitted && quizErrors.roleQuestion && (
                <p className="mt-1 text-sm text-red-600">
                  ❌ Incorrect. Please review your role assignment above.
                </p>
              )}
              {quizSubmitted && !quizErrors.roleQuestion && quizAnswers.roleQuestion && (
                <p className="mt-1 text-sm text-green-600">✓ Correct!</p>
              )}
            </div>

            {/* Question 2: Max Points */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                2. What is the maximum possible points you can earn?
              </label>
              <div className="flex flex-wrap gap-2">
                {[maxPoints - 60, maxPoints - 20, maxPoints, maxPoints + 40].sort((a, b) => a - b).map((option) => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="maxPointsQuestion"
                      value={String(option)}
                      checked={quizAnswers.maxPointsQuestion === String(option)}
                      onChange={(e) => setQuizAnswers(prev => ({ 
                        ...prev, 
                        maxPointsQuestion: e.target.value 
                      }))}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">{option} points</span>
                  </label>
                ))}
              </div>
              {quizSubmitted && quizErrors.maxPointsQuestion && (
                <p className="mt-1 text-sm text-red-600">
                  ❌ Incorrect. Check the "Maximum possible" shown in the point values table.
                </p>
              )}
              {quizSubmitted && !quizErrors.maxPointsQuestion && quizAnswers.maxPointsQuestion && (
                <p className="mt-1 text-sm text-green-600">✓ Correct!</p>
              )}
            </div>

            {/* Question 3: Best Issue */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                3. Which issue has the highest point value at your best option?
              </label>
              <div className="space-y-2">
                {scenario.issues.map((issue) => (
                  <label key={issue.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bestIssueQuestion"
                      value={issue.id}
                      checked={quizAnswers.bestIssueQuestion === issue.id}
                      onChange={(e) => setQuizAnswers(prev => ({ 
                        ...prev, 
                        bestIssueQuestion: e.target.value 
                      }))}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">{issue.label}</span>
                  </label>
                ))}
              </div>
              {quizSubmitted && quizErrors.bestIssueQuestion && (
                <p className="mt-1 text-sm text-red-600">
                  ❌ Incorrect. Look at which issue gives you the most points at any option.
                </p>
              )}
              {quizSubmitted && !quizErrors.bestIssueQuestion && quizAnswers.bestIssueQuestion && (
                <p className="mt-1 text-sm text-green-600">✓ Correct!</p>
              )}
            </div>
          </div>
          
          {/* Quiz Submit Button */}
          {!isQuizPassed && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={handleQuizSubmit}
                disabled={!quizAnswers.roleQuestion || !quizAnswers.maxPointsQuestion || !quizAnswers.bestIssueQuestion}
                className={`
                  w-full px-4 py-2 rounded-lg font-medium transition-colors
                  ${quizAnswers.roleQuestion && quizAnswers.maxPointsQuestion && quizAnswers.bestIssueQuestion
                    ? 'bg-slate-700 text-white hover:bg-slate-800'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }
                `}
              >
                Check Answers
              </button>
              {quizSubmitted && Object.values(quizErrors).some(e => e) && (
                <p className="mt-2 text-sm text-amber-600 text-center">
                  Some answers are incorrect. Please review and try again.
                </p>
              )}
            </div>
          )}
          
          {/* Success Message */}
          {isQuizPassed && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-medium text-center">
                ✅ All answers correct! You may now continue.
              </p>
            </div>
          )}
        </div>

        {/* Confidentiality Reminder */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <strong>Remember:</strong> Do not share your point values with your negotiation partner. 
            This information is confidential to your role.
          </p>
        </div>

        {/* Continue Button */}
        <div className="flex justify-end">
          <button
            onClick={handleContinue}
            disabled={!isQuizPassed}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white
              transition-colors
              ${isQuizPassed
                ? colors.button
                : 'bg-slate-300 cursor-not-allowed'
              }
            `}
          >
            Continue to Negotiation
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Debug info */}
        {import.meta.env.DEV && (
          <p className="text-center text-xs text-slate-400 mt-8">
            Session: {sessionId} | Participant: {participantId} | Role: {role}
          </p>
        )}
      </main>
    </div>
  );
}

export default RoleBriefingPage;
