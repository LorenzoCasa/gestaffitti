-- ═══════════════════════════════════════════════════════════════════════════
--  Sprint B1.1 — Webhook columns
--  Aggiunge parsed_questions a agent_inbox.
--  Idempotente: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE agent_inbox
  ADD COLUMN IF NOT EXISTS parsed_questions TEXT[];
