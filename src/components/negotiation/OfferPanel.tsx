/**
 * OfferPanel Component
 * 
 * Container component that manages the offer flow:
 * - Shows OfferBuilder when creating an offer
 * - Shows OfferDisplay when viewing/responding to offer
 * - Shows AgreementBanner when agreement is reached
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, FileText, AlertTriangle } from 'lucide-react';
import { OfferBuilder, type OfferSelection } from './OfferBuilder';
import { OfferDisplay } from './OfferDisplay';
import { AgreementBanner } from './AgreementBanner';
import { SCENARIO_CONFIG, type ScenarioConfig } from '@/config/scenarios';

interface Offer {
  id: string;
  selection: OfferSelection;
  senderRole: string;
  senderParticipantId: string;
  timestamp: Date;
  status: 'pending' | 'accepted' | 'rejected';
}

interface OfferPanelProps {
  /** Current participant's ID */
  participantId: string;
  /** Current participant's role */
  participantRole: string;
  /** Current pending offer (from either party) */
  pendingOffer: Offer | null;
  /** Final agreement (if reached) */
  agreement: OfferSelection | null;
  /** Callback when making an offer */
  onMakeOffer: (selection: OfferSelection) => Promise<void>;
  /** Callback when accepting an offer */
  onAcceptOffer: () => Promise<void>;
  /** Callback when rejecting an offer */
  onRejectOffer: () => Promise<void>;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Whether panel is collapsed by default */
  defaultCollapsed?: boolean;
  /** Optional: scenario config (defaults to SCENARIO_CONFIG) */
  scenario?: ScenarioConfig;
}

export function OfferPanel({
  participantId,
  participantRole,
  pendingOffer,
  agreement,
  onMakeOffer,
  onAcceptOffer,
  onRejectOffer,
  disabled = false,
  defaultCollapsed = false,
  scenario = SCENARIO_CONFIG,
}: OfferPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<OfferSelection | null>(null);
  
  // Auto-expand when there's a pending offer from partner
  useEffect(() => {
    if (pendingOffer && pendingOffer.senderParticipantId !== participantId) {
      setIsCollapsed(false);
    }
  }, [pendingOffer, participantId]);
  
  // Check if the pending offer is from the current user
  const isOwnOffer = pendingOffer?.senderParticipantId === participantId;
  const hasPendingPartnerOffer = pendingOffer && !isOwnOffer;
  
  // Handle offer submission - show confirmation first
  const handleMakeOffer = async (selection: OfferSelection) => {
    setPendingConfirmation(selection);
  };

  // Actually send the offer after confirmation
  const handleConfirmOffer = async () => {
    if (!pendingConfirmation) return;
    setIsSubmitting(true);
    try {
      await onMakeOffer(pendingConfirmation);
      setShowBuilder(false);
      setPendingConfirmation(null);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle accept
  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      await onAcceptOffer();
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle reject
  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onRejectOffer();
      // After rejection, show builder for counter-offer
      setShowBuilder(true);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle counter-offer initiation
  const handleCounter = () => {
    setShowBuilder(true);
  };
  
  // If agreement reached, show banner
  if (agreement) {
    return (
      <AgreementBanner
        agreement={agreement}
        participantRole={participantRole}
        showPoints={true}
        scenario={scenario}
      />
    );
  }
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-600" />
          <span className="font-semibold text-slate-800">Formal Offers</span>
          {hasPendingPartnerOffer && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full animate-pulse">
              Offer Received
            </span>
          )}
          {isOwnOffer && pendingOffer?.status === 'pending' && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              Awaiting Response
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        )}
      </button>
      
      {/* Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
          {/* Pending Offer from Partner - show accept/reject buttons */}
          {hasPendingPartnerOffer && !showBuilder && (
            <div className="space-y-3">
              <div className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                Your partner has made an offer. Review and respond below.
              </div>
              <OfferDisplay
                offer={pendingOffer.selection}
                senderRole={pendingOffer.senderRole}
                timestamp={pendingOffer.timestamp}
                isPending={true}
                onAccept={handleAccept}
                onReject={handleReject}
                onCounter={handleCounter}
                disabled={disabled || isSubmitting}
                scenario={scenario}
              />
            </div>
          )}
          
          {/* Own Pending Offer (waiting for response) */}
          {isOwnOffer && pendingOffer?.status === 'pending' && !showBuilder && (
            <div className="space-y-3">
              <div className="text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                <p className="font-medium">⏳ Your offer is pending.</p>
                <p className="mt-1 text-blue-600">Waiting for your partner to accept or reject. Your offer cannot be withdrawn once sent.</p>
              </div>
              <OfferDisplay
                offer={pendingOffer.selection}
                senderRole={pendingOffer.senderRole}
                timestamp={pendingOffer.timestamp}
                isPending={false}
                compact={true}
                scenario={scenario}
              />
            </div>
          )}
          
          {/* Offer Builder - show when explicitly opened */}
          {showBuilder && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-600">
                  {hasPendingPartnerOffer ? 'Make a counter-offer:' : 'Select options for each issue:'}
                </p>
                <button
                  onClick={() => setShowBuilder(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
              <OfferBuilder
                onSubmit={handleMakeOffer}
                isSubmitting={isSubmitting}
                disabled={disabled}
                initialSelection={hasPendingPartnerOffer ? pendingOffer?.selection : undefined}
                submitLabel={hasPendingPartnerOffer ? scenario.ui.counterOffer : undefined}
                scenario={scenario}
              />
            </div>
          )}
          
          {/* Make Offer Button - shown when no pending offer and builder not open */}
          {!pendingOffer && !showBuilder && (
            <div>
              {/* Issue quick-reference so participants don't need to open the builder to recall what's being negotiated */}
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                {scenario.issues.map((issue) => (
                  <div key={issue.id} className="px-3 py-2">
                    <span className="text-xs font-semibold text-slate-700">{issue.label}</span>
                    {issue.description && (
                      <span className="text-xs text-slate-500"> — {issue.description}</span>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowBuilder(true)}
                disabled={disabled}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {scenario.ui.makeOffer}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Offer Confirmation Modal */}
      {pendingConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md mx-4 p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-800">Confirm Offer</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to send this offer? Once sent, it cannot be withdrawn.
            </p>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1">
              {scenario.issues.map((issue) => {
                const selectedIndex = pendingConfirmation[issue.id];
                const option = selectedIndex !== undefined ? issue.options[selectedIndex] : null;
                return (
                  <div key={issue.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{issue.label}:</span>
                    <span className="font-medium text-slate-800">{option?.label ?? '—'}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingConfirmation(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmOffer}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 text-sm font-medium"
              >
                {isSubmitting ? 'Sending...' : 'Send Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OfferPanel;
