/**
 * Assistant client that calls the self-hosted Express server's LLM proxy.
 * Set VITE_ASSISTANT_API_URL to point to the server (e.g. http://localhost:3000/api/assistant/query).
 *
 * Expected API: POST to VITE_ASSISTANT_API_URL with body
 * { sessionId, participantId, query, conversationHistory }
 * and response { response, tokensUsed?, responseTimeMs?, queriesRemaining?, provider?, model? }.
 */

import type { IAssistantClient, AssistantQueryParams, AssistantQueryResult } from './types'
import { getCurrentModelConfig } from '@/config/llm'

const baseUrl = import.meta.env.VITE_ASSISTANT_API_URL as string | undefined

function getDirectUrl(): string {
  if (!baseUrl || baseUrl === '') {
    throw new Error('VITE_ASSISTANT_API_URL is not set. Set it to your local assistant API URL (e.g. http://localhost:3001/query).')
  }
  return baseUrl.replace(/\/$/, '')
}

export const directUrlAssistantClient: IAssistantClient = {
  async query(params: AssistantQueryParams): Promise<AssistantQueryResult> {
    const url = getDirectUrl()
    const config = getCurrentModelConfig()
    const start = Date.now()

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        participantId: params.participantId,
        query: params.query,
        conversationHistory: params.conversationHistory ?? [],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      // Preserve the raw body in the error message so callers can detect
      // the server's "assistant_warming" soft-error (503) and show a
      // friendly message instead of the generic "failed" banner.
      throw new Error(`Assistant API error ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      response?: string
      tokensUsed?: number
      responseTimeMs?: number
      queriesRemaining?: number
      provider?: string
      model?: string
    }

    const responseTimeMs = data.responseTimeMs ?? Date.now() - start

    return {
      response: data.response ?? '',
      tokensUsed: data.tokensUsed ?? 0,
      responseTimeMs,
      queriesRemaining: data.queriesRemaining ?? 999,
      provider: data.provider ?? config.provider,
      model: data.model ?? config.model,
    }
  },
}
