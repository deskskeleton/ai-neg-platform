/**
 * SelectInput Component
 * 
 * A styled dropdown select for survey questions with predefined options.
 */

import { useId } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  /** The question/label text */
  label: string;
  /** Array of options */
  options: SelectOption[];
  /** Placeholder text for empty state */
  placeholder?: string;
  /** Current value */
  value: string | undefined;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Whether the field has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Optional: additional CSS classes */
  className?: string;
  /** Optional: mark as required */
  required?: boolean;
  /** Optional: helper text below input */
  helperText?: string;
}

export function SelectInput({
  label,
  options,
  placeholder = 'Select an option...',
  value,
  onChange,
  error = false,
  errorMessage,
  className = '',
  required = false,
  helperText,
}: SelectInputProps) {
  const id = useId();
  
  return (
    <div className={`mb-4 ${className}`}>
      {/* Label */}
      <label htmlFor={id} className="block mb-2 text-slate-800 font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {/* Select */}
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`
          w-full px-3 py-2 rounded-lg border transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          appearance-none bg-no-repeat bg-right cursor-pointer
          ${error 
            ? 'border-red-300 bg-red-50' 
            : 'border-slate-300 bg-white hover:border-slate-400'
          }
          ${!value ? 'text-slate-400' : 'text-slate-800'}
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.5rem center',
          backgroundSize: '1.5em 1.5em',
          paddingRight: '2.5rem',
        }}
        aria-invalid={error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
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

export default SelectInput;
