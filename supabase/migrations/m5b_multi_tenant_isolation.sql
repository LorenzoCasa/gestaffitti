-- ═══════════════════════════════════════════════════════════════════════════
-- M5B — Multi-Tenant Data Isolation
-- GestAffitti · 2026-06-29
--
-- OBIETTIVO
--   Separare completamente i dati di Lorenzo (apt1/apt2) dal secondo owner
--   (B&B MARE Riccione) senza cancellare né scollegare alcun dato esistente.
--
-- APPROCCIO
--   1. Aggiungi owner_id a agent_inbox (colonna nullable, non distruttiva).
--   2. Backfill Lorenzo su tutti i record esistenti.
--   3. Assegna apt1/apt2 a Lorenzo in apartments.
--   4. Sostituisci policy RLS "allow all" con policy per-owner su bookings/expenses.
--   5. Aggiorna policy su apartments/inbox/decisions/apt_rules.
--   6. Aggiungi policy cleaner (accesso operativo, scope futuro M5C+).
--
-- INVARIANTI
--   - Nessuna riga eliminata.
--   - Nessun dato Lorenzo modificato o scollegato.
--   - B&B MARE (c22ebe3a) non ha apartment in DB → vede 0 righe per design.
--   - Il cleaner (f57e3fd2) mantiene accesso operativo su appartamenti attivi.
--
-- UUID di riferimento
--   Lorenzo:  adf5d712-f332-43bd-b3ee-8f93b920d860
--   B&B MARE: c22ebe3a-3f37-4866-bd51-50d3077d5e53
--   Cleaner:  f57e3fd2-a5f0-41bc-b91c-169b3b60bc05
-- ═══════════════════════════════════════════════════════════════════════════


-- ── STEP 1: owner_id su agent_inbox ─────────────────────────────────────────
-- Colonna nullable: non rompe insert esistenti senza owner_id.
ALTER TABLE agent_inbox
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Backfill: tutti i 55 messaggi esistenti appartengono a Lorenzo.
UPDATE agent_inbox
  SET owner_id = 'adf5d712-f332-43bd-b3ee-8f93b920d860'
  WHERE owner_id IS NULL;


-- ── STEP 2: Assegna apt1/apt2 a Lorenzo ──────────────────────────────────────
-- apartments.owner_id esisteva già (FK su auth.users), era NULL.
UPDATE apartments
  SET owner_id = 'adf5d712-f332-43bd-b3ee-8f93b920d860'
  WHERE id IN ('apt1', 'apt2')
    AND owner_id IS NULL;

-- Riga virtuale 'property': usata da 9 spese comuni (IMU, condominio, ecc.)
-- active=false → non appare nell'UI né nelle query WHERE active=true.
-- Necessaria per far funzionare la RLS expenses (apt IN apartments.owner_id).
INSERT INTO apartments (id, label, color, owner_id, active)
VALUES ('property', 'Immobile / Comune', '#8a7a60', 'adf5d712-f332-43bd-b3ee-8f93b920d860', false)
ON CONFLICT (id) DO UPDATE
  SET owner_id = EXCLUDED.owner_id;


-- ── STEP 3: RLS apartments ───────────────────────────────────────────────────
-- Prima: qualsiasi owner vedeva TUTTI gli appartamenti (role = 'owner').
-- Dopo: ogni owner vede solo i propri.
DROP POLICY IF EXISTS "apartments: owner full access" ON apartments;

CREATE POLICY "apartments: owner sees own" ON apartments
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- La policy cleaner esistente è già corretta (SELECT su active=true, invariata).


-- ── STEP 4: RLS bookings ─────────────────────────────────────────────────────
-- Prima: "allow all" (qual: true) → qualsiasi owner vedeva TUTTE le prenotazioni.
-- Dopo: owner vede solo booking di propri appartamenti; cleaner ha accesso operativo.
DROP POLICY IF EXISTS "allow all" ON bookings;

CREATE POLICY "bookings: owner sees own" ON bookings
  FOR ALL TO authenticated
  USING (
    apt IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    apt IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  );

-- Cleaner: accesso completo su appartamenti attivi (serve UPDATE per cleaning/checkin).
-- Nota: scope globale sugli appartamenti attivi — da affinare in M5C se B&B MARE
-- avrà un cleaner diverso da quello di Lorenzo.
CREATE POLICY "bookings: cleaner full" ON bookings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'cleaner')
    AND apt IN (SELECT id FROM apartments WHERE active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'cleaner')
    AND apt IN (SELECT id FROM apartments WHERE active = true)
  );


-- ── STEP 5: RLS expenses ─────────────────────────────────────────────────────
-- Prima: "allow all" → qualsiasi owner vedeva TUTTE le spese.
-- Dopo: owner vede solo spese di propri appartamenti.
-- Il cleaner non ha accesso alle spese (non serve in CleanerView).
DROP POLICY IF EXISTS "allow all" ON expenses;

CREATE POLICY "expenses: owner sees own" ON expenses
  FOR ALL TO authenticated
  USING (
    apt IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    apt IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  );


-- ── STEP 6: RLS agent_inbox ──────────────────────────────────────────────────
-- Prima: role = 'owner' senza filtro → tutti i messaggi visibili a qualsiasi owner.
-- Dopo: owner vede solo i messaggi con il proprio owner_id.
DROP POLICY IF EXISTS "owner_all_inbox" ON agent_inbox;

CREATE POLICY "inbox: owner sees own" ON agent_inbox
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());


-- ── STEP 7: RLS agent_decisions ──────────────────────────────────────────────
-- Prima: role = 'owner' senza filtro.
-- Dopo: owner vede solo decisioni legate ai propri messaggi inbox.
DROP POLICY IF EXISTS "owner_all_decisions" ON agent_decisions;

CREATE POLICY "decisions: owner sees own" ON agent_decisions
  FOR ALL TO authenticated
  USING (
    inbox_id IN (
      SELECT id FROM agent_inbox WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    inbox_id IN (
      SELECT id FROM agent_inbox WHERE owner_id = auth.uid()
    )
  );


-- ── STEP 8: RLS agent_apt_rules ──────────────────────────────────────────────
-- Prima: role = 'owner' senza filtro.
-- Dopo: owner vede solo regole per i propri appartamenti.
DROP POLICY IF EXISTS "owner_all_apt_rules" ON agent_apt_rules;

CREATE POLICY "apt_rules: owner sees own" ON agent_apt_rules
  FOR ALL TO authenticated
  USING (
    apt_id IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    apt_id IN (
      SELECT id FROM apartments WHERE owner_id = auth.uid()
    )
  );


-- ── VERIFICA POST-MIGRATION (query di controllo, non eseguita automaticamente) ──
-- Esegui manualmente dopo apply per confermare:
--
-- SELECT id, owner_id FROM apartments;
-- → apt1/apt2 devono avere owner_id = 'adf5d712...'
--
-- SELECT COUNT(*), owner_id FROM agent_inbox GROUP BY owner_id;
-- → 55 righe con owner_id = 'adf5d712...'
--
-- SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
-- → nessuna policy "allow all" su bookings/expenses
