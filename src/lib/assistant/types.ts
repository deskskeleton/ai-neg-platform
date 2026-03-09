/**
 * Assistant client interface
 *
 * Assistant client interface for LLM queries.
 * Implementation: direct-url-assistant (calls self-hosted Express server).
 */

export interface AssistantQueryParams {
  sessionId: string
  participantId: string
  query: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AssistantQueryResult {
  response: string
  tokensUsed: number
  responseTimeMs: number
  queriesRemaining: number
  provider: string
  model: string
}

/**
 * Interface for an assistant client that sends LLM queries to the server.
 */
export interface IAssistantClient {
  query(params: AssistantQueryParams): Promise<AssistantQueryResult>
}
