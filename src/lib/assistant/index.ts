/**
 * Assistant client entry point.
 *
 * Routes all LLM queries through the self-hosted backend via
 * VITE_ASSISTANT_API_URL (e.g. http://localhost:3001/api/assistant/query).
 */

import type { IAssistantClient, AssistantQueryParams, AssistantQueryResult } from './types'
import { directUrlAssistantClient } from './direct-url-assistant'

/**
 * Returns the active assistant client.
 */
export function getAssistantClient(): IAssistantClient {
  return directUrlAssistantClient
}

/**
 * Query the assistant. Delegates to the direct-URL client which
 * talks to the self-hosted Express server (Ollama proxy).
 */
export async function queryAssistant(
  params: AssistantQueryParams
): Promise<AssistantQueryResult> {
  return directUrlAssistantClient.query(params)
}

export type { IAssistantClient, AssistantQueryParams, AssistantQueryResult }
export { directUrlAssistantClient }
