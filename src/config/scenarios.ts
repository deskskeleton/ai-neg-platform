/**
 * Centralized Scenario Configuration
 * 
 * CANONICAL PAYOFF STRUCTURE (shared across all scenarios):
 * - 4 issues, 3 options each
 * - Mixed distributive + integrative structure
 * - Max individual ≠ max joint (requires trade-offs for Pareto efficiency)
 * 
 * Each scenario only changes labels/narrative, not the underlying payoffs.
 * Round payoff keys (v1.a, v1.b, v1.c) are built from config/payoffs.ts.
 */

import { getRoundPayoffTable } from './payoffs'
import { getRoundLabel } from '@/utils/roundLabels'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface RoleConfig {
  id: string;
  label: string;
  shortLabel: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal';
}

export interface IssueOption {
  value: string;
  label: string;
}

export interface NegotiationIssue {
  id: string;
  label: string;
  description?: string;
  options: IssueOption[];
  payoffs: {
    roleA: number[];
    roleB: number[];
  };
}

export interface RoleBriefing {
  title: string;
  overview: string;
  priorities: string[];
  confidential: string;
  tips?: string[];
}

export interface ScenarioConfig {
  id: string;
  version: string;
  roles: {
    roleA: RoleConfig;
    roleB: RoleConfig;
  };
  issues: NegotiationIssue[];
  briefings: {
    roleA: RoleBriefing;
    roleB: RoleBriefing;
  };
  shared: {
    title: string;
    context: string;
    goal: string;
    timeLimit: number;
    maxAssistantQueries: number;
  };
  ui: {
    makeOffer: string;
    acceptOffer: string;
    rejectOffer: string;
    counterOffer: string;
    noAgreement: string;
    waitingForPartner: string;
    negotiationComplete: string;
    timeUp: string;
  };
}

// =============================================================================
// CANONICAL PAYOFF STRUCTURE
// Identical across all scenarios - only labels change
// =============================================================================

const CANONICAL_PAYOFFS = {
  // Issue 1: Integrative - Role A high priority (A prefers Opt1, B prefers Opt3)
  I1: {
    roleA: [60, 40, 20],  // A max=60
    roleB: [10, 30, 50],  // B max=50
  },
  // Issue 2: Integrative - Balanced stakes (A prefers Opt1, B prefers Opt3)
  I2: {
    roleA: [50, 30, 10],  // A max=50
    roleB: [20, 40, 50],  // B max=50 (symmetric stakes)
  },
  // Issue 3: Integrative - Role B high priority (A prefers Opt3, B prefers Opt1)
  I3: {
    roleA: [10, 30, 50],  // A max=50
    roleB: [60, 40, 20],  // B max=60
  },
  // Issue 4: Distributive - Symmetric (both prefer Opt1)
  I4: {
    roleA: [40, 30, 20],  // A max=40
    roleB: [40, 30, 20],  // B max=40
  },
};

// SYMMETRIC PAYOFF STRUCTURE:
// - Role A max: 60 + 50 + 50 + 40 = 200
// - Role B max: 50 + 50 + 60 + 40 = 200
// - Each role has ONE dominant issue (60 pts) and equal stakes elsewhere
// - Joint max per issue: I1=70, I2=70, I3=70, I4=80 → Total=290
// - Pareto-efficient outcomes require cross-issue trade-offs

// =============================================================================
// SHARED UI TEXT
// =============================================================================

const SHARED_UI = {
  makeOffer: 'Make Offer',
  acceptOffer: 'Accept Offer',
  rejectOffer: 'Reject',
  counterOffer: 'Make Counter-Offer',
  noAgreement: 'End Without Agreement',
  waitingForPartner: 'Waiting for your negotiation partner...',
  negotiationComplete: 'Negotiation Complete',
  timeUp: 'Time is up! Please finalize your negotiation.',
};

// =============================================================================
// SCENARIO 1: Group Project Contract (Academic)
// =============================================================================

const GROUP_PROJECT_SCENARIO: ScenarioConfig = {
  id: 'group-project',
  version: '1.0.0',
  
  roles: {
    roleA: {
      id: 'coordinator',
      label: 'Project Coordinator',
      shortLabel: 'Coord',
      color: 'blue',
    },
    roleB: {
      id: 'specialist',
      label: 'Technical Specialist',
      shortLabel: 'Spec',
      color: 'green',
    },
  },

  issues: [
    {
      id: 'I1',
      label: 'Deadline Strictness',
      description: 'How strictly the project deadline should be enforced',
      options: [
        { value: 'A', label: '1. Flexible deadline' },
        { value: 'B', label: '2. Standard deadline' },
        { value: 'C', label: '3. Strict deadline' },
      ],
      payoffs: CANONICAL_PAYOFFS.I1,
    },
    {
      id: 'I2',
      label: 'Division of Written Work',
      description: 'How the written portions of the project are divided',
      options: [
        { value: 'A', label: '1. Coordinator writes most' },
        { value: 'B', label: '2. Even split' },
        { value: 'C', label: '3. Specialist writes most' },
      ],
      payoffs: CANONICAL_PAYOFFS.I2,
    },
    {
      id: 'I3',
      label: 'Presentation Responsibility',
      description: 'Who takes the lead on presenting the project',
      options: [
        { value: 'A', label: '1. Specialist presents' },
        { value: 'B', label: '2. Shared presentation' },
        { value: 'C', label: '3. Coordinator presents' },
      ],
      payoffs: CANONICAL_PAYOFFS.I3,
    },
    {
      id: 'I4',
      label: 'Grading Scheme Weight',
      description: 'Balance between group and individual assessment',
      options: [
        { value: 'A', label: '1. Group-heavy grading' },
        { value: 'B', label: '2. Balanced grading' },
        { value: 'C', label: '3. Individual-heavy grading' },
      ],
      payoffs: CANONICAL_PAYOFFS.I4,
    },
  ],

  briefings: {
    roleA: {
      title: 'Your Role: Project Coordinator',
      overview: `You are the Project Coordinator for a mandatory group project. 
        You are responsible for keeping the project on track and ensuring all 
        deliverables are submitted on time. You need to negotiate the project 
        terms with your Technical Specialist partner.`,
      priorities: [
        'Maintain flexibility on deadlines to accommodate unexpected changes',
        'Prefer to handle more of the written work yourself',
        'Would rather have your partner handle the presentation',
        'Prefer group-heavy grading since you excel at coordination',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Deadline Strictness: Flexible = 60pts, Standard = 40pts, Strict = 20pts
        • Division of Written Work: You write most = 50pts, Even = 30pts, They write most = 10pts
        • Presentation: Specialist presents = 10pts, Shared = 30pts, You present = 50pts
        • Grading Scheme: Group-heavy = 40pts, Balanced = 30pts, Individual-heavy = 20pts
        
        Maximum possible: 200 points`,
    },
    roleB: {
      title: 'Your Role: Technical Specialist',
      overview: `You are the Technical Specialist for a mandatory group project. 
        You bring deep technical expertise and want to ensure the project meets 
        high quality standards. You need to negotiate the project terms with 
        your Project Coordinator partner.`,
      priorities: [
        'Prefer strict deadlines to ensure focused work',
        'Would rather focus on technical work than writing',
        'Prefer to present since you understand the technical details',
        'Prefer group-heavy grading for shared accountability',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Deadline Strictness: Flexible = 10pts, Standard = 30pts, Strict = 50pts
        • Division of Written Work: Coord writes most = 20pts, Even = 40pts, You write most = 60pts
        • Presentation: You present = 60pts, Shared = 40pts, Coord presents = 20pts
        • Grading Scheme: Group-heavy = 40pts, Balanced = 30pts, Individual-heavy = 20pts
        
        Maximum possible: 200 points`,
    },
  },

  shared: {
    title: 'Group Project Contract',
    context: `Two students are negotiating the terms of a mandatory group project. 
      Both want the project to succeed but have different working styles and 
      preferences for how to divide responsibilities.`,
    goal: `Reach an agreement on ALL four issues within the time limit. 
      You earn points based on the final agreement. Try to maximize your points 
      while reaching a mutually acceptable deal.`,
    timeLimit: 45,
    maxAssistantQueries: 100,
  },

  ui: SHARED_UI,
};

// =============================================================================
// SCENARIO 2: Student Housing Agreement (Life Admin)
// =============================================================================

const STUDENT_HOUSING_SCENARIO: ScenarioConfig = {
  id: 'student-housing',
  version: '1.0.0',
  
  roles: {
    roleA: {
      id: 'contractholder',
      label: 'Contract Holder',
      shortLabel: 'Contract',
      color: 'purple',
    },
    roleB: {
      id: 'tenant',
      label: 'Incoming Tenant',
      shortLabel: 'Tenant',
      color: 'orange',
    },
  },

  issues: [
    {
      id: 'I1',
      label: 'Rent Contribution',
      description: 'How the monthly rent is split between roommates',
      options: [
        { value: 'A', label: '1. Tenant pays less' },
        { value: 'B', label: '2. Even split' },
        { value: 'C', label: '3. Tenant pays more' },
      ],
      payoffs: CANONICAL_PAYOFFS.I1,
    },
    {
      id: 'I2',
      label: 'Length of Stay Commitment',
      description: 'Minimum period the tenant commits to staying',
      options: [
        { value: 'A', label: '1. Short-term (3 months)' },
        { value: 'B', label: '2. Medium-term (6 months)' },
        { value: 'C', label: '3. Long-term (12 months)' },
      ],
      payoffs: CANONICAL_PAYOFFS.I2,
    },
    {
      id: 'I3',
      label: 'Furnishing Responsibility',
      description: 'Who provides furniture for common areas',
      options: [
        { value: 'A', label: '1. Tenant furnishes' },
        { value: 'B', label: '2. Shared responsibility' },
        { value: 'C', label: '3. Contract holder furnishes' },
      ],
      payoffs: CANONICAL_PAYOFFS.I3,
    },
    {
      id: 'I4',
      label: 'Utility Cost Split',
      description: 'How utility bills are divided',
      options: [
        { value: 'A', label: '1. Fixed monthly amount' },
        { value: 'B', label: '2. Usage-based split' },
        { value: 'C', label: '3. Equal percentage split' },
      ],
      payoffs: CANONICAL_PAYOFFS.I4,
    },
  ],

  briefings: {
    roleA: {
      title: 'Your Role: Contract Holder',
      overview: `You are the current contract holder looking for a roommate to share
        your apartment. You've been living here for a year and have the primary
        relationship with the landlord. You need to negotiate terms with a
        potential new tenant.`,
      priorities: [
        'Prefer the new tenant pays a larger share of rent',
        'Want flexibility in case you need to find a new roommate',
        'Would like the new tenant to contribute furniture',
        'Prefer predictable fixed utility costs',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Rent Contribution: Tenant pays less = 60pts, Even = 40pts, Tenant pays more = 20pts
        • Length of Stay: Short-term = 50pts, Medium-term = 30pts, Long-term = 10pts
        • Furnishing: Tenant furnishes = 10pts, Shared = 30pts, You furnish = 50pts
        • Utility Split: Fixed = 40pts, Usage-based = 30pts, Equal = 20pts
        
        Maximum possible: 200 points`,
    },
    roleB: {
      title: 'Your Role: Incoming Tenant',
      overview: `You are looking for a room in a shared apartment. You've found 
        a place you like but need to negotiate the terms with the current lease 
        holder before moving in.`,
      priorities: [
        'Prefer to pay less rent since you get the smaller room',
        'Want a longer commitment for housing stability',
        'Would prefer not to have to buy new furniture',
        'Prefer predictable fixed utility costs',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Rent Contribution: You pay less = 10pts, Even = 30pts, You pay more = 50pts
        • Length of Stay: Short-term = 20pts, Medium-term = 40pts, Long-term = 60pts
        • Furnishing: You furnish = 60pts, Shared = 40pts, Contract holder furnishes = 20pts
        • Utility Split: Fixed = 40pts, Usage-based = 30pts, Equal = 20pts
        
        Maximum possible: 200 points`,
    },
  },

  shared: {
    title: 'Student Housing Agreement',
    context: `Two students are negotiating terms for a shared apartment. 
      The contract holder has an available room and the incoming tenant is looking 
      for housing. Both want a fair arrangement but have different preferences.`,
    goal: `Reach an agreement on ALL four issues within the time limit. 
      You earn points based on the final agreement. Try to maximize your points 
      while reaching a mutually acceptable deal.`,
    timeLimit: 45,
    maxAssistantQueries: 100,
  },

  ui: SHARED_UI,
};

// =============================================================================
// SCENARIO 3: Student Organization Budget Allocation (Committee)
// =============================================================================

const BUDGET_ALLOCATION_SCENARIO: ScenarioConfig = {
  id: 'budget-allocation',
  version: '1.0.0',
  
  roles: {
    roleA: {
      id: 'events',
      label: 'Events Lead',
      shortLabel: 'Events',
      color: 'teal',
    },
    roleB: {
      id: 'comms',
      label: 'Communications Lead',
      shortLabel: 'Comms',
      color: 'red',
    },
  },

  issues: [
    {
      id: 'I1',
      label: 'Budget Allocation',
      description: 'How the limited funds are divided between teams',
      options: [
        { value: 'A', label: '1. Events-heavy (60/40)' },
        { value: 'B', label: '2. Balanced (50/50)' },
        { value: 'C', label: '3. Comms-heavy (40/60)' },
      ],
      payoffs: CANONICAL_PAYOFFS.I1,
    },
    {
      id: 'I2',
      label: 'Volunteer Time Allocation',
      description: 'Which activities volunteers prioritize',
      options: [
        { value: 'A', label: '1. Events priority' },
        { value: 'B', label: '2. Shared equally' },
        { value: 'C', label: '3. Comms priority' },
      ],
      payoffs: CANONICAL_PAYOFFS.I2,
    },
    {
      id: 'I3',
      label: 'Visibility & Credit',
      description: 'Who gets recognition for organization success',
      options: [
        { value: 'A', label: '1. Comms lead highlighted' },
        { value: 'B', label: '2. Joint credit' },
        { value: 'C', label: '3. Events lead highlighted' },
      ],
      payoffs: CANONICAL_PAYOFFS.I3,
    },
    {
      id: 'I4',
      label: 'Decision Autonomy',
      description: 'How decisions are made within each team',
      options: [
        { value: 'A', label: '1. Joint decisions required' },
        { value: 'B', label: '2. Mixed (major decisions joint)' },
        { value: 'C', label: '3. Independent decisions' },
      ],
      payoffs: CANONICAL_PAYOFFS.I4,
    },
  ],

  briefings: {
    roleA: {
      title: 'Your Role: Events Lead',
      overview: `You lead the Events team for a student organization. Your team 
        organizes workshops, social events, and the annual conference. You need 
        to negotiate resource allocation with the Communications Lead.`,
      priorities: [
        'Secure more budget for event costs (venues, catering, speakers)',
        'Get volunteer time priority for event setup and management',
        'Recognition matters less to you than having resources',
        'Prefer joint decisions for accountability',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Budget Allocation: Events-heavy = 60pts, Balanced = 40pts, Comms-heavy = 20pts
        • Volunteer Time: Events priority = 50pts, Shared = 30pts, Comms priority = 10pts
        • Visibility & Credit: Comms lead = 10pts, Joint = 30pts, Events lead = 50pts
        • Decision Autonomy: Joint = 40pts, Mixed = 30pts, Independent = 20pts
        
        Maximum possible: 200 points`,
    },
    roleB: {
      title: 'Your Role: Communications Lead',
      overview: `You lead the Communications team for a student organization. 
        Your team handles social media, marketing, newsletters, and branding. 
        You need to negotiate resource allocation with the Events Lead.`,
      priorities: [
        'Secure budget for design tools, ads, and promotional materials',
        'Get volunteer time for content creation and social media',
        'Visibility and recognition are important for your portfolio',
        'Prefer joint decisions for accountability',
      ],
      confidential: `Your point values (DO NOT SHARE):
        • Budget Allocation: Events-heavy = 10pts, Balanced = 30pts, Comms-heavy = 50pts
        • Volunteer Time: Events priority = 20pts, Shared = 40pts, Comms priority = 60pts
        • Visibility & Credit: Comms lead = 60pts, Joint = 40pts, Events lead = 20pts
        • Decision Autonomy: Joint = 40pts, Mixed = 30pts, Independent = 20pts
        
        Maximum possible: 200 points`,
    },
  },

  shared: {
    title: 'Student Organization Budget',
    context: `Two committee members from a student organization are negotiating 
      how to allocate limited funds and volunteer effort between their teams. 
      Both want the organization to succeed but have different team needs.`,
    goal: `Reach an agreement on ALL four issues within the time limit. 
      You earn points based on the final agreement. Try to maximize your points 
      while reaching a mutually acceptable deal.`,
    timeLimit: 45,
    maxAssistantQueries: 100,
  },

  ui: SHARED_UI,
};

// =============================================================================
// ROUND THEMES (v1.a, v1.b, v1.c) – different role names and roleplay contexts
// Each round uses one theme; payoffs come from payoffs.ts (ROUND_PAYOFF_TABLES).
// =============================================================================

const GENERIC_ROUND_CONFIDENTIAL = `Your point values (DO NOT SHARE): See the payoff table in the negotiation screen for your role's values. Maximum possible: 200 points.`;

function roundBriefing(roleBriefing: RoleBriefing): RoleBriefing {
  return { ...roleBriefing, confidential: GENERIC_ROUND_CONFIDENTIAL };
}

const ROUND_THEMES: Record<string, { roles: ScenarioConfig['roles']; briefings: ScenarioConfig['briefings']; shared: ScenarioConfig['shared'] }> = {
  'v1.a': {
    roles: GROUP_PROJECT_SCENARIO.roles,
    briefings: {
      roleA: roundBriefing(GROUP_PROJECT_SCENARIO.briefings.roleA),
      roleB: roundBriefing(GROUP_PROJECT_SCENARIO.briefings.roleB),
    },
    shared: GROUP_PROJECT_SCENARIO.shared,
  },
  'v1.b': {
    roles: STUDENT_HOUSING_SCENARIO.roles,
    briefings: {
      roleA: roundBriefing(STUDENT_HOUSING_SCENARIO.briefings.roleA),
      roleB: roundBriefing(STUDENT_HOUSING_SCENARIO.briefings.roleB),
    },
    shared: STUDENT_HOUSING_SCENARIO.shared,
  },
  'v1.c': {
    roles: BUDGET_ALLOCATION_SCENARIO.roles,
    briefings: {
      roleA: roundBriefing(BUDGET_ALLOCATION_SCENARIO.briefings.roleA),
      roleB: roundBriefing(BUDGET_ALLOCATION_SCENARIO.briefings.roleB),
    },
    shared: BUDGET_ALLOCATION_SCENARIO.shared,
  },
};

// =============================================================================
// SCENARIO REGISTRY
// =============================================================================

/**
 * Registry of all available scenarios
 */
export const SCENARIOS: Record<string, ScenarioConfig> = {
  'group-project': GROUP_PROJECT_SCENARIO,
  'student-housing': STUDENT_HOUSING_SCENARIO,
  'budget-allocation': BUDGET_ALLOCATION_SCENARIO,
};

/**
 * List of scenarios for dropdown menus
 */
export const SCENARIO_LIST = Object.values(SCENARIOS).map(s => ({
  id: s.id,
  name: s.shared.title,
  description: s.shared.context.slice(0, 100) + '...',
}));

/**
 * Default scenario (first in list)
 */
export const SCENARIO_CONFIG = GROUP_PROJECT_SCENARIO;

/**
 * Get scenario config by ID
 * Returns default scenario if not found.
 * For round payoff keys (v1.a, v1.b, v1.c) returns a scenario built from payoffs config.
 */
export function getScenarioById(scenarioId: string | null | undefined): ScenarioConfig {
  if (scenarioId && SCENARIOS[scenarioId]) {
    return SCENARIOS[scenarioId];
  }
  // Round payoff tables (v1.a, v1.b, v1.c) - build scenario from payoffs config
  const roundScenario = getScenarioForRoundPayoff(scenarioId);
  if (roundScenario) return roundScenario;
  return SCENARIO_CONFIG;
}

/**
 * Build a full scenario config from a round payoff key (v1.a, v1.b, v1.c).
 * Uses generic issue/option labels; payoffs come from ROUND_PAYOFF_TABLES.
 */
export function getScenarioForRoundPayoff(
  scenarioKey: string | null | undefined
): ScenarioConfig | null {
  const table = getRoundPayoffTable(scenarioKey);
  if (!table) return null;

  // Look up the themed scenario for this round to get proper issue/option labels
  const themeScenarioId = scenarioKey === 'v1.a' ? 'group-project'
    : scenarioKey === 'v1.b' ? 'student-housing'
    : scenarioKey === 'v1.c' ? 'budget-allocation'
    : null;
  const themeScenario = themeScenarioId ? SCENARIOS[themeScenarioId] : null;

  const issues: NegotiationIssue[] = table.A.map((roleAPoints, idx) => ({
    id: `I${idx + 1}`,
    // Use themed issue labels/descriptions/options when available
    label: themeScenario?.issues[idx]?.label ?? `Issue ${idx + 1}`,
    description: themeScenario?.issues[idx]?.description,
    options: themeScenario?.issues[idx]?.options ?? [
      { value: 'A', label: 'Option 1' },
      { value: 'B', label: 'Option 2' },
      { value: 'C', label: 'Option 3' },
    ],
    payoffs: {
      roleA: roleAPoints,
      roleB: table.B[idx],
    },
  }));

  const theme = ROUND_THEMES[scenarioKey!];
  if (!theme) return null;

  const roundLabel = getRoundLabel(scenarioKey) || scenarioKey;
  const sharedTitle = `${roundLabel}: ${theme.shared.title}`;
  const briefingPrefix = `This round (${roundLabel}) has its own payoff structure. Maximize your points using the payoff table.\n\n`;
  const briefings = {
    roleA: {
      ...theme.briefings.roleA,
      title: `${roundLabel} – ${theme.briefings.roleA.title}`,
      overview: briefingPrefix + theme.briefings.roleA.overview,
    },
    roleB: {
      ...theme.briefings.roleB,
      title: `${roundLabel} – ${theme.briefings.roleB.title}`,
      overview: briefingPrefix + theme.briefings.roleB.overview,
    },
  };

  return {
    id: scenarioKey!,
    version: '1.0',
    roles: theme.roles,
    issues,
    briefings,
    shared: {
      ...theme.shared,
      title: sharedTitle,
    },
    ui: SHARED_UI,
  };
}

// =============================================================================
// HELPER FUNCTIONS (work with any scenario)
// =============================================================================

/**
 * Get role config by database role id
 */
export function getRoleByDatabaseId(
  dbRoleId: string, 
  scenario: ScenarioConfig = SCENARIO_CONFIG
): RoleConfig | undefined {
  // Check scenario-specific role IDs first
  if (scenario.roles.roleA.id === dbRoleId) {
    return scenario.roles.roleA;
  }
  if (scenario.roles.roleB.id === dbRoleId) {
    return scenario.roles.roleB;
  }
  
  // Fallback: handle legacy database values ('pm' = roleA, 'developer' = roleB)
  if (dbRoleId === 'pm') {
    return scenario.roles.roleA;
  }
  if (dbRoleId === 'developer') {
    return scenario.roles.roleB;
  }
  
  return undefined;
}

/**
 * Get role key ('roleA' or 'roleB') by database role id
 */
export function getRoleKey(
  dbRoleId: string,
  scenario: ScenarioConfig = SCENARIO_CONFIG
): 'roleA' | 'roleB' | undefined {
  // Check scenario-specific role IDs first
  if (scenario.roles.roleA.id === dbRoleId) {
    return 'roleA';
  }
  if (scenario.roles.roleB.id === dbRoleId) {
    return 'roleB';
  }
  
  // Fallback: handle legacy database values ('pm' = roleA, 'developer' = roleB)
  // The database stores 'pm' or 'developer' but scenarios may use different IDs
  if (dbRoleId === 'pm') {
    return 'roleA';
  }
  if (dbRoleId === 'developer') {
    return 'roleB';
  }
  
  return undefined;
}

/**
 * Get briefing for a database role id
 */
export function getBriefingForRole(
  dbRoleId: string,
  scenario: ScenarioConfig = SCENARIO_CONFIG
): RoleBriefing | undefined {
  const roleKey = getRoleKey(dbRoleId, scenario);
  if (roleKey) {
    return scenario.briefings[roleKey];
  }
  return undefined;
}

/**
 * Calculate points for a given agreement
 */
export function calculatePoints(
  agreement: Record<string, number>,
  roleKey: 'roleA' | 'roleB',
  scenario: ScenarioConfig = SCENARIO_CONFIG
): number {
  let total = 0;
  for (const issue of scenario.issues) {
    const selectedIndex = agreement[issue.id];
    if (selectedIndex !== undefined && selectedIndex >= 0) {
      total += issue.payoffs[roleKey][selectedIndex] ?? 0;
    }
  }
  return total;
}

/**
 * Calculate joint gain (sum of both parties' points)
 */
export function calculateJointGain(
  agreement: Record<string, number>,
  scenario: ScenarioConfig = SCENARIO_CONFIG
): number {
  return calculatePoints(agreement, 'roleA', scenario) + 
         calculatePoints(agreement, 'roleB', scenario);
}

/**
 * Get maximum possible joint gain (for Pareto efficiency calculation)
 */
export function getMaxJointGain(scenario: ScenarioConfig = SCENARIO_CONFIG): number {
  let maxGain = 0;
  
  for (const issue of scenario.issues) {
    let maxIssueGain = 0;
    for (let i = 0; i < issue.options.length; i++) {
      const jointValue = issue.payoffs.roleA[i] + issue.payoffs.roleB[i];
      maxIssueGain = Math.max(maxIssueGain, jointValue);
    }
    maxGain += maxIssueGain;
  }
  
  return maxGain;
}

/**
 * Format an agreement for display
 */
export function formatAgreement(
  agreement: Record<string, number>,
  scenario: ScenarioConfig = SCENARIO_CONFIG
): string {
  const parts: string[] = [];
  for (const issue of scenario.issues) {
    const selectedIndex = agreement[issue.id];
    if (selectedIndex !== undefined && selectedIndex >= 0) {
      const option = issue.options[selectedIndex];
      parts.push(`${issue.label}: ${option?.label ?? 'Unknown'}`);
    }
  }
  return parts.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SCENARIO_CONFIG;
