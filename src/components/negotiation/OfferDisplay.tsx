/**
 * OfferDisplay Component
 * 
 * Displays an offer received from the partner with options to accept/reject.
 * Uses the scenario config for issue definitions and formatting.
 */

import { Check, X, MessageSquare } from 'lucide-react';
import { SCENARIO_CONFIG, getRoleByDatabaseId, type ScenarioConfig } from '@/config/scenarios';
import type { OfferSelection } from './OfferBuilder';

interface OfferDisplayProps {
  /** The offer to display (issue ID -> option index) */
  offer: OfferSelection;
  /** Role of the sender ('pm' or 'developer') */
  senderRole: string;
  /** Timestamp of the offer */
  timestamp?: Date;
  /** Whether this is the current pending offer (show action buttons) */
  isPending?: boolean;
  /** Callback when offer is accepted */
  onAccept?: () => void;
  /** Callback when offer is rejected */
  onReject?: () => void;
  /** Callback to make a counter-offer */
  onCounter?: () => void;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Optional: compact mode (less padding) */
  compact?: boolean;
  /** Optional: scenario config (defaults to SCENARIO_CONFIG) */
  scenario?: ScenarioConfig;
}

export function OfferDisplay({
  offer,
  senderRole,
  timestamp,
  isPending = false,
  onAccept,
  onReject,
  onCounter,
  disabled = false,
  compact = false,
  scenario = SCENARIO_CONFIG,
}: OfferDisplayProps) {
  const issues = scenario.issues;
  const role = getRoleByDatabaseId(senderRole, scenario);
  const roleName = role?.label ?? senderRole;
  const roleColor = role?.color ?? 'blue';
  
  // Get color classes based on role
  const getColorClasses = () => {
    switch (roleColor) {
      case 'blue':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          header: 'bg-blue-100',
          badge: 'bg-blue-600 text-white',
        };
      case 'green':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          header: 'bg-green-100',
          badge: 'bg-green-600 text-white',
        };
      default:
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          header: 'bg-slate-100',
          badge: 'bg-slate-600 text-white',
        };
    }
  };
  
  const colors = getColorClasses();
  
  return (
    <div 
      className={`
        rounded-lg border overflow-hidden
        ${colors.bg} ${colors.border}
      `}
    >
      {/* Header */}
      <div className={`px-3 py-2 ${colors.header} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
            {roleName}
          </span>
          <span className="text-sm font-medium text-slate-800">
            {isPending ? 'Proposed Offer' : 'Offer'}
          </span>
        </div>
        {timestamp && (
          <span className="text-xs text-slate-500">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      
      {/* Offer Details */}
      <div className={compact ? 'p-2' : 'p-3'}>
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          {issues.map((issue) => {
            const selectedIndex = offer[issue.id];
            const option = selectedIndex !== undefined 
              ? issue.options[selectedIndex] 
              : null;
            
            return (
              <div 
                key={issue.id} 
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-600">{issue.label}:</span>
                <span className="font-medium text-slate-800">
                  {option?.label ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Action Buttons (only for pending offers) */}
      {isPending && (onAccept || onReject || onCounter) && (
        <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center gap-2">
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              disabled={disabled}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                px-3 py-2 rounded-lg text-sm font-medium
                transition-colors
                ${disabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }
              `}
            >
              <Check className="w-4 h-4" />
              {scenario.ui.acceptOffer}
            </button>
          )}
          
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={disabled}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                px-3 py-2 rounded-lg text-sm font-medium
                transition-colors
                ${disabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }
              `}
            >
              <X className="w-4 h-4" />
              {scenario.ui.rejectOffer}
            </button>
          )}
          
          {onCounter && (
            <button
              type="button"
              onClick={onCounter}
              disabled={disabled}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                px-3 py-2 rounded-lg text-sm font-medium
                transition-colors
                ${disabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }
              `}
            >
              <MessageSquare className="w-4 h-4" />
              {scenario.ui.counterOffer}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OfferDisplay;
