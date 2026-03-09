/**
 * Round payoff tables for spec scenarios v1.a, v1.b, v1.c
 *
 * Each scenario has A and B matrices: 4 issues × 3 options per role.
 * Used when session.negotiation_scenario is 'v1.a', 'v1.b', or 'v1.c'.
 */

/** 4 issues × 3 options: issue index → [opt0, opt1, opt2] points for that role */
export type PayoffMatrix = [number, number, number][] // length 4

export interface RoundPayoffTable {
  A: PayoffMatrix
  B: PayoffMatrix
}

/** Payoff tables keyed by scenario id (round config) */
export const ROUND_PAYOFF_TABLES: Record<string, RoundPayoffTable> = {
  'v1.a': {
    A: [
      [8, 28, 52],
      [18, 45, 47],
      [62, 37, 21],
      [39, 31, 22],
    ],
    B: [
      [62, 36, 18],
      [48, 34, 12],
      [12, 33, 55],
      [35, 27, 18],
    ],
  },
  'v1.b': {
    A: [
      [10, 30, 50],
      [60, 35, 15],
      [55, 30, 15],
      [25, 35, 10],
    ],
    B: [
      [60, 35, 15],
      [10, 30, 50],
      [15, 30, 55],
      [20, 35, 15],
    ],
  },
  'v1.c': {
    A: [
      [12, 34, 54],
      [20, 45, 52],
      [58, 32, 10],
      [36, 30, 14],
    ],
    B: [
      [60, 28, 12],
      [18, 50, 32],
      [12, 34, 54],
      [28, 36, 16],
    ],
  },
}

/** Valid round payoff scenario keys */
export const ROUND_PAYOFF_KEYS = Object.keys(ROUND_PAYOFF_TABLES) as ('v1.a' | 'v1.b' | 'v1.c')[]

/**
 * Returns true if the scenario id is a round payoff key (v1.a, v1.b, v1.c)
 */
export function isRoundPayoffKey(scenarioId: string | null | undefined): scenarioId is 'v1.a' | 'v1.b' | 'v1.c' {
  return typeof scenarioId === 'string' && scenarioId in ROUND_PAYOFF_TABLES
}

/**
 * Get payoff table for a round scenario key
 */
export function getRoundPayoffTable(scenarioKey: string | null | undefined): RoundPayoffTable | null {
  if (!scenarioKey || !(scenarioKey in ROUND_PAYOFF_TABLES)) return null
  return ROUND_PAYOFF_TABLES[scenarioKey]
}
