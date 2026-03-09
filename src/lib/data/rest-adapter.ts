/**
 * REST + Socket.io implementation of the data layer.
 *
 * All data operations go through the self-hosted Express REST API.
 * Realtime subscriptions use Socket.io (backed by PostgreSQL LISTEN/NOTIFY).
 *
 * Set VITE_API_URL to the server base URL (e.g. http://localhost:3000).
 * When served from the same origin, leave VITE_API_URL empty.
 */

import { io, Socket } from 'socket.io-client'
import type { Subscription } from './types'
import type {
  Participant,
  ParticipantInsert,
  Session,
  SessionParticipant,
  SessionWithParticipants,
  Message,
  MessageType,
  EventLog,
  EventLogInsert,
  AssistantQuery,
  ParticipantRole,
  ParticipantToken,
  ExperimentBatch,
  BatchParticipant,
} from '@/types/database.types'

// ---------------------------------------------------------------------------
// API base and Socket.io singleton
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

let _socket: Socket | null = null

function getSocket(): Socket {
  if (!_socket) {
    _socket = io(API_BASE || window.location.origin, { transports: ['websocket', 'polling'] })
  }
  return _socket
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new RestError(`API error ${res.status}: ${text}`, res.status)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

class RestError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'RestError'
  }
}

// ---------------------------------------------------------------------------
// Config check (always true for self-hosted REST adapter)
// ---------------------------------------------------------------------------

export function isBackendConfigured(): boolean {
  return true
}

// ---------------------------------------------------------------------------
// Participant operations
// ---------------------------------------------------------------------------

export async function createParticipant(email: string): Promise<Participant> {
  return apiFetch('/participants', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function getParticipant(id: string): Promise<Participant | null> {
  return apiFetch(`/participants/${id}`)
}

export async function getParticipantByEmail(email: string): Promise<Participant | null> {
  return apiFetch(`/participants/by-email/${encodeURIComponent(email)}`)
}

export async function updateParticipant(id: string, updates: Partial<ParticipantInsert>): Promise<Participant> {
  return apiFetch(`/participants/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
}

export async function generateCompletionCode(participantId: string): Promise<string> {
  const data = await apiFetch<{ completion_code: string }>(`/participants/${participantId}/completion-code`, { method: 'POST' })
  return data.completion_code
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

export async function createSession(scenario?: string, timeLimitMinutes?: number, aiQueryLimit?: number): Promise<Session> {
  return apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ scenario, timeLimitMinutes, aiQueryLimit }),
  })
}

export async function getSession(id: string): Promise<Session | null> {
  return apiFetch(`/sessions/${id}`)
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  return apiFetch(`/sessions/by-code/${encodeURIComponent(code)}`)
}

export async function getSessionWithParticipants(sessionId: string): Promise<SessionWithParticipants | null> {
  return apiFetch(`/sessions/${sessionId}/with-participants`)
}

export async function updateSession(id: string, updates: Record<string, unknown>): Promise<Session> {
  return apiFetch(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
}

export async function startSession(sessionId: string): Promise<Session> {
  return apiFetch(`/sessions/${sessionId}/start`, { method: 'POST' })
}

export async function endSession(sessionId: string, agreementReached: boolean, finalAgreement?: Record<string, unknown>): Promise<Session> {
  return apiFetch(`/sessions/${sessionId}/end`, {
    method: 'POST',
    body: JSON.stringify({ agreementReached, finalAgreement }),
  })
}

export async function joinSession(
  sessionCode: string,
  participantId: string,
  role: ParticipantRole
): Promise<{ session: Session; sessionParticipant: SessionParticipant }> {
  return apiFetch('/sessions/join', {
    method: 'POST',
    body: JSON.stringify({ sessionCode, participantId, role }),
  })
}

export async function getAvailableRole(sessionId: string): Promise<ParticipantRole | null> {
  return apiFetch(`/sessions/${sessionId}/available-role`)
}

export async function isSessionReady(sessionId: string): Promise<boolean> {
  return apiFetch(`/sessions/${sessionId}/ready`)
}

export async function getOtherParticipant(sessionId: string, currentParticipantId: string): Promise<SessionParticipant | null> {
  return apiFetch(`/sessions/${sessionId}/other-participant/${currentParticipantId}`)
}

export async function getSessionParticipantByIds(sessionId: string, participantId: string): Promise<SessionParticipant | null> {
  return apiFetch(`/sessions/${sessionId}/participant/${participantId}`)
}

export async function forceEndSession(sessionId: string, participantId?: string): Promise<Session> {
  return apiFetch(`/sessions/${sessionId}/force-end`, {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  })
}

export async function setBriefingReady(sessionId: string, participantId: string): Promise<void> {
  await apiFetch(`/sessions/${sessionId}/briefing-ready`, {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  })
}

export async function getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
  return apiFetch(`/sessions/${sessionId}/participants`)
}

// ---------------------------------------------------------------------------
// Round session queries
// ---------------------------------------------------------------------------

export async function getRoundSessionsForParticipant(
  participantId: string
): Promise<Array<Session & { round_number: number }>> {
  return apiFetch(`/sessions/round-sessions/by-participant/${participantId}`)
}

export async function getRoundSessionsByPairSessionId(
  pairSessionId: string
): Promise<Array<Session & { round_number: number }>> {
  return apiFetch(`/sessions/round-sessions/by-pair/${pairSessionId}`)
}

export async function getSessionForParticipantRound(
  participantId: string,
  roundNumber: number
): Promise<{ session: Session; sessionParticipant: SessionParticipant } | null> {
  return apiFetch('/sessions/session-for-participant-round', {
    method: 'POST',
    body: JSON.stringify({ participantId, roundNumber }),
  })
}

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

export async function sendMessage(
  sessionId: string,
  participantId: string,
  content: string,
  messageType: MessageType = 'negotiation',
  metadata?: Record<string, unknown>
): Promise<Message> {
  return apiFetch('/messages', {
    method: 'POST',
    body: JSON.stringify({ sessionId, participantId, content, messageType, metadata }),
  })
}

export async function sendOffer(
  sessionId: string,
  participantId: string,
  offerDetails: Record<string, unknown>
): Promise<Message> {
  return apiFetch('/messages/offer', {
    method: 'POST',
    body: JSON.stringify({ sessionId, participantId, offerDetails }),
  })
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  return apiFetch(`/messages/session/${sessionId}`)
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

export async function logEvent(event: Omit<EventLogInsert, 'id' | 'timestamp'>): Promise<EventLog> {
  return apiFetch('/events', { method: 'POST', body: JSON.stringify(event) })
}

export async function logEvents(events: Omit<EventLogInsert, 'id' | 'timestamp'>[]): Promise<EventLog[]> {
  return apiFetch('/events/batch', { method: 'POST', body: JSON.stringify({ events }) })
}

export async function getSessionEvents(sessionId: string, eventType?: string): Promise<EventLog[]> {
  const qs = eventType ? `?eventType=${encodeURIComponent(eventType)}` : ''
  return apiFetch(`/events/session/${sessionId}${qs}`)
}

// ---------------------------------------------------------------------------
// Assistant query logging
// ---------------------------------------------------------------------------

export async function logAssistantQuery(
  sessionId: string,
  participantId: string,
  queryText: string,
  responseText: string,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<AssistantQuery> {
  return apiFetch('/assistant/log', {
    method: 'POST',
    body: JSON.stringify({ sessionId, participantId, queryText, responseText, tokensUsed, responseTimeMs }),
  })
}

export async function getAssistantQueries(sessionId: string, participantId: string): Promise<AssistantQuery[]> {
  return apiFetch(`/assistant/queries/${sessionId}/${participantId}`)
}

export async function getAssistantQueryCount(sessionId: string, participantId: string): Promise<number> {
  return apiFetch(`/assistant/count/${sessionId}/${participantId}`)
}

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

export async function getToken(token: string): Promise<ParticipantToken | null> {
  return apiFetch(`/tokens/${encodeURIComponent(token)}`)
}

export async function claimToken(
  token: string,
  metadata?: Record<string, unknown>
): Promise<{ token: ParticipantToken; participant: Participant; session: Session }> {
  return apiFetch(`/tokens/${encodeURIComponent(token)}/claim`, {
    method: 'POST',
    body: JSON.stringify({ metadata }),
  })
}

export async function generateSessionTokens(
  sessionId: string
): Promise<{ token: string; role: ParticipantRole; url: string }[]> {
  return apiFetch(`/tokens/generate/${sessionId}`, { method: 'POST' })
}

export async function getSessionTokens(sessionId: string): Promise<ParticipantToken[]> {
  return apiFetch(`/tokens/session/${sessionId}`)
}

// ---------------------------------------------------------------------------
// Survey operations
// ---------------------------------------------------------------------------

export async function markPreSurveyComplete(sessionId: string, participantId: string): Promise<SessionParticipant> {
  return apiFetch('/surveys/mark-complete', {
    method: 'POST',
    body: JSON.stringify({ sessionId, participantId }),
  })
}

export async function checkBothSurveysComplete(sessionId: string): Promise<boolean> {
  return apiFetch(`/surveys/both-complete/${sessionId}`)
}

export async function getSessionParticipantsWithSurveyStatus(
  sessionId: string
): Promise<Array<SessionParticipant & { has_completed_survey: boolean }>> {
  return apiFetch(`/surveys/status/${sessionId}`)
}

// ---------------------------------------------------------------------------
// Batch / matchmaking operations
// ---------------------------------------------------------------------------

export async function createBatch(maxParticipants: number = 18): Promise<ExperimentBatch> {
  return apiFetch('/batches', { method: 'POST', body: JSON.stringify({ maxParticipants }) })
}

export async function getBatchByCode(code: string): Promise<ExperimentBatch | null> {
  if (!code?.trim()) return null
  return apiFetch(`/batches/by-code/${encodeURIComponent(code)}`)
}

export async function getBatch(batchId: string): Promise<ExperimentBatch | null> {
  return apiFetch(`/batches/${batchId}`)
}

export async function getBatchHasSchedule(batchId: string): Promise<boolean> {
  return apiFetch(`/batches/${batchId}/has-schedule`)
}

export async function joinBatch(batchId: string, participantId: string): Promise<BatchParticipant> {
  return apiFetch(`/batches/${batchId}/join`, {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  })
}

export async function getBatchParticipant(batchId: string, participantId: string): Promise<BatchParticipant | null> {
  return apiFetch(`/batches/${batchId}/participant/${participantId}`)
}

export async function addToRoundQueue(participantId: string, roundNumber: number): Promise<void> {
  await apiFetch('/batches/round-queue', {
    method: 'POST',
    body: JSON.stringify({ participantId, roundNumber }),
  })
}

export interface TryMatchRoundResult {
  session_id: string
  session_code: string
  role: ParticipantRole
  dyad_id: string
}

export async function tryMatchRound(participantId: string, roundNumber: number): Promise<TryMatchRoundResult | null> {
  return apiFetch('/batches/try-match-round', {
    method: 'POST',
    body: JSON.stringify({ participantId, roundNumber }),
  })
}

export async function createRoundForPair(pairSessionId: string, roundNumber: number): Promise<string> {
  return apiFetch('/batches/create-round-for-pair', {
    method: 'POST',
    body: JSON.stringify({ pairSessionId, roundNumber }),
  })
}

export async function getOrCreateRoundSession(
  batchId: string,
  participantId: string,
  roundNumber: number
): Promise<{ session_id: string; session_code: string; role: ParticipantRole; dyad_id: string } | null> {
  return apiFetch('/batches/get-or-create-round-session', {
    method: 'POST',
    body: JSON.stringify({ batchId, participantId, roundNumber }),
  })
}

export async function tryMatchPoolRound(
  participantId: string,
  slotIndex: number
): Promise<{ session_id: string; session_code: string; role: ParticipantRole; dyad_id: string } | null> {
  return apiFetch('/batches/try-match-pool-round', {
    method: 'POST',
    body: JSON.stringify({ participantId, slotIndex }),
  })
}

export async function matchBatchForRound(batchId: string, slotIndex: number): Promise<number> {
  return apiFetch('/batches/match-batch-for-round', {
    method: 'POST',
    body: JSON.stringify({ batchId, slotIndex }),
  })
}

export async function getBatchRoundQueueCounts(
  batchIds: string[]
): Promise<Record<string, { 1: number; 2: number; 3: number }>> {
  if (batchIds.length === 0) return {}
  return apiFetch('/batches/queue-counts', {
    method: 'POST',
    body: JSON.stringify({ batchIds }),
  })
}

export async function clearAllBatchesAndRoundSessions(): Promise<{
  sessions_deleted: number
  queue_deleted: number
  batches_deleted: number
}> {
  return apiFetch('/batches/clear-all', { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Server time sync
// ---------------------------------------------------------------------------

export async function getServerTimeOffset(): Promise<number> {
  // Both clients use the same started_at from the server. Return 0 for now.
  return 0
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (Socket.io)
// ---------------------------------------------------------------------------

export function subscribeToMessages(
  sessionId: string,
  onMessage: (message: Message) => void
): Subscription {
  const s = getSocket()
  s.emit('join-session', sessionId)
  const handler = (row: Message) => {
    if (row.session_id === sessionId) onMessage(row)
  }
  s.on('messages_insert', handler)
  return { unsubscribe: () => { s.off('messages_insert', handler) } }
}

export function subscribeToSession(
  sessionId: string,
  onUpdate: (session: Session) => void
): Subscription {
  const s = getSocket()
  s.emit('join-session', sessionId)
  const handler = (row: Session) => {
    if (row.id === sessionId) onUpdate(row)
  }
  s.on('sessions_update', handler)
  return { unsubscribe: () => { s.off('sessions_update', handler) } }
}

export function subscribeToParticipants(
  sessionId: string,
  onJoin: (participant: SessionParticipant) => void
): Subscription {
  const s = getSocket()
  s.emit('join-session', sessionId)
  const handler = (row: SessionParticipant) => {
    if (row.session_id === sessionId) onJoin(row)
  }
  s.on('session_participants_insert', handler)
  return { unsubscribe: () => { s.off('session_participants_insert', handler) } }
}

export function subscribeToSessionParticipantUpdates(
  sessionId: string,
  onUpdate: (participant: SessionParticipant) => void
): Subscription {
  const s = getSocket()
  s.emit('join-session', sessionId)
  const handler = (row: SessionParticipant) => {
    if (row.session_id === sessionId) onUpdate(row)
  }
  s.on('session_participants_update', handler)
  return { unsubscribe: () => { s.off('session_participants_update', handler) } }
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

export async function fetchAdminSessions(): Promise<unknown[]> {
  return apiFetch('/admin/sessions')
}

export async function fetchAdminBatches(): Promise<unknown[]> {
  return apiFetch('/admin/batches')
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch(`/admin/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function removeSessionParticipant(sessionId: string, participantId: string): Promise<void> {
  await apiFetch(`/admin/session-participants/${sessionId}/${participantId}`, { method: 'DELETE' })
}

export async function clearSessionParticipants(sessionId: string): Promise<void> {
  await apiFetch(`/admin/session-participants/${sessionId}`, { method: 'DELETE' })
}

export async function exportSessionData(sessionId: string): Promise<unknown> {
  return apiFetch(`/admin/export/${sessionId}`)
}

// Re-export types from database schema
export type { ParticipantToken } from '@/types/database.types'
export type { ExperimentBatch, BatchParticipant } from '@/types/database.types'
