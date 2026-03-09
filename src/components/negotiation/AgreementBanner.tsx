/**
 * AgreementBanner Component
 * 
 * Displays when an agreement has been reached.
 * Shows the final agreement terms and points earned.
 */

import { CheckCircle2, Trophy } from 'lucide-react';
import { SCENARIO_CONFIG, calculatePoints, getRoleKey, type ScenarioConfig } from '@/config/scenarios';
import type { OfferSelection } from './OfferBuilder';

interface AgreementBannerProps {
  /** The agreed-upon terms */
  agreement: OfferSelection;
  /** Current participant's role ('pm' or 'developer') */
  participantRole: string;
  /** Whether to show point calculations */
  showPoints?: boolean;
  /** Optional: scenario config (defaults to SCENARIO_CONFIG) */
  scenario?: ScenarioConfig;
}

export function AgreementBanner({
  agreement,
  participantRole,
  showPoints = true,
  scenario = SCENARIO_CONFIG,
}: AgreementBannerProps) {
  const issues = scenario.issues;
  const roleKey = getRoleKey(participantRole);
  
  // Convert OfferSelection to Record<string, number> for calculation
  // (filter out undefined values)
  const completeAgreement: Record<string, number> = {};
  for (const [key, value] of Object.entries(agreement)) {
    if (value !== undefined) {
      completeAgreement[key] = value;
    }
  }
  
  const points = roleKey ? calculatePoints(completeAgreement, roleKey, scenario) : 0;
  
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-green-100 flex items-center gap-3">
        <div className="p-2 bg-green-600 rounded-full">
          <CheckCircle2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-green-800">
            {scenario.ui.negotiationComplete}
          </h3>
          <p className="text-sm text-green-700">
            You have reached an agreement with your partner!
          </p>
        </div>
      </div>
      
      {/* Agreement Details */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-green-800 mb-2">
          Final Agreement
        </h4>
        
        <div className="bg-white rounded-lg border border-green-200 p-3 space-y-2">
          {issues.map((issue) => {
            const selectedIndex = agreement[issue.id];
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
        
        {/* Points Display */}
        {showPoints && roleKey && (
          <div className="mt-4 flex items-center justify-center gap-3 p-3 bg-green-100 rounded-lg">
            <Trophy className="w-5 h-5 text-green-600" />
            <div className="text-center">
              <p className="text-sm text-green-700">Your Points</p>
              <p className="text-2xl font-bold text-green-800">{points}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgreementBanner;
