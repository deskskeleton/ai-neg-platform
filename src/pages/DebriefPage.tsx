/**
 * DebriefPage Component
 * 
 * Final page shown to participants after completing the experiment.
 * Contains:
 * - Thank you message
 * - Study purpose explanation
 * - Contact information
 * - Data privacy notice
 * 
 * Flow: PostSurveyPage → DebriefPage (end)
 */

import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { CheckCircle, Mail, Shield, FileText, ExternalLink, Copy } from 'lucide-react';
import { getParticipant, generateCompletionCode, getRoundSessionsForParticipant, getSessionParticipantByIds, getSession } from '@/lib/data';
import { getScenarioById, calculatePoints, getRoleKey } from '@/config/scenarios';
import { getRoundLabel } from '@/utils/roundLabels';

// ============================================
// DEBRIEF CONFIGURATION
// Edit these to customize the debrief content
// ============================================

const DEBRIEF_CONFIG = {
  // Study information
  study: {
    title: 'AI-Assisted Negotiation Experiment',
    purpose: `This study investigates the role of AI assistants in multi-issue 
      negotiations. We are examining how AI assistance affects the negotiation 
      process and outcomes.`,
    hypotheses: [
      'How does AI assistance affect negotiation strategies?',
      'What role does trust in AI play during negotiations?',
      'How do negotiators interact with AI-provided suggestions?',
    ],
    importance: `This research contributes to our understanding of human-AI 
      interaction in complex decision-making contexts.`,
  },
  
  // Contact information
  contact: {
    researcher: {
      name: 'Stephen McCarthy',
      email: 'stephen.mccarthy@maastrichtuniversity.nl',
      role: 'Researcher',
    },
    placeholder1: {
      name: 'TBD',
      email: 'placeholder@maastrichtuniversity.nl',
      role: 'Supervisor',
    },
    placeholder2: {
      name: 'TBD',
      email: 'placeholder@maastrichtuniversity.nl',
      role: 'Additional Contact',
    },
  },
  
  // Data privacy
  privacy: {
    dataUsage: `Your responses will be used for academic research purposes only. 
      All data is stored securely and will be analyzed in aggregate form.`,
    anonymity: `Your identity will remain anonymous. Participant IDs are not linked 
      to personal information, and only anonymized data will be published.`,
    retention: `Data will be retained in accordance with Maastricht University's 
      Research Data Management (RDM) policy.`,
    rights: `You have the right to request deletion of your data up until the point 
      of publication. Important: If you wish to request data deletion in the future, 
      please note down your participant ID now. Since your data is anonymous, we 
      cannot identify your specific contribution without this ID.`,
  },
  
  // Payment information (for BEELab)
  payment: {
    instructions: `Please proceed to the lab administrator to receive your payment. 
      Your session code may be required for verification.`,
    showUpFee: '€5.00',
    performanceRange: '€0 - €10',
  },
};

// ============================================
// COMPONENT
// ============================================

function DebriefPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const participantId = searchParams.get('participant');
  const [completionCode, setCompletionCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [roundPoints, setRoundPoints] = useState<Array<{ round: number; scenario?: string; points: number; agreed: boolean }>>([]);
  const [totalPoints, setTotalPoints] = useState<number>(0);

  useEffect(() => {
    if (!participantId) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getParticipant(participantId);
        if (cancelled) return;
        const code = p?.completion_code
          ? p.completion_code
          : await generateCompletionCode(participantId);
        if (!cancelled) setCompletionCode(code);
      } catch (e) {
        if (!cancelled) setCodeError(e instanceof Error ? e.message : 'Could not load completion code');
      }
    })();
    return () => { cancelled = true };
  }, [participantId]);

  // Load points from all round sessions
  useEffect(() => {
    if (!participantId) return;
    let cancelled = false;
    (async () => {
      try {
        // Try loading round sessions (batch experiment)
        const roundSessions = await getRoundSessionsForParticipant(participantId);
        if (cancelled) return;
        if (roundSessions.length > 0) {
          const pts: Array<{ round: number; scenario?: string; points: number; agreed: boolean }> = [];
          let total = 0;
          for (const rs of roundSessions) {
            const sp = await getSessionParticipantByIds(rs.id, participantId);
            const sc = getScenarioById(rs.negotiation_scenario);
            if (sp && rs.agreement_reached && rs.final_agreement) {
              const rk = getRoleKey(sp.role, sc);
              const p = rk ? calculatePoints(rs.final_agreement as Record<string, number>, rk, sc) : 0;
              pts.push({ round: rs.round_number ?? 0, scenario: rs.negotiation_scenario ?? undefined, points: p, agreed: true });
              total += p;
            } else {
              pts.push({ round: rs.round_number ?? 0, scenario: rs.negotiation_scenario ?? undefined, points: 0, agreed: false });
            }
          }
          if (!cancelled) { setRoundPoints(pts); setTotalPoints(total); }
        } else if (sessionId) {
          // Single session mode
          const sess = await getSession(sessionId);
          if (cancelled || !sess) return;
          const sp = await getSessionParticipantByIds(sessionId, participantId);
          const sc = getScenarioById(sess.negotiation_scenario);
          if (sp && sess.agreement_reached && sess.final_agreement) {
            const rk = getRoleKey(sp.role, sc);
            const p = rk ? calculatePoints(sess.final_agreement as Record<string, number>, rk, sc) : 0;
            if (!cancelled) { setRoundPoints([{ round: 1, points: p, agreed: true }]); setTotalPoints(p); }
          }
        }
      } catch (e) {
        console.error('Failed to load points:', e);
      }
    })();
    return () => { cancelled = true };
  }, [participantId, sessionId]);

  const copyCode = () => {
    if (completionCode) {
      navigator.clipboard.writeText(completionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Success Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-700 text-white py-12">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Thank You!</h1>
          <p className="text-green-100 text-lg">
            Your participation has been recorded successfully.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        
        {/* Study Purpose */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">About This Study</h2>
          </div>
          
          <div className="prose prose-slate prose-sm max-w-none">
            <p className="text-slate-700 leading-relaxed">
              {DEBRIEF_CONFIG.study.purpose}
            </p>
            
            <h3 className="text-sm font-medium text-slate-800 mt-4 mb-2">
              Research Questions
            </h3>
            <ul className="space-y-1 text-slate-600">
              {DEBRIEF_CONFIG.study.hypotheses.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  {h}
                </li>
              ))}
            </ul>
            
            <p className="text-slate-700 leading-relaxed mt-4">
              {DEBRIEF_CONFIG.study.importance}
            </p>
          </div>
        </section>

        {/* Payment Information + BEELab completion code */}
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-3">
            💰 Compensation
          </h2>
          <p className="text-amber-800 mb-4">
            {DEBRIEF_CONFIG.payment.instructions}
          </p>
          {/* Per-round points breakdown */}
          {roundPoints.length > 0 && (
            <div className="mb-4 p-3 bg-amber-100/50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900 mb-2">Your Points</p>
              <div className="space-y-1 mb-2">
                {roundPoints.map((rp) => (
                  <div key={rp.round} className="flex justify-between text-sm">
                    <span className="text-amber-800">{getRoundLabel(rp.scenario) || `Round ${rp.round}`}:</span>
                    {rp.agreed ? (
                      <span className="font-medium text-amber-900">{rp.points} pts</span>
                    ) : (
                      <span className="text-amber-600">No agreement (0 pts)</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-amber-200 flex justify-between text-sm font-bold">
                <span className="text-amber-900">Total:</span>
                <span className="text-amber-900">{totalPoints} pts</span>
              </div>
              <div className="pt-1 flex justify-between text-sm font-bold text-green-800">
                <span>Performance bonus:</span>
                <span>€{((totalPoints / 600) * 10).toFixed(2)}</span>
              </div>
            </div>
          )}
          {completionCode && (
            <div className="mb-4 p-3 bg-amber-100 border border-amber-300 rounded-lg">
              <p className="text-sm font-medium text-amber-900 mb-1">Your completion code (for BEELab):</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono font-bold text-amber-900 tracking-wider">
                  {completionCode}
                </code>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex items-center gap-1 px-2 py-1 text-sm bg-amber-200 hover:bg-amber-300 rounded"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          {codeError && (
            <p className="text-amber-700 text-sm mb-4">Completion code could not be loaded. Please note your participant ID for verification.</p>
          )}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-amber-700">Show-up fee:</span>
              <span className="font-semibold text-amber-900 ml-2">
                {DEBRIEF_CONFIG.payment.showUpFee}
              </span>
            </div>
          </div>
        </section>

        {/* Data Privacy */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-slate-900">Data Privacy</h2>
          </div>
          
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <h3 className="font-medium text-slate-800 mb-1">Data Usage</h3>
              <p>{DEBRIEF_CONFIG.privacy.dataUsage}</p>
            </div>
            <div>
              <h3 className="font-medium text-slate-800 mb-1">Anonymity</h3>
              <p>{DEBRIEF_CONFIG.privacy.anonymity}</p>
            </div>
            <div>
              <h3 className="font-medium text-slate-800 mb-1">Data Retention</h3>
              <p>{DEBRIEF_CONFIG.privacy.retention}</p>
            </div>
            <div>
              <h3 className="font-medium text-slate-800 mb-1">Your Rights</h3>
              <p>{DEBRIEF_CONFIG.privacy.rights}</p>
            </div>
          </div>
        </section>

        {/* Contact Information */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-slate-900">Contact Information</h2>
          </div>
          
          <p className="text-slate-600 text-sm mb-4">
            If you have any questions about this study, please contact:
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.values(DEBRIEF_CONFIG.contact).map((contact, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg">
                <p className="font-medium text-slate-800">{contact.name}</p>
                <p className="text-xs text-slate-500 mb-2">{contact.role}</p>
                <a 
                  href={`mailto:${contact.email}`}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {contact.email}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Important Notice */}
        <section className="bg-slate-100 rounded-lg p-6 text-center">
          <h2 className="font-semibold text-slate-800 mb-2">
            Please Do Not Discuss This Experiment
          </h2>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            To maintain the integrity of our research, please do not discuss the details 
            of this experiment with others who may participate in the future.
          </p>
        </section>

        {/* Session Info (for debugging/reference) */}
        {(sessionId || participantId) && (
          <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
            Reference: {sessionId ? `Session ${sessionId.slice(0, 8)}...` : ''} 
            {participantId ? ` | Participant ${participantId.slice(0, 8)}...` : ''}
          </div>
        )}

        {/* Final message */}
        <div className="text-center py-8">
          <p className="text-slate-500">
            You may now close this window.
          </p>
        </div>
      </main>
    </div>
  );
}

export default DebriefPage;
