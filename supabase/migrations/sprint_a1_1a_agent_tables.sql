-- ═══════════════════════════════════════════════════════════════════════════
--  Sprint A1.1a — Agent Foundation Tables
--  Run this in Supabase → SQL Editor (once, idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add status column to bookings ────────────────────────────────────────
-- Supports the availability engine (BOOKING_BLOCKING_STATUSES).
-- Default: 'confirmed' preserves all existing records as-is.
--
-- Status semantics:
--   confirmed       – active booking, blocks calendar
--   pending_payment – hold while awaiting payment; blocks calendar (see BOOKING_BLOCKING_STATUSES)
--   manual_block    – owner-created block (maintenance, personal use, etc.); blocks calendar
--   draft           – inquiry in progress, not yet confirmed; does NOT block
--   cancelled       – cancelled; does NOT block

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','pending_payment','manual_block','draft','cancelled'));


-- ── 2. Agent inbox ───────────────────────────────────────────────────────────
-- Stores every inbound inquiry regardless of source platform.

CREATE TABLE IF NOT EXISTS agent_inbox (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL    DEFAULT now(),

  -- Source
  source                TEXT        NOT NULL
    CHECK (source IN ('subito','email','whatsapp','airbnb','booking','altro')),
  source_message_id     TEXT,                     -- dedup key: single message ID
  source_thread_id      TEXT,                     -- conversation thread ID

  -- Raw content
  raw_text              TEXT,
  raw_metadata          JSONB,                    -- platform-specific envelope

  -- Parsed fields (filled by agentParser — Sprint A1.1d)
  parsed_guest_name     TEXT,
  parsed_checkin        DATE,
  parsed_checkout       DATE,
  parsed_guests         SMALLINT,
  parsed_offered_price  NUMERIC(10,2),
  parsed_apt_id         TEXT,

  -- Lifecycle
  status                TEXT        NOT NULL    DEFAULT 'new'
    CHECK (status IN ('new','processing','replied','booked','rejected','ignored')),
  owner_action_required BOOLEAN     NOT NULL    DEFAULT true,  -- priority inbox / escalation

  -- Relations
  apt_id                TEXT        REFERENCES apartments(id),
  booking_id            UUID        REFERENCES bookings(id),

  -- Audit
  updated_at            TIMESTAMPTZ NOT NULL    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_inbox_status_idx   ON agent_inbox (status);
CREATE INDEX IF NOT EXISTS agent_inbox_source_idx   ON agent_inbox (source);
CREATE INDEX IF NOT EXISTS agent_inbox_apt_idx      ON agent_inbox (apt_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_inbox_msg_dedup
  ON agent_inbox (source, source_message_id)
  WHERE source_message_id IS NOT NULL;


-- ── 3. Agent decisions ───────────────────────────────────────────────────────
-- One row per decision produced by runDecisionEngine() for an inbox message.

CREATE TABLE IF NOT EXISTS agent_decisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL    DEFAULT now(),

  inbox_id        UUID        NOT NULL    REFERENCES agent_inbox(id) ON DELETE CASCADE,

  -- Decision output
  decision_type   TEXT        NOT NULL
    CHECK (decision_type IN (
      'available','unavailable','partially_available',
      'needs_info','price_negotiation','manual_review'
    )),
  response_text   TEXT,                   -- generated Italian reply
  payload         JSONB,                  -- full structured payload (pricing, avail, etc.)

  -- Confidence (future: trained from owner feedback)
  decision_score  NUMERIC(5,2),           -- NULL until confidence model is active

  -- Owner interaction
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  owner_notes     TEXT
);

CREATE INDEX IF NOT EXISTS agent_decisions_inbox_idx ON agent_decisions (inbox_id);
CREATE INDEX IF NOT EXISTS agent_decisions_type_idx  ON agent_decisions (decision_type);


-- ── 4. Agent apartment rules ─────────────────────────────────────────────────
-- Per-apartment, per-source pricing and availability rules.
--
-- source = 'default' → applies to all platforms unless overridden.
-- source = 'subito'  → Subito-specific strategy (different price, min_nights, etc.)
-- source = 'airbnb'  → Airbnb-specific strategy
-- … and so on.
--
-- The engine resolves rules with: source-specific row ?? 'default' row.

CREATE TABLE IF NOT EXISTS agent_apt_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  apt_id              TEXT        NOT NULL REFERENCES apartments(id),
  source              TEXT        NOT NULL DEFAULT 'default',  -- 'default' | AGENT_SOURCES
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Pricing
  base_nightly_rate   NUMERIC(10,2) NOT NULL DEFAULT 0,
  cleaning_fee        NUMERIC(10,2)          DEFAULT 0,
  extra_guest_fee     NUMERIC(10,2)          DEFAULT 0,
  guest_threshold     SMALLINT               DEFAULT 2,
  deposit_amount      NUMERIC(10,2)          DEFAULT 0,

  -- Availability rules
  min_nights          SMALLINT               DEFAULT 1,
  buffer_before_days  SMALLINT               DEFAULT 0,
  buffer_after_days   SMALLINT               DEFAULT 0,

  -- Negotiation rules
  max_discount_pct    NUMERIC(5,2)           DEFAULT 10,
  min_net_target      NUMERIC(10,2)          DEFAULT 0,

  -- Platform toggles (which sources this apt accepts via agent)
  active_sources      TEXT[]                 DEFAULT ARRAY['subito','email','whatsapp'],

  -- One rule set per (apartment × source)
  CONSTRAINT agent_apt_rules_apt_source_uq UNIQUE (apt_id, source)
);


-- ── 5. RLS policies ──────────────────────────────────────────────────────────
-- Mirror the pattern used by bookings / expenses: owner sees all rows.

ALTER TABLE agent_inbox      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_apt_rules  ENABLE ROW LEVEL SECURITY;

-- agent_inbox
DROP POLICY IF EXISTS "owner_all_inbox"     ON agent_inbox;
CREATE POLICY "owner_all_inbox"
  ON agent_inbox FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- agent_decisions
DROP POLICY IF EXISTS "owner_all_decisions" ON agent_decisions;
CREATE POLICY "owner_all_decisions"
  ON agent_decisions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- agent_apt_rules
DROP POLICY IF EXISTS "owner_all_apt_rules" ON agent_apt_rules;
CREATE POLICY "owner_all_apt_rules"
  ON agent_apt_rules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );
