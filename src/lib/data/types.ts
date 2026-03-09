/**
 * Data layer interfaces
 *
 * Abstractions for persistence so the app can swap backends.
 * Implementation: rest-adapter (self-hosted Express + PostgreSQL).
 */

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
} from '@/types/database.types'

// ---------------------------------------------------------------------------
// Participant store
// ---------------------------------------------------------------------------

export interface IParticipantStore {
  createParticipant(email: string): Promise<Participant>
  getParticipant(id: string): Promise<Participant | null>
  getParticipantByEmail(email: string): Promise<Participant | null>
  updateParticipant(id: string, updates: Partial<ParticipantInsert>): Promise<Participant>
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export interface ISessionStore {
  createSession(scenario?: string, timeLimitMinutes?: number, aiQueryLimit?: number): Promise<Session>
  getSession(id: string): Promise<Session | null>
  getSessionByCode(code: string): Promise<Session | null>
  getSessionWithParticipants(sessionId: string): Promise<SessionWithParticipants | null>
  updateSession(id: string, updates: Record<string, unknown>): Promise<Session>
  startSession(sessionId: string): Promise<Session>
  endSession(sessionId: string, agreementReached: boolean, finalAgreement?: Record<string, unknown>): Promise<Session>
  joinSession(sessionCode: string, participantId: string, role: ParticipantRole): Promise<{ session: Session; sessionParticipant: SessionParticipant }>
  getAvailableRole(sessionId: string): Promise<ParticipantRole | null>
  isSessionReady(sessionId: string): Promise<boolean>
  getOtherParticipant(sessionId: string, currentParticipantId: string): Promise<SessionParticipant | null>
  getSessionParticipantByIds(sessionId: string, participantId: string): Promise<SessionParticipant | null>
  forceEndSession(sessionId: string, participantId?: string): Promise<Session>
}

// ---------------------------------------------------------------------------
// Message store
// ---------------------------------------------------------------------------

export interface IMessageStore {
  sendMessage(sessionId: string, participantId: string, content: string, messageType?: MessageType, metadata?: Record<string, unknown>): Promise<Message>
  sendOffer(sessionId: string, participantId: string, offerDetails: Record<string, unknown>): Promise<Message>
  getSessionMessages(sessionId: string): Promise<Message[]>
}

// ---------------------------------------------------------------------------
// Event logger
// ---------------------------------------------------------------------------

export interface IEventLogger {
  logEvent(event: Omit<EventLogInsert, 'id' | 'timestamp'>): Promise<EventLog>
  logEvents(events: Omit<EventLogInsert, 'id' | 'timestamp'>[]): Promise<EventLog[]>
  getSessionEvents(sessionId: string, eventType?: string): Promise<EventLog[]>
}

// ---------------------------------------------------------------------------
// Assistant query store (logging/counting only; actual query via IAssistantClient)
// ---------------------------------------------------------------------------

export interface IAssistantQueryStore {
  logAssistantQuery(
    sessionId: string,
    participantId: string,
    queryText: string,
    responseText: string,
    tokensUsed?: number,
    responseTimeMs?: number
  ): Promise<AssistantQuery>
  getAssistantQueries(sessionId: string, participantId: string): Promise<AssistantQuery[]>
  getAssistantQueryCount(sessionId: string, participantId: string): Promise<number>
}

// ---------------------------------------------------------------------------
// Token store (BEELab entry tokens)
// ---------------------------------------------------------------------------

export interface ITokenStore {
  getToken(token: string): Promise<ParticipantToken | null>
  claimToken(token: string, metadata?: Record<string, unknown>): Promise<{ token: ParticipantToken; participant: Participant; session: Session }>
  generateSessionTokens(sessionId: string): Promise<{ token: string; role: ParticipantRole; url: string }[]>
  getSessionTokens(sessionId: string): Promise<ParticipantToken[]>
}

// ---------------------------------------------------------------------------
// Survey / pre-survey flow
// ---------------------------------------------------------------------------

export interface ISurveyStore {
  markPreSurveyComplete(sessionId: string, participantId: string): Promise<SessionParticipant>
  checkBothSurveysComplete(sessionId: string): Promise<boolean>
  getSessionParticipantsWithSurveyStatus(sessionId: string): Promise<Array<SessionParticipant & { has_completed_survey: boolean }>>
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (backend-agnostic)
// ---------------------------------------------------------------------------

/** Generic subscription handle -- call unsubscribe() to stop listening */
export interface Subscription {
  unsubscribe(): void
}

export interface ISubscriptions {
  subscribeToMessages(sessionId: string, onMessage: (message: Message) => void): Subscription
  subscribeToSession(sessionId: string, onUpdate: (session: Session) => void): Subscription
  subscribeToParticipants(sessionId: string, onJoin: (participant: SessionParticipant) => void): Subscription
  subscribeToSessionParticipantUpdates(sessionId: string, onUpdate: (participant: SessionParticipant) => void): Subscription
}

// ---------------------------------------------------------------------------
// Combined data store (single import for app)
// ---------------------------------------------------------------------------

export interface IDataStore
  extends IParticipantStore,
    ISessionStore,
    IMessageStore,
    IEventLogger,
    IAssistantQueryStore,
    ITokenStore,
    ISurveyStore,
    ISubscriptions {
  getServerTimeOffset(): Promise<number>
}
