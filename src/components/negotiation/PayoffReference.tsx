/**
 * PayoffReference Component
 * 
 * Compact, always-visible quick reference card showing point values
 * for the current participant's role during negotiation.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import { SCENARIO_CONFIG, getRoleKey, getRoleByDatabaseId, type ScenarioConfig } from '@/config/scenarios';
import type { ParticipantRole } from '@/types/database.types';
import type { TreatmentCondition } from '@/types/database.types';

interface PayoffReferenceProps {
  role: ParticipantRole;
  defaultExpanded?: boolean;
  scenario?: ScenarioConfig;
  /** A/B treatment: when payoff_always_visible, table is always shown and not collapsible */
  treatmentCondition?: TreatmentCondition | null;
}

export function PayoffReference({
  role,
  defaultExpanded = true,
  scenario = SCENARIO_CONFIG,
  treatmentCondition = null,
}: PayoffReferenceProps) {
  const alwaysVisible = treatmentCondition === 'payoff_always_visible';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const effectiveExpanded = alwaysVisible ? true : isExpanded;
  const roleKey = getRoleKey(role);
  const roleConfig = getRoleByDatabaseId(role, scenario);

  const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; header: string }> = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   header: 'bg-blue-100' },
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  header: 'bg-green-100' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', header: 'bg-purple-100' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', header: 'bg-orange-100' },
    teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   header: 'bg-teal-100' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    header: 'bg-red-100' },
  };
  const colors = COLOR_CLASSES[roleConfig?.color ?? 'blue'];
  
  // Calculate max points
  const maxPoints = roleKey 
    ? scenario.issues.reduce((sum, issue) => {
        return sum + Math.max(...issue.payoffs[roleKey]);
      }, 0)
    : 0;
  
  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Header - clickable only when collapsible */}
      {alwaysVisible ? (
        <div className={`w-full flex items-center justify-between px-3 py-2 ${colors.header}`}>
          <div className="flex items-center gap-2">
            <Target className={`w-4 h-4 ${colors.text}`} />
            <span className={`text-sm font-semibold ${colors.text}`}>
              Your Points
            </span>
          </div>
          <span className={`text-xs font-medium ${colors.text}`}>
            Max: {maxPoints}
          </span>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full flex items-center justify-between px-3 py-2 ${colors.header} hover:opacity-90`}
        >
          <div className="flex items-center gap-2">
            <Target className={`w-4 h-4 ${colors.text}`} />
            <span className={`text-sm font-semibold ${colors.text}`}>
              Your Points
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${colors.text}`}>
              Max: {maxPoints}
            </span>
            {effectiveExpanded ? (
              <ChevronUp className={`w-4 h-4 ${colors.text}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${colors.text}`} />
            )}
          </div>
        </button>
      )}
      
      {/* Content - always visible when treatment is always_visible, else collapsible */}
      {effectiveExpanded && (
        <div className="px-2 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr className={`border-b ${colors.border}`}>
                <th className="text-left py-1 px-1 font-medium text-slate-600">Issue</th>
                {scenario.issues[0]?.options.map((_, idx) => (
                  <th key={idx} className="text-center py-1 px-1 font-medium text-slate-600 w-12">
                    Opt {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenario.issues.map((issue) => {
                const payoffs = roleKey ? issue.payoffs[roleKey] : [];
                const maxPayoff = Math.max(...payoffs);
                
                return (
                  <tr key={issue.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 px-1 font-medium text-slate-700" title={issue.label}>
                      <span className="text-slate-400 mr-1">{issue.id}.</span>{issue.label}
                    </td>
                    {issue.options.map((option, idx) => {
                      const points = payoffs[idx] ?? 0;
                      const isBest = points === maxPayoff && maxPayoff > 0;
                      
                      return (
                        <td key={option.value} className="text-center py-1 px-1">
                          <span className={`
                            font-mono text-xs
                            ${isBest ? `font-bold ${colors.text}` : 'text-slate-600'}
                          `}>
                            {points}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {/* Legend */}
          <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>🔒 Don't share</span>
            <span className={`font-medium ${colors.text}`}>Best options highlighted</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PayoffReference;
