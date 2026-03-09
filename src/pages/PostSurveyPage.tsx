/**
 * PostSurveyPage Component
 * 
 * Post-negotiation questionnaire collecting:
 * - NASA-TLX Workload (2 items, 7-point scale)
 * - State Trust in AI Assistant (3 items - same as pre-survey expected trust)
 * - Subjective Value Inventory (8 items, with N/A for agreement-related items)
 * - Comprehension Check (role, agreement status)
 * - Open Feedback (optional)
 * 
 * Features:
 * - Read-only chat history sidebar for reference while answering
 * - Two-column layout (chat | survey)
 * - N/A option for items that reference the agreement (if no agreement reached)
 * 
 * Flow: NegotiatePage → PostSurveyPage → DebriefPage
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ClipboardCheck, ArrowRight, ArrowLeft, AlertCircle, MessageSquare, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  ProgressBar,
  QuestionSection,
  LikertScale,
  SliderScale,
  RadioGroup,
  TextInput,
  NA_VALUE,
} from '@/components/questionnaire';
import { updateParticipant, getParticipant, isBackendConfigured, getSessionMessages, getSession, getSessionParticipantByIds, createRoundForPair, getRoundSessionsByPairSessionId, getRoundSessionsForParticipant } from '@/lib/data';
import { SCENARIO_CONFIG, getScenarioById, calculatePoints, getRoleKey, type ScenarioConfig } from '@/config/scenarios';
import { getRoundLabel } from '@/utils/roundLabels';
import type { Json, Message, Session } from '@/types/database.types';

// ============================================
// SURVEY CONFIGURATION
// ============================================

const SURVEY_CONFIG = {
  sections: [
    'Workload',
    'AI Assistant',  // State Trust - new section
    'Outcomes',
    'Relationship',
    'Feedback',
  ],
  
  // NASA-TLX items (7-point scale, adapted from standard 21-point)
  nasaTlxItems: [
    { 
      id: 'mental_demand', 
      text: 'How mentally demanding was the negotiation?',
      minLabel: 'Very Low',
      maxLabel: 'Very High',
    },
    { 
      id: 'effort', 
      text: 'How hard did you have to work (mentally) to accomplish your negotiation goals?',
      minLabel: 'Very Low',
      maxLabel: 'Very High',
    },
  ],
  
  // State Trust in AI Assistant (same items as Expected Trust in pre-survey)
  // This measures trust AFTER interacting with the assistant
  stateTrustItems: [
    { id: 'state_ai1', text: 'I am confident in the AI assistant.' },
    { id: 'state_ai2', text: 'The AI assistant is reliable.' },
    { id: 'state_ai3', text: 'I can trust the AI assistant.' },
  ],
  
  // Subjective Value Inventory - Instrumental Outcomes
  // Items with allowNA: true can be answered N/A if no agreement was reached
  sviInstrumentalItems: [
    { id: 'svi_satisfaction', text: 'How satisfied are you with your own outcome?', reversed: false, allowNA: true },
    { id: 'svi_balance', text: 'How satisfied are you with the balance between your outcome and your counterpart\'s outcome?', reversed: false, allowNA: true },
    { id: 'svi_forfeit', text: 'Did you feel like you forfeited or "lost" in this negotiation?', reversed: true, allowNA: false },
    { id: 'svi_legitimacy', text: 'Do you think the terms of your agreement are consistent with principles of legitimacy or fairness?', reversed: false, allowNA: true },
  ],
  
  // Subjective Value Inventory - Relationship
  // These are about the process, so N/A is not needed
  sviRelationshipItems: [
    { id: 'svi_relationship', text: 'Did the negotiation strengthen your relationship with your counterpart?', reversed: false },
    { id: 'svi_respect', text: 'Do you feel respected by your counterpart?', reversed: false },
    { id: 'svi_again', text: 'Would you be willing to negotiate with this person again?', reversed: false },
    { id: 'svi_constructive', text: 'Did the process feel constructive?', reversed: false },
  ],
  
  // Role options from scenario config
  roleOptions: [
    { value: SCENARIO_CONFIG.roles.roleA.id, label: SCENARIO_CONFIG.roles.roleA.label },
    { value: SCENARIO_CONFIG.roles.roleB.id, label: SCENARIO_CONFIG.roles.roleB.label },
  ],
};

// ============================================
// FORM SCHEMA
// ============================================

// Helper: validates a Likert scale value (1-7) or N/A value
const likertOrNA = z.number().refine(
  (val) => (val >= 1 && val <= 7) || val === NA_VALUE,
  { message: 'Please select a response' }
);

// Helper: validates a standard Likert scale value (1-7)
const likertScale = z.number().min(1).max(7);

const surveySchema = z.object({
  // NASA-TLX (1-7 scale, adapted from standard 21-point to align with Likert)
  mental_demand: likertScale,
  effort: likertScale,
  
  // State Trust in AI Assistant (1-7, measured after negotiation)
  state_ai1: likertScale,
  state_ai2: likertScale,
  state_ai3: likertScale,
  
  // SVI Instrumental (1-7 or N/A for agreement-related items)
  svi_satisfaction: likertOrNA,  // N/A allowed
  svi_balance: likertOrNA,       // N/A allowed
  svi_forfeit: likertScale,      // No N/A - can answer even without agreement
  svi_legitimacy: likertOrNA,    // N/A allowed
  
  // SVI Relationship (1-7)
  svi_relationship: likertScale,
  svi_respect: likertScale,
  svi_again: likertScale,
  svi_constructive: likertScale,
  
  // Comprehension check
  role_check: z.string().min(1, 'Please select your role'),
  agreement_check: z.string().min(1, 'Please indicate if you reached an agreement'),
  
  // Open feedback (optional)
  feedback: z.string().optional(),
});

type SurveyData = z.infer<typeof surveySchema>;

/** Minimal post-round schema: 1 item only (opponent priority guess) */
const minimalPostRoundSchema = z.object({
  opponent_priority_guess: z.enum(['I1', 'I2', 'I3', 'I4']),
});

// ============================================
// COMPONENT
// ============================================

function PostSurveyPage() {
  const { participantId } = useParams<{ participantId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const pairSessionId = searchParams.get('pair_session');
  const batchId = searchParams.get('batch');
  const roundParam = searchParams.get('round');
  const round = roundParam ? parseInt(roundParam, 10) : null;
  const navigate = useNavigate();

  const isMinimalMode = round !== null && round >= 1 && round <= 3;
  /** Final post-survey: pair or batch present, no round - full survey + chat from all 3 rounds */
  const isFinalWithPairSession = Boolean((pairSessionId || batchId) && round === null);
  
  // Form state
  const [currentSection, setCurrentSection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false); // Prevent accidental immediate submission

  /** Minimal mode: opponent priority guess (I1, I2, I3, I4) */
  const [opponentPriorityGuess, setOpponentPriorityGuess] = useState<string | null>(null);
  
  // Chat history state
  const [messages, setMessages] = useState<Message[]>([]);
  /** Final survey: messages grouped by round (Round A/B/C labels when scenario present) */
  const [messagesByRound, setMessagesByRound] = useState<Array<{ round: number; scenario?: string; messages: Message[] }>>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(true);
  
  // Scenario state
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_CONFIG);
  
  // Points display state
  const [session, setSession] = useState<Session | null>(null);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  
  const totalSections = SURVEY_CONFIG.sections.length;
  
  // Load chat history, scenario, and points on mount
  useEffect(() => {
    async function loadSessionData() {
      if (!participantId) {
        setIsLoadingChat(false);
        return;
      }

      try {
        // Final survey: load from all 3 round sessions (pair or pool)
        if ((pairSessionId || batchId) && !sessionId) {
          const roundSessions = pairSessionId
            ? await getRoundSessionsByPairSessionId(pairSessionId)
            : await getRoundSessionsForParticipant(participantId);
          const grouped: Array<{ round: number; scenario?: string; messages: Message[] }> = [];
          for (const rs of roundSessions) {
            const msgs = await getSessionMessages(rs.id);
            grouped.push({ round: rs.round_number ?? 0, scenario: rs.negotiation_scenario ?? undefined, messages: msgs });
          }
          setMessagesByRound(grouped);
          setMessages([]);
          if (roundSessions.length > 0) {
            const first = roundSessions[0];
            setSession(first);
            const scenarioConfig = getScenarioById(first.negotiation_scenario);
            setScenario(scenarioConfig);
            const sp = await getSessionParticipantByIds(first.id, participantId);
            if (sp && first.agreement_reached && first.final_agreement) {
              const roleKey = getRoleKey(sp.role, scenarioConfig);
              if (roleKey) {
                const agreement = first.final_agreement as Record<string, number>;
                setPointsEarned(calculatePoints(agreement, roleKey, scenarioConfig));
              }
            }
          }
          setIsLoadingChat(false);
          return;
        }

        // Single session (round 1/2/3 or legacy)
        if (!sessionId) {
          setIsLoadingChat(false);
          return;
        }

        const sessionData = await getSession(sessionId);
        if (sessionData) {
          setSession(sessionData);
          const scenarioConfig = getScenarioById(sessionData.negotiation_scenario);
          setScenario(scenarioConfig);

          const sessionParticipant = await getSessionParticipantByIds(sessionId, participantId);
          if (sessionParticipant) {
            if (sessionData.agreement_reached && sessionData.final_agreement) {
              const roleKey = getRoleKey(sessionParticipant.role, scenarioConfig);
              if (roleKey) {
                const agreement = sessionData.final_agreement as Record<string, number>;
                setPointsEarned(calculatePoints(agreement, roleKey, scenarioConfig));
              }
            }
          }
        }

        const chatMessages = await getSessionMessages(sessionId);
        setMessages(chatMessages);
      } catch (err) {
        console.error('Failed to load session data:', err);
      } finally {
        setIsLoadingChat(false);
      }
    }

    loadSessionData();
  }, [sessionId, participantId, pairSessionId, batchId]);
  
  // React Hook Form
  const { 
    watch, 
    setValue, 
    handleSubmit,
    formState: { errors },
    trigger,
  } = useForm<SurveyData>({
    resolver: zodResolver(surveySchema) as any,
    mode: 'onBlur',
    defaultValues: {
      feedback: '',
    },
  });
  
  const formValues = watch();
  
  // Enable submit button after viewing feedback section for a moment
  // This prevents accidental immediate submission when navigating to the last section
  useEffect(() => {
    if (currentSection === totalSections) {
      setCanSubmit(false);
      const timer = setTimeout(() => {
        setCanSubmit(true);
      }, 500); // 500ms delay before enabling submit
      return () => clearTimeout(timer);
    }
  }, [currentSection, totalSections]);

  // ============================================
  // SECTION VALIDATION
  // ============================================
  
  const getSectionFields = (section: number): (keyof SurveyData)[] => {
    switch (section) {
      case 1: return ['mental_demand', 'effort'];
      case 2: return ['state_ai1', 'state_ai2', 'state_ai3'];  // State Trust
      case 3: return ['svi_satisfaction', 'svi_balance', 'svi_forfeit', 'svi_legitimacy'];  // Outcomes
      case 4: return ['svi_relationship', 'svi_respect', 'svi_again', 'svi_constructive', 'role_check', 'agreement_check'];  // Relationship
      case 5: return []; // Feedback is optional
      default: return [];
    }
  };
  
  const isSectionComplete = (section: number): boolean => {
    const fields = getSectionFields(section);
    if (fields.length === 0) return true; // Section 4 (feedback) is always complete
    
    return fields.every(field => {
      const value = formValues[field];
      return value !== undefined && value !== '' && value !== null;
    });
  };

  // ============================================
  // NAVIGATION
  // ============================================
  
  const handleNext = async () => {
    const fields = getSectionFields(currentSection);
    const valid = await trigger(fields);
    
    if (valid && currentSection < totalSections) {
      setCurrentSection(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  
  const handlePrevious = () => {
    if (currentSection > 1) {
      setCurrentSection(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ============================================
  // SUBMISSION
  // ============================================
  
  /** Minimal mode submit: save opponent_priority_guess, redirect to next round or final survey */
  const onSubmitMinimal = async () => {
    if (!participantId || round === null || (!pairSessionId && !batchId)) {
      setSubmitError('Missing participant, round, or batch/pair session');
      return;
    }
    const parsed = minimalPostRoundSchema.safeParse({ opponent_priority_guess: opponentPriorityGuess });
    if (!parsed.success) {
      setSubmitError('Please select which issue was most important to your opponent');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const p = await getParticipant(participantId);
      const existing = (p?.post_round_survey_data as Record<string, unknown>) ?? {};
      const merged = {
        ...existing,
        [String(round)]: { opponent_priority_guess: parsed.data.opponent_priority_guess },
      };
      await updateParticipant(participantId, {
        post_round_survey_data: merged as unknown as Json,
      });

      if (batchId) {
        if (round === 1 || round === 2) {
          navigate(`/round-lobby/${round + 1}?participant=${participantId}&batch=${batchId}`);
        } else {
          navigate(`/post-survey/${participantId}?batch=${batchId}`);
        }
      } else if (pairSessionId) {
        if (round === 1 || round === 2) {
          const nextRoundSessionId = await createRoundForPair(pairSessionId, round + 1);
          navigate(`/briefing/${nextRoundSessionId}?participant=${participantId}&pair_session=${pairSessionId}`);
        } else {
          navigate(`/post-survey/${participantId}?pair_session=${pairSessionId}`);
        }
      } else {
        setSubmitError('Missing batch or pair session');
      }
    } catch (err) {
      console.error('Post-round survey error:', err);
      setSubmitError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: SurveyData) => {
    if (!participantId) {
      setSubmitError('Missing participant ID');
      return;
    }
    
    if (!isBackendConfigured()) {
      setSubmitError('Database not configured');
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Helper to convert N/A values to null for storage
      const valueOrNull = (val: number) => val === NA_VALUE ? null : val;
      
      // Structure the data for storage
      const surveyData = {
        nasa_tlx: {
          mental_demand: data.mental_demand,
          effort: data.effort,
        },
        // State Trust - same items as Expected Trust, measured after negotiation
        ai_trust_state: {
          ai1: data.state_ai1,
          ai2: data.state_ai2,
          ai3: data.state_ai3,
        },
        subjective_value_inventory: {
          instrumental: {
            satisfaction: valueOrNull(data.svi_satisfaction),
            satisfaction_is_na: data.svi_satisfaction === NA_VALUE,
            balance: valueOrNull(data.svi_balance),
            balance_is_na: data.svi_balance === NA_VALUE,
            forfeit: data.svi_forfeit, // Note: reverse-scored in analysis
            forfeit_reversed: true,
            legitimacy: valueOrNull(data.svi_legitimacy),
            legitimacy_is_na: data.svi_legitimacy === NA_VALUE,
          },
          relationship: {
            strengthened: data.svi_relationship,
            respected: data.svi_respect,
            willing_again: data.svi_again,
            constructive: data.svi_constructive,
          },
        },
        comprehension_check: {
          role: data.role_check,
          reached_agreement: data.agreement_check === 'yes',
        },
        feedback: data.feedback || null,
        completed_at: new Date().toISOString(),
        version: '2.0', // Updated version for new schema with state trust
      };
      
      // Save to database (include round for multi-round; final survey overwrites or merges per design)
      await updateParticipant(participantId, {
        post_questionnaire_data: { ...surveyData, round } as unknown as Json,
      });

      // Debrief: pass session or pair_session for reference
      const params = new URLSearchParams({ participant: participantId });
      if (sessionId) params.set('session', sessionId);
      else if (pairSessionId) params.set('pair_session', pairSessionId);
      navigate(`/debrief?${params.toString()}`);
      
    } catch (error) {
      console.error('Survey submission error:', error);
      setSubmitError('Failed to save survey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  
  const renderWorkloadSection = () => (
    <QuestionSection
      title="Mental Workload"
      sectionNumber={1}
      description="Please rate your experience during the negotiation."
    >
      {SURVEY_CONFIG.nasaTlxItems.map((item) => (
        <SliderScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          step={1}
          minLabel={item.minLabel}
          maxLabel={item.maxLabel}
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a value"
        />
      ))}
    </QuestionSection>
  );
  
  const renderStateTrustSection = () => (
    <QuestionSection
      title="AI Assistant Experience"
      sectionNumber={2}
      description="After using the AI assistant during the negotiation, please rate your experience."
    >
      {SURVEY_CONFIG.stateTrustItems.map((item) => (
        <LikertScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          minLabel="Not at all"
          maxLabel="Extremely"
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a response"
        />
      ))}
    </QuestionSection>
  );
  
  const renderInstrumentalSection = () => (
    <QuestionSection
      title="Negotiation Outcomes"
      sectionNumber={3}
      description="Please rate how you feel about the outcomes of the negotiation. Select N/A if you did not reach an agreement."
    >
      {SURVEY_CONFIG.sviInstrumentalItems.map((item) => (
        <LikertScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          minLabel="Not at all"
          maxLabel="Perfectly"
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          reverseScored={item.reversed}
          allowNA={item.allowNA}
          naLabel="N/A"
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a response"
        />
      ))}
    </QuestionSection>
  );
  
  const renderRelationshipSection = () => (
    <QuestionSection
      title="Relationship & Process"
      sectionNumber={4}
      description="Please rate your experience with your negotiation partner."
    >
      {SURVEY_CONFIG.sviRelationshipItems.map((item) => (
        <LikertScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          minLabel="Not at all"
          maxLabel="Perfectly"
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a response"
        />
      ))}
      
      {/* Comprehension Check */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-medium text-slate-700 mb-4">Comprehension Check</h3>
        
        <RadioGroup
          label="What was your role in the negotiation?"
          options={[
            { value: scenario.roles.roleA.id, label: scenario.roles.roleA.label },
            { value: scenario.roles.roleB.id, label: scenario.roles.roleB.label },
          ]}
          value={formValues.role_check}
          onChange={(val) => setValue('role_check', val)}
          required
          error={!!errors.role_check}
          errorMessage={errors.role_check?.message}
        />
        
        <RadioGroup
          label="Did you and your partner reach an agreement?"
          options={[
            { value: 'yes', label: 'Yes, we reached an agreement' },
            { value: 'no', label: 'No, we did not reach an agreement' },
          ]}
          value={formValues.agreement_check}
          onChange={(val) => setValue('agreement_check', val)}
          required
          error={!!errors.agreement_check}
          errorMessage={errors.agreement_check?.message}
        />
      </div>
    </QuestionSection>
  );
  
  const renderFeedbackSection = () => (
    <QuestionSection
      title="Additional Feedback"
      sectionNumber={5}
      description="Your feedback helps us improve future experiments. (Optional)"
    >
      <TextInput
        label="Any comments about your experience or the AI assistant?"
        value={formValues.feedback ?? ''}
        onChange={(val) => setValue('feedback', val)}
        multiline
        rows={5}
        placeholder="Share your thoughts about the negotiation experience, the AI assistant, or any suggestions for improvement..."
        helperText="This field is optional"
      />
    </QuestionSection>
  );
  
  const renderCurrentSection = () => {
    switch (currentSection) {
      case 1: return renderWorkloadSection();
      case 2: return renderStateTrustSection();
      case 3: return renderInstrumentalSection();
      case 4: return renderRelationshipSection();
      case 5: return renderFeedbackSection();
      default: return null;
    }
  };

  /** Opponent priority guess options for minimal post-round survey */
  const OPPONENT_PRIORITY_OPTIONS = [
    { value: 'I1', label: 'Issue 1' },
    { value: 'I2', label: 'Issue 2' },
    { value: 'I3', label: 'Issue 3' },
    { value: 'I4', label: 'Issue 4' },
  ];

  // ============================================
  // MINIMAL MODE RENDER (round 1/2/3: 1 item only)
  // ============================================
  if (isMinimalMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        {isChatPanelOpen && sessionId && (
          <aside className="w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between">
              <h2 className="font-semibold text-slate-900">Chat History (Round {round})</h2>
              <button onClick={() => setIsChatPanelOpen(false)} className="p-1 hover:bg-slate-200 rounded">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingChat ? (
                <p className="text-slate-500">Loading...</p>
              ) : messages.length === 0 ? (
                <p className="text-slate-500">No messages</p>
              ) : (
                messages.map((msg) => (
                  <ChatMessageBubble key={msg.id} message={msg} currentParticipantId={participantId || ''} />
                ))
              )}
            </div>
          </aside>
        )}
        {!isChatPanelOpen && (
          <button
            onClick={() => setIsChatPanelOpen(true)}
            className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-l-0 border-slate-200 rounded-r-lg px-2 py-4 shadow-md hover:bg-slate-50 z-20"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
            <div className="max-w-3xl mx-auto px-4 py-4">
              <h1 className="text-xl font-semibold text-slate-900">Quick Question (Round {round})</h1>
            </div>
          </header>
          <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
              <QuestionSection title="Opponent Priority" sectionNumber={1} description="Which issue do you think was most important to your opponent?">
                <RadioGroup
                  label="Select the issue"
                  options={OPPONENT_PRIORITY_OPTIONS}
                  value={opponentPriorityGuess ?? ''}
                  onChange={(val) => setOpponentPriorityGuess(val)}
                  error={!!submitError && !opponentPriorityGuess}
                  errorMessage="Please select an issue"
                  required
                />
              </QuestionSection>
            </div>
            {submitError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{submitError}</p>
              </div>
            )}
            <button
              type="button"
              onClick={onSubmitMinimal}
              disabled={isSubmitting || !opponentPriorityGuess}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Submitting...' : 'Continue'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </main>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER (full survey)
  // ============================================
  
  const isLastSection = currentSection === totalSections;
  const canProceed = isSectionComplete(currentSection);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Chat History Sidebar */}
      {isChatPanelOpen && (
        <aside className="w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-600" />
              <h2 className="font-semibold text-slate-900">Chat History</h2>
              <Lock className="w-4 h-4 text-slate-400" />
            </div>
            <button
              onClick={() => setIsChatPanelOpen(false)}
              className="p-1 hover:bg-slate-200 rounded"
              title="Hide chat"
            >
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          
          {/* Chat Messages - grouped by round for final survey, single list otherwise */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingChat ? (
              <div className="text-center text-slate-500 py-8">
                Loading conversation...
              </div>
            ) : isFinalWithPairSession && messagesByRound.length > 0 ? (
              messagesByRound.map(({ round: r, scenario: scenarioKey, messages: msgs }) => (
                <div key={r} className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-600 mb-2 sticky top-0 bg-white py-1">
                    {getRoundLabel(scenarioKey) || `Round ${r}`}
                  </h3>
                  <div className="space-y-3">
                    {msgs.map((msg) => (
                      <ChatMessageBubble
                        key={msg.id}
                        message={msg}
                        currentParticipantId={participantId || ''}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : messages.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                No messages in this session.
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  currentParticipantId={participantId || ''}
                />
              ))
            )}
          </div>
          
          {/* Points Summary */}
          {session && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              {session.agreement_reached && pointsEarned !== null ? (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Agreement Reached</p>
                  <p className="text-lg font-bold text-green-600">{pointsEarned} points earned</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">No Agreement</p>
                  <p className="text-sm text-slate-600">Session ended without agreement</p>
                </div>
              )}
            </div>
          )}
          
          {/* Chat Footer */}
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <p className="text-xs text-slate-500 text-center">
              Read-only · Reference while completing survey
            </p>
          </div>
        </aside>
      )}
      
      {/* Toggle button when chat is hidden */}
      {!isChatPanelOpen && (
        <button
          onClick={() => setIsChatPanelOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-l-0 border-slate-200 rounded-r-lg px-2 py-4 shadow-md hover:bg-slate-50 z-20"
          title="Show chat history"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
          <span className="sr-only">Show chat</span>
        </button>
      )}
      
      {/* Main Survey Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3 mb-4">
              <ClipboardCheck className="w-6 h-6 text-green-600" />
              <h1 className="text-xl font-semibold text-slate-900">
                Post-Negotiation Survey
              </h1>
            </div>
            
            <ProgressBar
              current={currentSection}
              total={totalSections}
              labels={SURVEY_CONFIG.sections}
            />
          </div>
        </header>

        {/* Survey Content */}
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Current Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
              {renderCurrentSection()}
            </div>

            {/* Error Message */}
            {submitError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">Error</p>
                  <p className="text-red-700 text-sm">{submitError}</p>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentSection === 1}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                  transition-colors
                  ${currentSection === 1
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-slate-700 hover:bg-slate-100'
                  }
                `}
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>
              
              {isLastSection ? (
                <button
                  type="submit"
                  disabled={isSubmitting || !canSubmit}
                  className={`
                    flex items-center gap-2 px-6 py-2 rounded-lg font-medium
                    transition-colors
                    ${!isSubmitting && canSubmit
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }
                  `}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit & Finish'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed}
                  className={`
                    flex items-center gap-2 px-6 py-2 rounded-lg font-medium
                    transition-colors
                    ${canProceed
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }
                  `}
                >
                  Next Section
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          {/* Debug info */}
          {import.meta.env.DEV && (
            <p className="text-center text-xs text-slate-400 mt-8">
              Participant: {participantId} | Session: {sessionId || 'N/A'}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================
// CHAT MESSAGE BUBBLE (Read-only)
// ============================================

interface ChatMessageBubbleProps {
  message: Message;
  currentParticipantId: string;
}

function ChatMessageBubble({ message, currentParticipantId }: ChatMessageBubbleProps) {
  const isOwnMessage = message.participant_id === currentParticipantId;
  const isOffer = message.message_type === 'offer';
  const isAcceptance = message.message_type === 'acceptance';
  const isRejection = message.message_type === 'rejection';
  
  const time = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
        isOwnMessage 
          ? 'bg-blue-100 text-blue-900' 
          : 'bg-slate-100 text-slate-900'
      } ${
        isOffer ? 'border-2 border-amber-300 bg-amber-50' : ''
      } ${
        isAcceptance ? 'border-2 border-green-300 bg-green-50' : ''
      } ${
        isRejection ? 'border-2 border-red-300 bg-red-50' : ''
      }`}>
        {(isOffer || isAcceptance || isRejection) && (
          <div className={`text-xs font-semibold mb-1 ${
            isOffer ? 'text-amber-600' : isAcceptance ? 'text-green-600' : 'text-red-600'
          }`}>
            {isOffer ? '📋 OFFER' : isAcceptance ? '✅ ACCEPTED' : '❌ REJECTED'}
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p className="text-xs text-slate-400 mt-1">{time}</p>
      </div>
    </div>
  );
}

export default PostSurveyPage;
