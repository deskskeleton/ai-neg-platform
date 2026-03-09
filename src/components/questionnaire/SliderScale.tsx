/**
 * SliderScale Component
 * 
 * A slider input for scales with many points (e.g., NASA-TLX 21-point scale).
 * Better UX than 21 radio buttons.
 */

import { useId } from 'react';

interface SliderScaleProps {
  /** The question text to display */
  question: string;
  /** Minimum value (default: 0) */
  min?: number;
  /** Maximum value (default: 20) */
  max?: number;
  /** Step increment (default: 1) */
  step?: number;
  /** Label for the minimum end of the scale */
  minLabel: string;
  /** Label for the maximum end of the scale */
  maxLabel: string;
  /** Currently selected value */
  value: number | undefined;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Whether the field has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Optional: show current value */
  showValue?: boolean;
  /** Optional: additional CSS classes */
  className?: string;
  /** Optional: mark question as required */
  required?: boolean;
}

export function SliderScale({
  question,
  min = 0,
  max = 20,
  step = 1,
  minLabel,
  maxLabel,
  value,
  onChange,
  error = false,
  errorMessage,
  showValue = true,
  className = '',
  required = false,
}: SliderScaleProps) {
  const id = useId();
  
  // Calculate percentage for styling
  const percentage = value !== undefined 
    ? ((value - min) / (max - min)) * 100 
    : 50;
  
  return (
    <div className={`mb-6 ${className}`}>
      {/* Question text */}
      <label htmlFor={id} className="block mb-3 text-slate-800 font-medium">
        {question}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {/* Slider container */}
      <div 
        className={`
          p-4 rounded-lg
          ${error ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}
        `}
      >
        {/* Labels row */}
        <div className="flex justify-between mb-3 text-sm text-slate-600">
          <span className="max-w-[100px]">{minLabel}</span>
          {showValue && value !== undefined && (
            <span className="font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
              {value}
            </span>
          )}
          <span className="max-w-[100px] text-right">{maxLabel}</span>
        </div>
        
        {/* Slider input */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? Math.floor((max - min) / 2) + min}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`
            w-full h-2 rounded-lg appearance-none cursor-pointer
            bg-gradient-to-r from-slate-300 to-slate-300
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-blue-600
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-blue-600
            [&::-moz-range-thumb]:border-none
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer
          `}
          style={{
            background: `linear-gradient(to right, #2563eb 0%, #2563eb ${percentage}%, #cbd5e1 ${percentage}%, #cbd5e1 100%)`,
          }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />
        
        {/* Tick marks */}
        <div className="flex justify-between mt-1 px-1">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="text-xs text-slate-400">
              |
            </span>
          ))}
        </div>
      </div>
      
      {/* Error message */}
      {error && errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

export default SliderScale;
