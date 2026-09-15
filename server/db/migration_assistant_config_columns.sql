-- ============================================
-- Assistant configuration columns on assistant_queries (2026-09-15)
-- ============================================
-- Records, per assistant response, exactly which instrument produced it so
-- Appendix F can be reconciled from the export alone: model, prompt profile
-- and version, sampling settings, whether the reply was cut at the token cap,
-- whether the prompt-leak guard replaced it, and (informed-advisory profile
-- only) the context block that was injected into the system prompt.
--
-- Additive and idempotent. Apply to a running database with:
--   oc exec -i $POD -- psql -U neg -d negplatform -f - < server/db/migration_assistant_config_columns.sql
-- Also appended to init.sql so fresh deployments include it.

ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS prompt_profile TEXT;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS temperature REAL;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS max_tokens INTEGER;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS done_reason TEXT;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS truncated BOOLEAN;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS guard_triggered BOOLEAN;
ALTER TABLE assistant_queries ADD COLUMN IF NOT EXISTS context_snapshot TEXT;

COMMENT ON COLUMN assistant_queries.model IS 'LLM_MODEL tag served (weights digest recorded in the lab notebook)';
COMMENT ON COLUMN assistant_queries.prompt_profile IS 'general-coaching or informed-advisory (server/src/config/assistant.ts)';
COMMENT ON COLUMN assistant_queries.prompt_version IS 'PROMPT_VERSION constant at the time of the response';
COMMENT ON COLUMN assistant_queries.temperature IS 'Sampling temperature sent to the model';
COMMENT ON COLUMN assistant_queries.max_tokens IS 'num_predict sent to the model';
COMMENT ON COLUMN assistant_queries.done_reason IS 'Model stop reason: stop = finished, length = hit max_tokens';
COMMENT ON COLUMN assistant_queries.truncated IS 'True when done_reason = length; the shown reply ends with a visible marker';
COMMENT ON COLUMN assistant_queries.guard_triggered IS 'True when the prompt-leak guard replaced the model reply with the refusal line; response_text holds the shown reply, the event_log row holds the raw one';
COMMENT ON COLUMN assistant_queries.context_snapshot IS 'informed-advisory only: the role/payoff/round/offer/history block injected into the system prompt for this response';
