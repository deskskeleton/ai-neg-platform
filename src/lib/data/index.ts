/**
 * Data layer entry point.
 *
 * All data operations go through the self-hosted REST + Socket.io adapter.
 * Import from @/lib/data throughout the app.
 *
 * Assistant queries are handled via @/lib/assistant (direct URL to Express server).
 */

export * from './rest-adapter'
import { queryAssistant as queryAssistantWithParams } from '@/lib/assistant'
import type { AssistantQueryResult } from '@/lib/assistant'

export type AssistantQueryResponse = AssistantQueryResult

/**
 * Query the assistant via the self-hosted Express server (Ollama proxy).
 * Backward-compatible 4-arg signature; delegates to assistant client.
 */
export async function queryAssistant(
  sessionId: string,
  participantId: string,
  query: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<AssistantQueryResponse> {
  return queryAssistantWithParams({ sessionId, participantId, query, conversationHistory })
}

export type {
  IParticipantStore,
  ISessionStore,
  IMessageStore,
  IEventLogger,
  IAssistantQueryStore,
  ITokenStore,
  ISurveyStore,
  ISubscriptions,
  IDataStore,
  Subscription,
} from './types'
