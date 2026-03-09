/**
 * Shared round labels for pool flow: map negotiation_scenario (v1.a/b/c) to display labels.
 * Used in Round Lobby, Post-Survey final chat grouping, and any analytics/export.
 */

const SCENARIO_TO_LABEL: Record<string, string> = {
  'v1.a': 'Round A',
  'v1.b': 'Round B',
  'v1.c': 'Round C',
}

/** Returns display label for a condition/scenario (e.g. "Round A") or fallback. */
export function getRoundLabel(negotiationScenario: string | null | undefined): string {
  if (!negotiationScenario) return ''
  return SCENARIO_TO_LABEL[negotiationScenario] ?? negotiationScenario
}
