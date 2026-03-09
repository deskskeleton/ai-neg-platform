/**
 * PreSurveyPage Component
 * 
 * Pre-negotiation questionnaire collecting:
 * - Demographics (age, gender, field of study)
 * - Machine Trust Propensity (6 items)
 * - Expected Trust in AI Assistant (3 items)
 * - Experience (2 items)
 * 
 * Flow: JoinSessionPage (matched) → PreSurveyPage → JoinSessionPage (survey pending)
 * 
 * After submission, marks the participant's survey as complete and returns
 * to JoinSessionPage to wait for partner to finish their survey.
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ClipboardList, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  ProgressBar,
  QuestionSection,
  LikertScale,
  TextInput,
  SelectInput,
} from '@/components/questionnaire';
import { updateParticipant, markPreSurveyComplete, getBatch, isBackendConfigured } from '@/lib/data';
import type { Json } from '@/types/database.types';

// ============================================
// SURVEY CONFIGURATION
// Edit these to change questions/labels
// ============================================

const SURVEY_CONFIG = {
  sections: [
    'Demographics',
    'Machine Trust',
    'AI Assistant Trust',
    'Experience',
  ],
  
  genderOptions: [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'non-binary', label: 'Non-binary' },
    { value: 'other', label: 'Other' },
    { value: 'prefer-not', label: 'Prefer not to say' },
  ],
  
  // Machine Trust Propensity Scale (Mayer & Davis adapted for machines)
  // Items 2 is reverse-scored (noted in code)
  machineTrustItems: [
    { id: 'mt1', text: 'I usually trust machines until there is a reason not to.', reversed: false },
    { id: 'mt2', text: 'For the most part, I distrust machines.', reversed: true },
    { id: 'mt3', text: 'In general, I would rely on a machine to assist me.', reversed: false },
    { id: 'mt4', text: 'My tendency to trust machines is high.', reversed: false },
    { id: 'mt5', text: 'It is easy for me to trust machines to do their job.', reversed: false },
    { id: 'mt6', text: 'I am likely to trust a machine even when I have little knowledge about it.', reversed: false },
  ],
  
  // Expected Trust in AI Assistant Scale
  aiTrustItems: [
    { id: 'ai1', text: 'I am confident in the AI assistant.' },
    { id: 'ai2', text: 'The AI assistant is reliable.' },
    { id: 'ai3', text: 'I can trust the AI assistant.' },
  ],
  
  // Experience items
  experienceItems: [
    { 
      id: 'exp_negotiation', 
      text: 'How much experience do you have with formal negotiation?',
      minLabel: 'No experience',
      maxLabel: 'Extensive experience',
    },
    { 
      id: 'exp_ai', 
      text: 'How familiar are you with modern LLM-based AI tools (e.g., ChatGPT, Claude)?',
      minLabel: 'Not familiar',
      maxLabel: 'Very familiar',
    },
  ],
};

// ============================================
// FORM SCHEMA
// ============================================

const surveySchema = z.object({
  // Demographics
  age: z.number()
    .min(18, 'You must be at least 18 years old')
    .max(100, 'Please enter a valid age'),
  gender: z.string().min(1, 'Please select your gender'),
  fieldOfStudy: z.string().min(1, 'Please enter your field of study'),
  
  // Machine Trust (1-7)
  mt1: z.number().min(1).max(7),
  mt2: z.number().min(1).max(7),
  mt3: z.number().min(1).max(7),
  mt4: z.number().min(1).max(7),
  mt5: z.number().min(1).max(7),
  mt6: z.number().min(1).max(7),
  
  // AI Trust (1-7)
  ai1: z.number().min(1).max(7),
  ai2: z.number().min(1).max(7),
  ai3: z.number().min(1).max(7),
  
  // Experience (1-7)
  exp_negotiation: z.number().min(1).max(7),
  exp_ai: z.number().min(1).max(7),
});

type SurveyData = z.infer<typeof surveySchema>;

// ============================================
// COMPONENT
// ============================================

function PreSurveyPage() {
  const { participantId } = useParams<{ participantId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const sessionCode = searchParams.get('code'); // Session or batch code for navigation
  const batchId = searchParams.get('batch');    // Batch flow: pass in redirect so join page can resolve batch
  const navigate = useNavigate();
  
  // Form state
  const [currentSection, setCurrentSection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const totalSections = SURVEY_CONFIG.sections.length;
  
  // React Hook Form
  const { 
    watch, 
    setValue, 
    handleSubmit,
    formState: { errors },
    trigger,
  } = useForm<SurveyData>({
    resolver: zodResolver(surveySchema) as any, // Type workaround for zod v4
    mode: 'onBlur',
    defaultValues: {
      age: undefined,
      gender: '',
      fieldOfStudy: '',
    },
  });
  
  const formValues = watch();

  // ============================================
  // SECTION VALIDATION
  // ============================================
  
  const getSectionFields = (section: number): (keyof SurveyData)[] => {
    switch (section) {
      case 1: return ['age', 'gender', 'fieldOfStudy'];
      case 2: return ['mt1', 'mt2', 'mt3', 'mt4', 'mt5', 'mt6'];
      case 3: return ['ai1', 'ai2', 'ai3'];
      case 4: return ['exp_negotiation', 'exp_ai'];
      default: return [];
    }
  };
  
  const isSectionComplete = (section: number): boolean => {
    const fields = getSectionFields(section);
    return fields.every(field => {
      const value = formValues[field];
      return value !== undefined && value !== '' && value !== null;
    });
  };

  // ============================================
  // NAVIGATION
  // ============================================
  
  const handleNext = async () => {
    // Validate current section
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
      // Structure the data for storage
      const surveyData = {
        demographics: {
          age: data.age,
          gender: data.gender,
          field_of_study: data.fieldOfStudy,
        },
        machine_trust_propensity: {
          mt1: data.mt1,
          mt2: data.mt2,  // Note: reverse-scored in analysis
          mt2_reversed: true,
          mt3: data.mt3,
          mt4: data.mt4,
          mt5: data.mt5,
          mt6: data.mt6,
        },
        ai_trust_expected: {
          ai1: data.ai1,
          ai2: data.ai2,
          ai3: data.ai3,
        },
        experience: {
          negotiation: data.exp_negotiation,
          ai_tools: data.exp_ai,
        },
        completed_at: new Date().toISOString(),
        version: '1.0', // For tracking survey version changes
      };
      
      // Save to database
      await updateParticipant(participantId, {
        pre_questionnaire_data: surveyData as unknown as Json,
      });
      
      // Mark pre-survey as complete in session_participants table
      if (sessionId) {
        await markPreSurveyComplete(sessionId, participantId);
      }
      
      // Navigate back: batch flow -> round lobby entry; pair flow -> wait for partner
      // Always include code (or batch id) so JoinSessionPage can show "Continue to Round 1" for batch
      const surveyParams = `participant=${participantId}&from=survey`;
      if (sessionCode) {
        const batchQ = batchId ? `&batch=${batchId}` : '';
        navigate(`/join/${sessionCode}?${surveyParams}${batchQ}`);
      } else if (batchId) {
        const batch = await getBatch(batchId);
        if (batch) {
          navigate(`/join/${batch.batch_code}?${surveyParams}&batch=${batchId}`);
        } else {
          navigate(`/join?${surveyParams}`);
        }
      } else if (sessionId) {
        navigate(`/join/${sessionId}?${surveyParams}`);
      } else {
        navigate(`/join?${surveyParams}`);
      }
      
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
  
  const renderDemographicsSection = () => (
    <QuestionSection
      title="Demographics"
      sectionNumber={1}
      description="Please provide some basic information about yourself."
    >
      <TextInput
        label="Age"
        type="number"
        value={formValues.age ?? ''}
        onChange={(val) => setValue('age', val ? parseInt(val) : undefined as any)}
        placeholder="Enter your age"
        required
        min={18}
        max={100}
        error={!!errors.age}
        errorMessage={errors.age?.message}
      />
      
      <SelectInput
        label="Gender"
        options={SURVEY_CONFIG.genderOptions}
        value={formValues.gender}
        onChange={(val) => setValue('gender', val)}
        placeholder="Select your gender"
        required
        error={!!errors.gender}
        errorMessage={errors.gender?.message}
      />
      
      <TextInput
        label="Field of Study / Profession"
        value={formValues.fieldOfStudy ?? ''}
        onChange={(val) => setValue('fieldOfStudy', val)}
        placeholder="e.g., Economics, Computer Science, Business"
        required
        error={!!errors.fieldOfStudy}
        errorMessage={errors.fieldOfStudy?.message}
      />
    </QuestionSection>
  );
  
  const renderMachineTrustSection = () => (
    <QuestionSection
      title="Trust in Machines"
      sectionNumber={2}
      description="Please indicate how much you agree with each statement."
    >
      {SURVEY_CONFIG.machineTrustItems.map((item) => (
        <LikertScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          minLabel="Strongly Disagree"
          maxLabel="Strongly Agree"
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          reverseScored={item.reversed}
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a response"
        />
      ))}
    </QuestionSection>
  );
  
  const renderAITrustSection = () => (
    <QuestionSection
      title="Expected Trust in AI Assistant"
      sectionNumber={3}
      description="During the negotiation, you will have access to an AI assistant. Please indicate your expectations."
    >
      {SURVEY_CONFIG.aiTrustItems.map((item) => (
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
  
  const renderExperienceSection = () => (
    <QuestionSection
      title="Your Experience"
      sectionNumber={4}
      description="Please rate your experience in the following areas."
    >
      {SURVEY_CONFIG.experienceItems.map((item) => (
        <LikertScale
          key={item.id}
          question={item.text}
          min={1}
          max={7}
          minLabel={item.minLabel}
          maxLabel={item.maxLabel}
          value={formValues[item.id as keyof SurveyData] as number}
          onChange={(val) => setValue(item.id as keyof SurveyData, val)}
          required
          error={!!errors[item.id as keyof SurveyData]}
          errorMessage="Please select a response"
        />
      ))}
    </QuestionSection>
  );
  
  const renderCurrentSection = () => {
    switch (currentSection) {
      case 1: return renderDemographicsSection();
      case 2: return renderMachineTrustSection();
      case 3: return renderAITrustSection();
      case 4: return renderExperienceSection();
      default: return null;
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  
  const isLastSection = currentSection === totalSections;
  const canProceed = isSectionComplete(currentSection);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-slate-900">
              Pre-Negotiation Survey
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
      <main className="max-w-3xl mx-auto px-4 py-8">
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
                disabled={!canProceed || isSubmitting}
                className={`
                  flex items-center gap-2 px-6 py-2 rounded-lg font-medium
                  transition-colors
                  ${canProceed && !isSubmitting
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }
                `}
              >
                {isSubmitting ? 'Submitting...' : 'Submit & Continue'}
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

        {/* Debug info (remove in production) */}
        {import.meta.env.DEV && (
          <p className="text-center text-xs text-slate-400 mt-8">
            Participant: {participantId} | Session: {sessionId || 'N/A'}
          </p>
        )}
      </main>
    </div>
  );
}

export default PreSurveyPage;
