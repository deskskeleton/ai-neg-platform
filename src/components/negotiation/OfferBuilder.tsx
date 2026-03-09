/**
 * OfferBuilder Component
 * 
 * Allows participants to construct an offer by selecting options for each issue.
 * Uses the scenario config for issue definitions and options.
 */

import { useState } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { SCENARIO_CONFIG, type ScenarioConfig } from '@/config/scenarios';
import type { NegotiationIssue } from '@/config/scenarios';

// Offer is a map of issue ID to selected option index
export type OfferSelection = Record<string, number | undefined>;

interface OfferBuilderProps {
  /** Callback when offer is submitted */
  onSubmit: (offer: OfferSelection) => void;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
  /** Whether the builder is disabled (e.g., waiting for response) */
  disabled?: boolean;
  /** Optional: pre-fill with existing selections (for counter-offers) */
  initialSelection?: OfferSelection;
  /** Optional: label for submit button */
  submitLabel?: string;
  /** Optional: scenario config (defaults to SCENARIO_CONFIG) */
  scenario?: ScenarioConfig;
}

export function OfferBuilder({
  onSubmit,
  isSubmitting = false,
  disabled = false,
  initialSelection,
  submitLabel,
  scenario = SCENARIO_CONFIG,
}: OfferBuilderProps) {
  const [selection, setSelection] = useState<OfferSelection>(
    initialSelection ?? {}
  );
  
  const issues = scenario.issues;
  const allSelected = issues.every(issue => selection[issue.id] !== undefined);
  const canSubmit = allSelected && !disabled && !isSubmitting;
  
  const handleOptionSelect = (issueId: string, optionIndex: number) => {
    setSelection(prev => ({
      ...prev,
      [issueId]: optionIndex,
    }));
  };
  
  const handleReset = () => {
    setSelection(initialSelection ?? {});
  };
  
  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(selection);
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="font-semibold text-slate-800">
          {submitLabel ?? scenario.ui.makeOffer}
        </h3>
        <p className="text-sm text-slate-600 mt-0.5">
          Select your proposed terms for each issue
        </p>
      </div>
      
      {/* Issues */}
      <div className="p-4 space-y-4">
        {issues.map((issue) => (
          <IssueSelector
            key={issue.id}
            issue={issue}
            selectedIndex={selection[issue.id]}
            onSelect={(index) => handleOptionSelect(issue.id, index)}
            disabled={disabled}
          />
        ))}
      </div>
      
      {/* Actions */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
            transition-colors
            ${canSubmit
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? (
            'Sending...'
          ) : (
            <>
              <Send className="w-4 h-4" />
              {submitLabel ?? scenario.ui.makeOffer}
            </>
          )}
        </button>
      </div>
      
      {/* Validation message */}
      {!allSelected && (
        <p className="px-4 pb-3 text-sm text-amber-600">
          Please select an option for each issue
        </p>
      )}
    </div>
  );
}

// ============================================
// Issue Selector Sub-Component
// ============================================

interface IssueSelectorProps {
  issue: NegotiationIssue;
  selectedIndex: number | undefined;
  onSelect: (index: number) => void;
  disabled?: boolean;
}

function IssueSelector({
  issue,
  selectedIndex,
  onSelect,
  disabled = false,
}: IssueSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        {issue.label}
        {issue.description && (
          <span className="font-normal text-slate-500 ml-1">
            — {issue.description}
          </span>
        )}
      </label>
      
      <div className="flex flex-wrap gap-2">
        {issue.options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(index)}
            disabled={disabled}
            className={`
              px-3 py-1.5 rounded-md text-sm font-medium
              border transition-colors
              ${selectedIndex === index
                ? 'bg-blue-100 border-blue-500 text-blue-700'
                : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400 hover:bg-blue-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default OfferBuilder;
