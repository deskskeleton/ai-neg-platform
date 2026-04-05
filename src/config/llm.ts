/**
 * LLM Provider Configuration
 * 
 * Abstraction layer for AI assistant integration.
 * Supports multiple providers - easily swap between:
 * - Anthropic (Claude)
 * - OpenAI (GPT-4)
 * - Google (Gemini)
 * - Local/Free alternatives (Ollama, Together AI, etc.)
 * 
 * To switch providers:
 * 1. Update LLM_CONFIG.provider
 * 2. Set appropriate environment variable
 * 3. Update server-side LLM route if needed
 */

// ============================================
// SUPPORTED PROVIDERS
// ============================================

export type LLMProvider = 
  | 'anthropic'    // Claude (default)
  | 'openai'       // GPT-4, GPT-3.5
  | 'google'       // Gemini
  | 'together'     // Together AI (cheaper)
  | 'ollama'       // Local/self-hosted
  | 'custom';      // Custom endpoint

export interface LLMModelConfig {
  provider: LLMProvider;
  model: string;
  displayName: string;
  maxTokens: number;
  temperature: number;
}

export interface LLMConfig {
  // Current active provider
  provider: LLMProvider;
  
  // Model configuration per provider
  models: Record<LLMProvider, LLMModelConfig>;
  
  // System prompt for negotiation assistant
  systemPrompt: string;
  
  // Rate limiting
  maxQueriesPerParticipant: number;
  
  // UI settings
  ui: {
    panelTitle: string;
    inputPlaceholder: string;
    queriesRemainingText: string;
    limitReachedText: string;
  };
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const LLM_CONFIG: LLMConfig = {
  // CHANGE THIS to switch providers (default: ollama for self-hosted deployment)
  provider: 'ollama',
  
  // Model configurations for each provider
  models: {
    anthropic: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet',
      maxTokens: 300,
      temperature: 0.7,
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      maxTokens: 300,
      temperature: 0.7,
    },
    google: {
      provider: 'google',
      model: 'gemini-1.5-flash',
      displayName: 'Gemini Flash',
      maxTokens: 300,
      temperature: 0.7,
    },
    together: {
      provider: 'together',
      model: 'meta-llama/Llama-3-70b-chat-hf',
      displayName: 'Llama 3 70B',
      maxTokens: 300,
      temperature: 0.7,
    },
    ollama: {
      provider: 'ollama',
      model: 'llama3.1:8b',
      displayName: 'Llama 3.1 8B (Local)',
      maxTokens: 300,
      temperature: 0.7,
    },
    custom: {
      provider: 'custom',
      model: 'custom-model',
      displayName: 'Custom Model',
      maxTokens: 300,
      temperature: 0.7,
    },
  },
  
  // System prompt - same for all providers
  // Strategy-neutral negotiation assistant
  systemPrompt: `You are an assistant supporting a participant in a multi-issue negotiation experiment.

Your role:
- Help the participant think through their options and trade-offs
- Answer questions about negotiation strategy and tactics
- Keep responses concise (2-3 sentences maximum)

Important constraints:
- You do NOT have access to either party's specific point values, priorities, or payoff tables. If asked about specific numbers or what to offer, say that you do not have this information.
- Do not recommend a specific strategy orientation (competitive or collaborative). Help the participant reason through their own approach.
- Do not make decisions for the participant or tell them what to accept or reject.
- Do not speculate about what the other party values or wants.

Context: The participant is negotiating over multiple issues with another person. Each issue has several options. Different options are worth different amounts to each party, but you do not know these values.`,

  // Rate limiting
  maxQueriesPerParticipant: 0, // 0 = unlimited
  
  // UI text (easily translatable)
  ui: {
    panelTitle: 'AI Assistant',
    inputPlaceholder: 'Ask for negotiation advice...',
    queriesRemainingText: 'queries remaining',
    limitReachedText: 'You have used all your AI assistant queries for this session.',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the current model configuration
 */
export function getCurrentModelConfig(): LLMModelConfig {
  return LLM_CONFIG.models[LLM_CONFIG.provider];
}

/**
 * Get environment variable name for current provider's API key
 */
export function getApiKeyEnvVar(): string {
  const envVars: Record<LLMProvider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
    together: 'TOGETHER_API_KEY',
    ollama: 'OLLAMA_BASE_URL', // Not really an API key
    custom: 'CUSTOM_LLM_API_KEY',
  };
  return envVars[LLM_CONFIG.provider];
}

/**
 * Get the API endpoint for current provider
 */
export function getApiEndpoint(): string {
  const endpoints: Record<LLMProvider, string> = {
    anthropic: 'https://api.anthropic.com/v1/messages',
    openai: 'https://api.openai.com/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1/models',
    together: 'https://api.together.xyz/v1/chat/completions',
    ollama: 'http://localhost:11434/api/chat',
    custom: '', // Set via environment
  };
  return endpoints[LLM_CONFIG.provider];
}

/**
 * Check if the assistant feature is enabled.
 * Always true — the self-hosted server handles LLM availability.
 */
export function isAssistantEnabled(): boolean {
  return true;
}

// ============================================
// TYPE EXPORTS
// ============================================

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantQueryRequest {
  sessionId: string;
  participantId: string;
  query: string;
  conversationHistory?: AssistantMessage[];
}

export interface AssistantQueryResponse {
  response: string;
  tokensUsed: number;
  responseTimeMs: number;
  queriesRemaining: number;
  provider: LLMProvider;
  model: string;
}

export default LLM_CONFIG;
