/**
 * LikertScale Component
 * 
 * Renders a horizontal scale with radio buttons for survey questions.
 * Supports customizable labels and scale sizes (typically 7-point).
 * Optionally supports an "N/A" option for questions that may not apply.
 */

import { useId } from 'react';

// Special value for N/A selection
export const NA_VALUE = -999;

interface LikertScaleProps {
  /** The question text to display */
  question: string;
  /** Minimum value (default: 1) */
  min?: number;
  /** Maximum value (default: 7) */
  max?: number;
  /** Label for the minimum end of the scale */
  minLabel: string;
  /** Label for the maximum end of the scale */
  maxLabel: string;
  /** Currently selected value (NA_VALUE for N/A) */
  value: number | undefined;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Whether the field has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Optional: show numeric labels under each option */
  showNumbers?: boolean;
  /** Optional: additional CSS classes */
  className?: string;
  /** Optional: mark question as required */
  required?: boolean;
  /** Optional: note about reverse scoring (for researcher reference) */
  reverseScored?: boolean;
  /** Optional: enable N/A (Not Applicable) option */
  allowNA?: boolean;
  /** Optional: custom label for N/A option (default: "N/A") */
  naLabel?: string;
}

export function LikertScale({
  question,
  min = 1,
  max = 7,
  minLabel,
  maxLabel,
  value,
  onChange,
  error = false,
  errorMessage,
  showNumbers = true,
  className = '',
  required = false,
  reverseScored = false,
  allowNA = false,
  naLabel = 'N/A',
}: LikertScaleProps) {
  // Generate unique ID for accessibility
  const baseId = useId();
  
  // Create array of scale points
  const scalePoints = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  
  // Check if N/A is selected
  const isNASelected = value === NA_VALUE;
  
  return (
    <div className={`mb-6 ${className}`}>
      {/* Question text */}
      <label className="block mb-3 text-slate-800 font-medium">
        {question}
        {required && <span className="text-red-500 ml-1">*</span>}
        {/* Hidden note for reverse scoring (visible in dev tools for researcher) */}
        {reverseScored && (
          <span className="sr-only"> (reverse scored)</span>
        )}
      </label>
      
      {/* Scale container */}
      <div className="flex flex-col">
        {/* Labels row */}
        <div className="flex justify-between mb-2 text-sm text-slate-600">
          <span className="max-w-[120px] text-left">{minLabel}</span>
          <span className="max-w-[120px] text-right">{maxLabel}</span>
        </div>
        
        {/* Radio buttons row */}
        <div 
          className={`
            flex justify-between items-center p-3 rounded-lg
            ${error ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}
          `}
          role="radiogroup"
          aria-label={question}
        >
          {scalePoints.map((point) => (
            <label
              key={point}
              className="flex flex-col items-center cursor-pointer group"
            >
              <input
                type="radio"
                name={baseId}
                value={point}
                checked={value === point}
                onChange={() => onChange(point)}
                className="sr-only peer"
                aria-label={`${point} out of ${max}`}
              />
              
              {/* Custom radio circle */}
              <div
                className={`
                  w-8 h-8 rounded-full border-2 transition-all duration-150
                  flex items-center justify-center
                  ${value === point
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-400 hover:border-blue-400 group-hover:bg-blue-50'
                  }
                `}
              >
                {showNumbers && (
                  <span className="text-sm font-medium">{point}</span>
                )}
              </div>
            </label>
          ))}
        </div>
        
        {/* N/A Option */}
        {allowNA && (
          <div className="mt-3 flex justify-end">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name={baseId}
                value={NA_VALUE}
                checked={isNASelected}
                onChange={() => onChange(NA_VALUE)}
                className="sr-only peer"
                aria-label="Not applicable"
              />
              <div
                className={`
                  px-3 py-1.5 rounded-md border-2 transition-all duration-150
                  text-sm font-medium
                  ${isNASelected
                    ? 'bg-slate-600 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 group-hover:bg-slate-50'
                  }
                `}
              >
                {naLabel}
              </div>
              <span className="text-xs text-slate-500">
                (Not Applicable)
              </span>
            </label>
          </div>
        )}
        
        {/* Error message */}
        {error && errorMessage && (
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}

export default LikertScale;
