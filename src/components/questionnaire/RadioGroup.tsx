/**
 * RadioGroup Component
 * 
 * A group of radio buttons for single-choice questions.
 * Different from LikertScale - for categorical choices rather than scales.
 */

import { useId } from 'react';

interface RadioOption {
  value: string;
  label: string;
}

interface RadioGroupProps {
  /** The question/label text */
  label: string;
  /** Array of options */
  options: RadioOption[];
  /** Current value */
  value: string | undefined;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Whether the field has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Optional: horizontal layout instead of vertical */
  horizontal?: boolean;
  /** Optional: additional CSS classes */
  className?: string;
  /** Optional: mark as required */
  required?: boolean;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  error = false,
  errorMessage,
  horizontal = false,
  className = '',
  required = false,
}: RadioGroupProps) {
  const baseId = useId();
  
  return (
    <div className={`mb-4 ${className}`}>
      {/* Label */}
      <label className="block mb-2 text-slate-800 font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {/* Options container */}
      <div
        className={`
          ${horizontal ? 'flex flex-wrap gap-4' : 'space-y-2'}
          ${error ? 'p-3 rounded-lg bg-red-50 border border-red-200' : ''}
        `}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`
              flex items-center cursor-pointer group
              ${horizontal ? '' : 'py-1'}
            `}
          >
            <input
              type="radio"
              name={baseId}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only peer"
            />
            
            {/* Custom radio circle */}
            <div
              className={`
                w-5 h-5 rounded-full border-2 mr-3 transition-all
                flex items-center justify-center
                ${value === option.value
                  ? 'border-blue-600 bg-blue-600'
                  : 'border-slate-300 bg-white group-hover:border-blue-400'
                }
              `}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
            
            {/* Label text */}
            <span
              className={`
                text-slate-700 transition-colors
                ${value === option.value ? 'font-medium' : ''}
              `}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
      
      {/* Error message */}
      {error && errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

export default RadioGroup;
