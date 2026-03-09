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
      model: 'llama3',
      displayName: 'Llama 3 (Local)',
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
  // Designed for multi-issue integrative negotiation
  systemPrompt: `You are a helpful negotiation assistant supporting a participant in a multi-issue negotiation experiment.

Your role:
- Provide strategic advice for integrative bargaining
- Help identify opportunities for value creation (win-win solutions)
- Suggest trade-offs that could benefit both parties
- Keep responses concise (2-3 sentences maximum)

Important guidelines:
- Do NOT reveal the other party's payoffs or priorities
- Focus on general negotiation principles, not specific numbers
- Encourage collaborative problem-solving
- Be supportive but don't make decisions for the participant

The negotiation involves multiple issues where parties have different priorities. 
Good outcomes come from identifying where to make concessions vs. stand firm.`,

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
