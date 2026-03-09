/**
 * ScenarioInfo Component
 * 
 * Displays negotiation scenario details with role-specific confidential information.
 * 
 * IMPORTANT: All scenario content is pulled from the centralized config in
 * src/config/scenarios.ts - do NOT hardcode scenario text here.
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Target, Users, Info } from 'lucide-react'
import { 
  SCENARIO_CONFIG, 
  getRoleKey, 
  getBriefingForRole,
  type RoleConfig,
  type RoleBriefing,
  type ScenarioConfig,
} from '@/config/scenarios'
import type { ParticipantRole } from '@/types/database.types'

// ============================================
// Types
// ============================================

interface ScenarioInfoProps {
  scenario?: ScenarioConfig
  role: ParticipantRole
  isExpanded?: boolean
}

// ============================================
// Component
// ============================================

/**
 * ScenarioInfo Component
 * 
 * Displays negotiation scenario details with role-specific confidential information.
 * Features:
 * - Expandable/collapsible sections
 * - Role-specific information display
 * - Confidential info toggle
 * - Pulls all content from centralized scenarios.ts config
 */
export function ScenarioInfo({ 
  scenario = SCENARIO_CONFIG,
  role,
  isExpanded: initialExpanded = true 
}: ScenarioInfoProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [showConfidential, setShowConfidential] = useState(true)

  // Get role configuration from the provided scenario
  const roleKey = getRoleKey(role)
  const roleConfig: RoleConfig | undefined = roleKey 
    ? scenario.roles[roleKey] 
    : undefined
  const briefing: RoleBriefing | undefined = getBriefingForRole(role, scenario)
  
  // Determine role color
  const roleColor = roleConfig?.color || 'blue'
  const colorClasses = {
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-600',
      textDark: 'text-blue-700',
      border: 'border-blue-300',
      bgLight: 'bg-blue-50',
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-600',
      textDark: 'text-green-700',
      border: 'border-green-300',
      bgLight: 'bg-green-50',
    },
    purple: {
      bg: 'bg-purple-100',
      text: 'text-purple-600',
      textDark: 'text-purple-700',
      border: 'border-purple-300',
      bgLight: 'bg-purple-50',
    },
    orange: {
      bg: 'bg-orange-100',
      text: 'text-orange-600',
      textDark: 'text-orange-700',
      border: 'border-orange-300',
      bgLight: 'bg-orange-50',
    },
    red: {
      bg: 'bg-red-100',
      text: 'text-red-600',
      textDark: 'text-red-700',
      border: 'border-red-300',
      bgLight: 'bg-red-50',
    },
    teal: {
      bg: 'bg-teal-100',
      text: 'text-teal-600',
      textDark: 'text-teal-700',
      border: 'border-teal-300',
      bgLight: 'bg-teal-50',
    },
  }
  
  const colors = colorClasses[roleColor] || colorClasses.blue

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Target className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div className="text-left">
            <h2 className="font-semibold text-neutral-900">
              {scenario.shared.title}
            </h2>
            <p className="text-sm text-neutral-600">
              Your role: <span className={`font-medium ${colors.text}`}>
                {roleConfig?.label || role}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && (
            <span className="text-xs text-neutral-400">View role info</span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-neutral-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-neutral-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-neutral-200 p-4 space-y-4">
          {/* Shared Context */}
          <div className="bg-neutral-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-1">
              <Users className="w-4 h-4" />
              Shared Context
            </div>
            <p className="text-sm text-neutral-600">
              {scenario.shared.context}
            </p>
          </div>

          {/* Goal */}
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-1">Your Goal</h3>
            <p className="text-sm text-neutral-600">
              {scenario.shared.goal}
            </p>
          </div>

          {/* Role-Specific Overview */}
          {briefing && (
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-1">Your Situation</h3>
              <p className="text-sm text-neutral-600">
                {briefing.overview}
              </p>
            </div>
          )}

          {/* Your Priorities */}
          {briefing && briefing.priorities.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-1">Your Priorities</h3>
              <ul className="text-sm text-neutral-600 space-y-1">
                {briefing.priorities.map((priority, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-neutral-400">{idx + 1}.</span>
                    {priority}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Negotiation Issues Summary */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
              <Info className="w-4 h-4" />
              Issues to Negotiate
            </div>
            <ul className="text-sm text-neutral-600 space-y-1">
              {scenario.issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2">
                  <span className="text-neutral-400">•</span>
                  <span>
                    <strong>{issue.label}</strong>
                    {issue.description && `: ${issue.description}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Confidential Information */}
          {briefing && (
            <div className={`rounded-lg p-3 border-2 border-dashed ${colors.border} ${colors.bgLight}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-sm font-semibold ${colors.textDark}`}>
                  🔒 Confidential Information
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowConfidential(!showConfidential)
                  }}
                  className="text-xs flex items-center gap-1 text-neutral-500 hover:text-neutral-700"
                >
                  {showConfidential ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showConfidential ? 'Hide' : 'Show'}
                </button>
              </div>
              {showConfidential ? (
                <pre className={`text-sm ${colors.textDark} whitespace-pre-wrap font-sans`}>
                  {briefing.confidential}
                </pre>
              ) : (
                <p className="text-sm text-neutral-400 italic">Hidden - click Show to reveal</p>
              )}
              <p className="text-xs text-neutral-500 mt-2">
                ⚠️ Do not share this information with your negotiation partner
              </p>
            </div>
          )}

          {/* Tips */}
          {briefing?.tips && briefing.tips.length > 0 && (
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <h3 className="text-sm font-medium text-amber-800 mb-1">💡 Tips</h3>
              <ul className="text-sm text-amber-700 space-y-1">
                {briefing.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScenarioInfo
