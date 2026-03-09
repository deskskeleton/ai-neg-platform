/**
 * Config Index
 * 
 * Export all configuration modules.
 * 
 * Scenarios: Role definitions, issues, payoffs, briefings
 * LLM: AI assistant provider configuration
 */

// Scenario configuration
export * from './scenarios';
export { default as SCENARIO_CONFIG } from './scenarios';

// Round payoff tables (v1.a, v1.b, v1.c)
export * from './payoffs';

// LLM provider configuration
export * from './llm';
export { default as LLM_CONFIG } from './llm';
