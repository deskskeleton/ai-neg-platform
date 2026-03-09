/**
 * ProgressBar Component
 * 
 * Visual progress indicator for multi-section surveys.
 * Shows current progress and section labels.
 */

interface ProgressBarProps {
  /** Current section (1-indexed) */
  current: number;
  /** Total number of sections */
  total: number;
  /** Optional: section labels */
  labels?: string[];
  /** Optional: additional CSS classes */
  className?: string;
}

export function ProgressBar({
  current,
  total,
  labels,
  className = '',
}: ProgressBarProps) {
  // Calculate percentage
  const percentage = Math.round((current / total) * 100);
  
  return (
    <div className={`w-full ${className}`}>
      {/* Progress info */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-slate-600">
          Section {current} of {total}
        </span>
        <span className="text-sm text-slate-500">
          {percentage}% complete
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
        />
      </div>
      
      {/* Section labels (if provided) */}
      {labels && labels.length > 0 && (
        <div className="flex justify-between mt-2">
          {labels.map((label, index) => (
            <span
              key={index}
              className={`
                text-xs transition-colors
                ${index + 1 <= current ? 'text-blue-600 font-medium' : 'text-slate-400'}
              `}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
