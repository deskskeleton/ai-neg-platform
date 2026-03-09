/**
 * Database Types
 * 
 * These types match the schema defined in:
 * server/db/init.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================
// Database Schema Types
// ============================================

export interface Database {
  public: {
    Tables: {
      participants: {
        Row: {
          id: string
          email: string
          created_at: string
          demographic_data: Json
          pre_questionnaire_data: Json
          post_questionnaire_data: Json
          completion_code: string | null
          post_round_survey_data: Json
        }
        Insert: {
          id?: string
          email: string
          created_at?: string
          demographic_data?: Json
          pre_questionnaire_data?: Json
          post_questionnaire_data?: Json
          completion_code?: string | null
          post_round_survey_data?: Json
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
          demographic_data?: Json
          pre_questionnaire_data?: Json
          post_questionnaire_data?: Json
          completion_code?: string | null
          post_round_survey_data?: Json
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          session_code: string
          created_at: string
          started_at: string | null
          ended_at: string | null
          status: string
          negotiation_scenario: string | null
          time_limit_minutes: number
          agreement_reached: boolean | null
          final_agreement: Json
          ai_query_limit: number | null
          time_extension_minutes: number
          dyad_id: string | null
          round_number: number | null
          pair_session_id: string | null
        }
        Insert: {
          id?: string
          session_code: string
          created_at?: string
          started_at?: string | null
          ended_at?: string | null
          status?: string
          negotiation_scenario?: string | null
          time_limit_minutes?: number
          agreement_reached?: boolean | null
          final_agreement?: Json
          ai_query_limit?: number
          time_extension_minutes?: number
          dyad_id?: string | null
          round_number?: number | null
          pair_session_id?: string | null
        }
        Update: {
          id?: string
          session_code?: string
          created_at?: string
          started_at?: string | null
          ended_at?: string | null
          status?: string
          negotiation_scenario?: string | null
          time_limit_minutes?: number
          agreement_reached?: boolean | null
          final_agreement?: Json
          ai_query_limit?: number
          time_extension_minutes?: number
          dyad_id?: string | null
          round_number?: number | null
          pair_session_id?: string | null
        }
        Relationships: []
      }
      session_participants: {
        Row: {
          id: string
          session_id: string
          participant_id: string
          role: string
          joined_at: string
          pre_survey_completed_at: string | null
          treatment_condition: string | null
          briefing_ready_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          participant_id: string
          role: string
          joined_at?: string
          pre_survey_completed_at?: string | null
          treatment_condition?: string | null
          briefing_ready_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          participant_id?: string
          role?: string
          joined_at?: string
          pre_survey_completed_at?: string | null
          treatment_condition?: string | null
          briefing_ready_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          session_id: string
          participant_id: string
          content: string
          message_type: string
          timestamp: string
          metadata: Json
        }
        Insert: {
          id?: string
          session_id: string
          participant_id: string
          content: string
          message_type?: string
          timestamp?: string
          metadata?: Json
        }
        Update: {
          id?: string
          session_id?: string
          participant_id?: string
          content?: string
          message_type?: string
          timestamp?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      assistant_queries: {
        Row: {
          id: string
          session_id: string
          participant_id: string
          query_text: string
          response_text: string
          timestamp: string
          tokens_used: number | null
          response_time_ms: number | null
        }
        Insert: {
          id?: string
          session_id: string
          participant_id: string
          query_text: string
          response_text: string
          timestamp?: string
          tokens_used?: number | null
          response_time_ms?: number | null
        }
        Update: {
          id?: string
          session_id?: string
          participant_id?: string
          query_text?: string
          response_text?: string
          timestamp?: string
          tokens_used?: number | null
          response_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_queries_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_queries_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      event_log: {
        Row: {
          id: string
          session_id: string | null
          participant_id: string | null
          event_type: string
          event_data: Json
          timestamp: string
          round_id: string | null
          dyad_id: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          participant_id?: string | null
          event_type: string
          event_data?: Json
          timestamp?: string
          round_id?: string | null
          dyad_id?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          participant_id?: string | null
          event_type?: string
          event_data?: Json
          timestamp?: string
          round_id?: string | null
          dyad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_log_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      negotiation_outcomes: {
        Row: {
          id: string
          session_id: string
          participant_id: string
          individual_points: number | null
          joint_gain: number | null
          agreement_rate: boolean | null
          time_to_agreement_seconds: number | null
          pareto_gap: number | null
          behavioral_reliance_score: number | null
          query_frequency: number | null
          incorporation_score: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          participant_id: string
          individual_points?: number | null
          joint_gain?: number | null
          agreement_rate?: boolean | null
          time_to_agreement_seconds?: number | null
          pareto_gap?: number | null
          behavioral_reliance_score?: number | null
          query_frequency?: number | null
          incorporation_score?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          participant_id?: string
          individual_points?: number | null
          joint_gain?: number | null
          agreement_rate?: boolean | null
          time_to_agreement_seconds?: number | null
          pareto_gap?: number | null
          behavioral_reliance_score?: number | null
          query_frequency?: number | null
          incorporation_score?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_outcomes_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_outcomes_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      // ============================================
      // PARTICIPANT_TOKENS (Pre-generated URLs)
      // NOTE: May be over-engineering. See DEVELOPMENT_LOG.md
      // ============================================
      participant_tokens: {
        Row: {
          id: string
          token: string
          session_id: string
          participant_id: string | null
          role: string
          terminal_number: number | null
          created_at: string
          claimed_at: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          token: string
          session_id: string
          participant_id?: string | null
          role: string
          terminal_number?: number | null
          created_at?: string
          claimed_at?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          token?: string
          session_id?: string
          participant_id?: string | null
          role?: string
          terminal_number?: number | null
          created_at?: string
          claimed_at?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "participant_tokens_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_tokens_participant_id_fkey"
            columns: ["participant_id"]
            referencedRelation: "participants"
            referencedColumns: ["id"]
          }
        ]
      }
      experiment_batches: {
        Row: {
          id: string
          batch_code: string
          max_participants: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          batch_code: string
          max_participants?: number
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          batch_code?: string
          max_participants?: number
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      batch_participants: {
        Row: {
          id: string
          batch_id: string
          participant_id: string
          condition_order: Json
          joined_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          participant_id: string
          condition_order: Json
          joined_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          participant_id?: string
          condition_order?: Json
          joined_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_session_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_session: {
        Args: {
          scenario?: string | null
          time_limit?: number
        }
        Returns: {
          id: string
          session_code: string
          created_at: string
          started_at: string | null
          ended_at: string | null
          status: string
          negotiation_scenario: string | null
          time_limit_minutes: number
          agreement_reached: boolean | null
          final_agreement: Json
        }
      }
      // NOTE: May be over-engineering. See DEVELOPMENT_LOG.md
      generate_participant_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_token_batch: {
        Args: {
          p_session_id: string
        }
        Returns: {
          token: string
          role: string
          url: string
        }[]
      }
      try_match_round: {
        Args: {
          p_participant_id: string
          p_round_number: number
        }
        Returns: {
          session_id: string
          session_code: string
          role: string
          dyad_id: string
        }[]
      }
      create_round_for_pair: {
        Args: {
          p_pair_session_id: string
          p_round_number: number
        }
        Returns: string
      }
      create_batch: {
        Args: {
          p_max_participants?: number
        }
        Returns: {
          id: string
          batch_code: string
          max_participants: number
          status: string
          created_at: string
        }
      }
      join_batch_atomic: {
        Args: {
          p_batch_id: string
          p_participant_id: string
        }
        Returns: {
          id: string
          batch_id: string
          participant_id: string
          condition_order: Json
          joined_at: string
        }
      }
      add_to_round_queue: {
        Args: {
          p_participant_id: string
          p_round_number: number
        }
        Returns: undefined
      }
      batch_has_schedule: {
        Args: {
          p_batch_id: string
        }
        Returns: boolean
      }
      get_or_create_round_session: {
        Args: {
          p_batch_id: string
          p_participant_id: string
          p_round_number: number
        }
        Returns: {
          session_id: string
          session_code: string
          role: string
          dyad_id: string
        }[]
      }
      try_match_pool_round: {
        Args: {
          p_participant_id: string
          p_slot_index: number
        }
        Returns: {
          session_id: string
          session_code: string
          role: string
          dyad_id: string
        }[]
      }
      match_batch_for_round: {
        Args: {
          p_batch_id: string
          p_slot_index: number
        }
        Returns: number
      }
      get_batch_round_queue_counts: {
        Args: {
          p_batch_ids: string[]
        }
        Returns: {
          batch_id: string
          round_number: number
          queue_count: number
        }[]
      }
      clear_all_batches_and_round_sessions: {
        Args: Record<string, never>
        Returns: {
          sessions_deleted: number
          queue_deleted: number
          batches_deleted: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ============================================
// Enum Types (Application-level)
// ============================================

/** Status of a negotiation session */
export type SessionStatus = 'waiting' | 'active' | 'completed' | 'cancelled'

/** Role of a participant in the negotiation */
export type ParticipantRole = 'pm' | 'developer'

/** A/B treatment: payoff table always visible vs collapsible in negotiation UI */
export type TreatmentCondition = 'payoff_always_visible' | 'payoff_collapsible'

/** Type of message in the chat */
export type MessageType = 'negotiation' | 'offer' | 'acceptance' | 'rejection' | 'system'

/** Type of tracked event */
export type EventType = 
  | 'page_view'
  | 'session_joined'
  | 'session_started'
  | 'session_ended'
  | 'message_sent'
  | 'offer_made'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'assistant_opened'
  | 'assistant_closed'
  | 'assistant_query'
  | 'typing_started'
  | 'typing_stopped'

// ============================================
// JSONB Data Structures
// ============================================

/** Demographic data collected in pre-survey */
export interface DemographicData {
  age?: number
  gender?: string
  education?: string
  occupation?: string
  negotiation_experience?: string
  country?: string
  [key: string]: unknown
}

/** Pre-negotiation questionnaire responses */
export interface PreQuestionnaireData {
  negotiation_style?: number[]
  confidence_level?: number
  risk_tolerance?: number
  cooperation_tendency?: number
  [key: string]: unknown
}

/** Post-negotiation questionnaire responses */
export interface PostQuestionnaireData {
  satisfaction?: number
  fairness_perception?: number
  partner_trust?: number
  assistant_helpfulness?: number
  would_use_again?: boolean
  open_feedback?: string
  [key: string]: unknown
}

/** Final agreement structure */
export interface FinalAgreement {
  salary?: number
  bonus?: number
  vacation_days?: number
  remote_days?: number
  start_date?: string
  other_terms?: Record<string, unknown>
  [key: string]: unknown
}

/** Message metadata */
export interface MessageMetadata {
  offer_details?: {
    salary?: number
    bonus?: number
    vacation_days?: number
    remote_days?: number
  }
  typing_duration_ms?: number
  edited?: boolean
  [key: string]: unknown
}

// ============================================
// Convenience Type Aliases
// ============================================

type Tables = Database['public']['Tables']

/** Participant row type */
export type Participant = Tables['participants']['Row']
export type ParticipantInsert = Tables['participants']['Insert']
export type ParticipantUpdate = Tables['participants']['Update']

/** Session row type */
export type Session = Tables['sessions']['Row']
export type SessionInsert = Tables['sessions']['Insert']
export type SessionUpdate = Tables['sessions']['Update']

/** Session participant row type */
export type SessionParticipant = Tables['session_participants']['Row']
export type SessionParticipantInsert = Tables['session_participants']['Insert']

/** Message row type */
export type Message = Tables['messages']['Row']
export type MessageInsert = Tables['messages']['Insert']

/** Assistant query row type */
export type AssistantQuery = Tables['assistant_queries']['Row']
export type AssistantQueryInsert = Tables['assistant_queries']['Insert']

/** Event log row type */
export type EventLog = Tables['event_log']['Row']
export type EventLogInsert = Tables['event_log']['Insert']

/** Negotiation outcome row type */
export type NegotiationOutcome = Tables['negotiation_outcomes']['Row']
export type NegotiationOutcomeInsert = Tables['negotiation_outcomes']['Insert']

/** Experiment batch (pool-based run) */
export type ExperimentBatch = Tables['experiment_batches']['Row']
export type BatchParticipant = Tables['batch_participants']['Row']

/** Participant token row type (pre-generated URLs) */
// NOTE: May be over-engineering. See DEVELOPMENT_LOG.md
export type ParticipantToken = Tables['participant_tokens']['Row']
export type ParticipantTokenInsert = Tables['participant_tokens']['Insert']
export type ParticipantTokenUpdate = Tables['participant_tokens']['Update']

// ============================================
// Extended Types (with joins)
// ============================================

/** Session with participants */
export interface SessionWithParticipants extends Session {
  session_participants: (SessionParticipant & {
    participant: Participant
  })[]
}

/** Message with sender info */
export interface MessageWithSender extends Message {
  participant: Pick<Participant, 'id' | 'email'>
  session_participant: Pick<SessionParticipant, 'role'>
}
