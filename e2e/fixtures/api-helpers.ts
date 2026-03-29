/**
 * ApiHelper — thin wrapper around Playwright's APIRequestContext.
 *
 * Mirrors the REST API surface the app exposes so tests never talk to
 * the database directly.  All methods throw on non-2xx responses.
 */

import type { APIRequestContext } from '@playwright/test';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Batch {
  id: string;
  code: string;
  max_participants: number;
  status: string;
}

export interface Participant {
  id: string;
  email: string;
}

export interface BatchParticipant {
  batch_id: string;
  participant_id: string;
  condition_order: string;
  slot_index: number;
}

export interface RoundSession {
  session_id: string;
  session_code: string;
  role: string;
  dyad_id: string;
}

export interface Message {
  id: string;
  session_id: string;
  participant_id: string;
  content: string;
  message_type: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ─── ApiHelper class ─────────────────────────────────────────────────────────

export class ApiHelper {
  constructor(private readonly request: APIRequestContext) {}

  private async json<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const opts = body !== undefined ? { data: body } : undefined;
    const res = await this.request[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](
      `/api${path}`,
      opts,
    );
    if (!res.ok()) {
      const text = await res.text();
      throw new Error(`${method} /api${path} → ${res.status()}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Batches ──────────────────────────────────────────────────────────────

  createBatch(maxParticipants = 12): Promise<Batch> {
    return this.json<Batch>('POST', '/batches', { maxParticipants });
  }

  getBatchByCode(code: string): Promise<Batch> {
    return this.json<Batch>('GET', `/batches/by-code/${code}`);
  }

  joinBatch(batchId: string, participantId: string): Promise<BatchParticipant> {
    return this.json<BatchParticipant>('POST', `/batches/${batchId}/join`, { participantId });
  }

  addToRoundQueue(participantId: string, roundNumber: number): Promise<{ ok: boolean }> {
    return this.json<{ ok: boolean }>('POST', '/batches/round-queue', {
      participantId,
      roundNumber,
    });
  }

  /** Trigger pool-based matching for a slot. Returns null when no match yet. */
  async tryMatchPoolRound(
    participantId: string,
    slotIndex: number,
  ): Promise<RoundSession | null> {
    const res = await this.request.post('/api/batches/try-match-pool-round', {
      data: { participantId, slotIndex },
    });
    if (res.status() === 204 || res.status() === 404) return null;
    if (!res.ok()) {
      throw new Error(`POST /api/batches/try-match-pool-round → ${res.status()}: ${await res.text()}`);
    }
    return res.json() as Promise<RoundSession>;
  }

  getOrCreateRoundSession(
    batchId: string,
    participantId: string,
    roundNumber: number,
  ): Promise<RoundSession | null> {
    return this.json<RoundSession | null>('POST', '/batches/get-or-create-round-session', {
      batchId,
      participantId,
      roundNumber,
    });
  }

  matchBatchForRound(batchId: string, slotIndex: number): Promise<number> {
    return this.json<number>('POST', '/batches/match-batch-for-round', { batchId, slotIndex });
  }

  clearAll(): Promise<{ ok: boolean }> {
    return this.json<{ ok: boolean }>('DELETE', '/batches/clear-all');
  }

  // ── Participants ──────────────────────────────────────────────────────────

  createParticipant(email: string): Promise<Participant> {
    return this.json<Participant>('POST', '/participants', { email });
  }

  getParticipant(id: string): Promise<Participant> {
    return this.json<Participant>('GET', `/participants/${id}`);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  getSession(id: string): Promise<Record<string, unknown>> {
    return this.json<Record<string, unknown>>('GET', `/sessions/${id}`);
  }

  startSession(sessionId: string): Promise<Record<string, unknown>> {
    return this.json<Record<string, unknown>>('POST', `/sessions/${sessionId}/start`);
  }

  endSession(
    sessionId: string,
    agreementReached: boolean,
    finalAgreement?: Record<string, number>,
  ): Promise<Record<string, unknown>> {
    return this.json<Record<string, unknown>>('POST', `/sessions/${sessionId}/end`, {
      agreementReached,
      finalAgreement,
    });
  }

  markBriefingReady(sessionId: string, participantId: string): Promise<Record<string, unknown>> {
    return this.json<Record<string, unknown>>('POST', `/sessions/${sessionId}/briefing-ready`, {
      participantId,
    });
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  sendMessage(
    sessionId: string,
    participantId: string,
    content: string,
    messageType = 'negotiation',
  ): Promise<Message> {
    return this.json<Message>('POST', '/messages', {
      sessionId,
      participantId,
      content,
      messageType,
    });
  }

  sendOffer(
    sessionId: string,
    participantId: string,
    offerDetails: Record<string, number>,
  ): Promise<Message> {
    return this.json<Message>('POST', '/messages/offer', {
      sessionId,
      participantId,
      offerDetails,
    });
  }

  getMessages(sessionId: string): Promise<Message[]> {
    return this.json<Message[]>('GET', `/messages/session/${sessionId}`);
  }

  // ── Surveys ───────────────────────────────────────────────────────────────

  markSurveyComplete(sessionId: string, participantId: string): Promise<Record<string, unknown>> {
    return this.json<Record<string, unknown>>('POST', '/surveys/mark-complete', {
      sessionId,
      participantId,
    });
  }

  bothSurveysComplete(sessionId: string): Promise<boolean> {
    return this.json<boolean>('GET', `/surveys/both-complete/${sessionId}`);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  listAdminBatches(): Promise<unknown[]> {
    return this.json<unknown[]>('GET', '/admin/batches');
  }

  listAdminSessions(): Promise<unknown[]> {
    return this.json<unknown[]>('GET', '/admin/sessions');
  }
}
