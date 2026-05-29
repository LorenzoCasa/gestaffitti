-- Sprint B1: learning fields on agent_decisions
-- Tracks suggested vs final response to enable future learning/fine-tuning

ALTER TABLE agent_decisions
  ADD COLUMN IF NOT EXISTS suggested_text     TEXT,
  ADD COLUMN IF NOT EXISTS was_modified       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome            TEXT    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_updated_at TIMESTAMPTZ;
