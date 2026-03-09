/**
 * TextInput Component
 * 
 * A styled text input for open-ended survey questions.
 * Supports single-line and multi-line (textarea) modes.
 */

import { useId } from 'react';

interface TextInputProps {
  /** The question/label text */
  label: string;
  /** Input type (text, number, email, etc.) */
  type?: 'text' | 'number' | 'email';
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value: string | number | undefined;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Whether the field has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Optional: use textarea instead of input */
  multiline?: boolean;
  /** Optional: number of rows for textarea */
  rows?: number;
  /** Optional: additional CSS classes */
  className?: string;
  /** Optional: mark as required */
  required?: boolean;
  /** Optional: min value for number inputs */
  min?: number;
  /** Optional: max value for number inputs */
  max?: number;
  /** Optional: helper text below input */
  helperText?: string;
}

export function TextInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error = false,
  errorMessage,
  multiline = false,
  rows = 3,
  className = '',
  required = false,
  min,
  max,
  helperText,
}: TextInputProps) {
  const id = useId();
  
  const inputClasses = `
    w-full px-3 py-2 rounded-lg border transition-colors
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    ${error 
      ? 'border-red-300 bg-red-50' 
      : 'border-slate-300 bg-white hover:border-slate-400'
    }
  `;
  
  return (
    <div className={`mb-4 ${className}`}>
      {/* Label */}
      <label htmlFor={id} className="block mb-2 text-slate-800 font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {/* Input or Textarea */}
      {multiline ? (
        <textarea
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`${inputClasses} resize-none`}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          className={inputClasses}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      )}
      
      {/* Helper text */}
      {helperText && !error && (
        <p className="mt-1 text-sm text-slate-500">{helperText}</p>
      )}
      
      {/* Error message */}
      {error && errorMessage && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default TextInput;
