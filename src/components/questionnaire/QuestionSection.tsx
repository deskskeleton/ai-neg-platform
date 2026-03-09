/**
 * QuestionSection Component
 * 
 * A styled container for grouping related survey questions.
 * Provides consistent styling and optional numbering.
 */

import type { ReactNode } from 'react';

interface QuestionSectionProps {
  /** Section title */
  title: string;
  /** Optional section number (e.g., "Section 1") */
  sectionNumber?: number;
  /** Optional description or instructions */
  description?: string;
  /** Child components (questions) */
  children: ReactNode;
  /** Optional: additional CSS classes */
  className?: string;
}

export function QuestionSection({
  title,
  sectionNumber,
  description,
  children,
  className = '',
}: QuestionSectionProps) {
  return (
    <section className={`mb-8 ${className}`}>
      {/* Section header */}
      <div className="mb-4 pb-3 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800">
          {sectionNumber !== undefined && (
            <span className="text-blue-600 mr-2">
              Section {sectionNumber}:
            </span>
          )}
          {title}
        </h2>
        
        {description && (
          <p className="mt-1 text-sm text-slate-600">
            {description}
          </p>
        )}
      </div>
      
      {/* Questions */}
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

export default QuestionSection;
