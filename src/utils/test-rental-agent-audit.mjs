/**
 * Audit: 15 behavioral cases for the rental agent engine.
 * Run: node src/utils/test-rental-agent-audit.mjs
 *
 * Covers: availability, pricing, stay rules, alternatives, decision types,
 * unrecognized apartments, outside_rules behavior, full-month, flexible periods.
 *
 * Calendar references (2026):
 *   Jun 6  = Saturday
 *   Jul 4  = Saturday  (Jul 10 = Friday, Jul 11 = Saturday)
 *   Aug 1  = Saturday
 *   Sep 5  = Saturday
 */

import { buildAgentContext }  from './buildAgentContext.js';
import { generateGuestReply } from './generateGuestReply.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const APARTMENTS = [
  { id: 'apt1', label: 'Appartamento A', color: '#6e9ec9' },
  { id: 'apt2', label: 'Appartamento B', color: '#c96e9e' },
];

const NO_BOOKINGS = [];

const APT1_BOOKED_JUL4_11 = [
  { id: 'b1', apt: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', status: 'confirmed', guest: 'Test' },
];

// All of July blocked on both apartments — no sat-sat window survives
const ALL_JULY_BOOKED = [
  { id: 'b2', apt: 'apt1', checkin: '2026-07-01', checkout: '2026-08-01', status: 'confirmed', guest: 'Test' },
  { id: 'b3', apt: 'apt2', checkin: '2026-07-01', checkout: '2026-08-01', status: 'confirmed', guest: 'Test' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      got:      "${actual}"`);
    console.log(`      expected: "${expected}"`);
    fail++;
  }
}

function checkContains(label, actual, substring) {
  if (typeof actual === 'string' && actual.includes(substring)) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      stringa NON contiene: "${substring}"`);
    console.log(`      testo: "${actual?.slice(0, 300)}"`);
    fail++;
  }
}

function checkNotContains(label, actual, substring) {
  if (typeof actual === 'string' && !actual.includes(substring)) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      testo NON doveva contenere: "${substring}"`);
    console.log(`      testo: "${actual?.slice(0, 300)}"`);
    fail++;
  }
}

function run(label, fn) {
  console.log(`\n=== ${label} ===`);
  fn();
}

// ── Test Cases ────────────────────────────────────────────────────────────────

run('CASO 1 — apt1 libero, sab-sab luglio, 4 persone → available, €800', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 4 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: available',         ctx.decision.type,       'available');
  check('prezzo: €800',                ctx.pricing.totalPrice,  800);
  checkContains   ('reply menziona €800',           reply, '800');
  checkNotContains('reply NON menziona Appartamento B', reply, 'Appartamento B');
});

run('CASO 2 — apt1 occupato, apt2 libero stesse date → has_alternatives con apt2', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 2 },
    apartments: APARTMENTS, bookings: APT1_BOOKED_JUL4_11,
  });
  const reply = generateGuestReply(ctx);
  const hasApt2 = ctx.alternatives.items.some(a => a.aptId === 'apt2');
  check('decision: has_alternatives',              ctx.decision.type, 'has_alternatives');
  check('alternatives include apt2',               hasApt2,           true);
  checkContains   ('reply menziona Appartamento B come alternativa', reply, 'Appartamento B');
  checkNotContains('apt2 NON è l\'appartamento principale nella risposta', reply, 'Appartamento B è disponibile');
});

run('CASO 3 — apt1 disponibile → NON proporre apt2 come alternativa', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: available',                     ctx.decision.type, 'available');
  checkNotContains('reply NON menziona Appartamento B', reply, 'Appartamento B');
});

run('CASO 4 — date valide, nessun numero ospiti → needs_info (chiede solo ospiti, non date)', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11' },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: needs_info',                    ctx.decision.type, 'needs_info');
  checkContains   ('reply chiede numero di persone', reply, 'persone');
  checkNotContains('reply NON chiede data arrivo', reply, 'data di arrivo');
});

run('CASO 5 — nessuna data → needs_info con richiesta date', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1' },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: needs_info',                    ctx.decision.type, 'needs_info');
  checkContains('reply chiede data di arrivo',     reply, 'data di arrivo');
});

run('CASO 6 — prima settimana agosto, sab-sab, 7 notti → available, €800', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-08-01', checkout: '2026-08-08', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: available',   ctx.decision.type,      'available');
  check('prezzo: €800',          ctx.pricing.totalPrice, 800);
  checkContains('reply menziona €800', reply, '800');
});

run('CASO 7 — due settimane agosto, sab-sab, 14 notti → available, €1600', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-08-01', checkout: '2026-08-15', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: available',    ctx.decision.type,      'available');
  check('prezzo: €1600',          ctx.pricing.totalPrice, 1600);
  checkContains('reply menziona €1600', reply, '1600');
});

run('CASO 8 — 5 persone → available (nessun cap implementato, comportamento attuale)', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 5 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: available (no cap ospiti)',        ctx.decision.type, 'available');
  check('[NOTA] nessun cap — da valutare in futuro',  true, true);
});

run('CASO 9 — 7 persone → available (nessun cap implementato, comportamento attuale)', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 7 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: available (no cap ospiti)',        ctx.decision.type, 'available');
  check('[NOTA] nessun cap — da valutare in futuro',  true, true);
});

run('CASO 10 — date non sab-sab in luglio → outside_rules', () => {
  // Jul 10-17 2026 = Friday → Friday
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-10', checkout: '2026-07-17', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: outside_rules',                          ctx.decision.type, 'outside_rules');
  checkContains('reply spiega regola sabato → sabato', reply, 'sabato a sabato');
});

run('CASO 11a — mese intero luglio → full_month, €2600', () => {
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', isFullMonth: true, fullMonthNum: 7 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: full_month',  ctx.decision.type,      'full_month');
  check('prezzo: €2600',         ctx.pricing.totalPrice, 2600);
  checkContains('reply menziona €2600', reply, '2600');
});

run('CASO 11b — mese intero agosto → full_month, €2600', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', isFullMonth: true, fullMonthNum: 8 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: full_month',  ctx.decision.type,      'full_month');
  check('prezzo: €2600',         ctx.pricing.totalPrice, 2600);
});

run('CASO 11c — mese intero settembre → full_month, €1500', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', isFullMonth: true, fullMonthNum: 9 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: full_month',  ctx.decision.type,      'full_month');
  check('prezzo: €1500',         ctx.pricing.totalPrice, 1500);
});

run('CASO 12 — fuori regola + cal. ha finestre sab-sab → outside_rules con 📅 verificate (solo sab-sab)', () => {
  // Jul 10-17 2026 = Fri-Fri (outside_rules). No bookings → sat-sat windows exist:
  // Jul 11-18, Jul 4-11, Jul 18-25 (all Saturdays, calendar-verified).
  // BUG FIX: old code proposed apt2 for same non-sat-sat dates (Jul 10-17); fixed.
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-10', checkout: '2026-07-17', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: outside_rules',                         ctx.decision.type,       'outside_rules');
  check('ha alternative sab-sab verificate sul cal.',      ctx.alternatives.count > 0, true);
  checkContains   ('reply contiene 📅 (date verificate)',  reply, '📅');
  checkNotContains('reply NON propone "10 luglio" (non-sab-sab come alternativa, BUG FIXED)', reply, '10 luglio');
  checkContains   ('reply propone "11 luglio" (sabato, cal-verified)', reply, '11 luglio');
});

run('CASO 13 — fuori regola + luglio tutto occupato → outside_rules senza date proposte (no date matematiche)', () => {
  // Jul 10-17 2026 = Fri-Fri + tutta luglio occupata → nessuna alternativa cal-verified.
  // BUG FIX: old code mostrava suggestedValidRanges matematici (•) — es. "• 11 luglio" che era occupato.
  const ctx   = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-10', checkout: '2026-07-17', guests: 2 },
    apartments: APARTMENTS, bookings: ALL_JULY_BOOKED,
  });
  const reply = generateGuestReply(ctx);
  check('decision: outside_rules',                              ctx.decision.type,   'outside_rules');
  check('nessuna alternativa cal-verified',                     ctx.alternatives.count, 0);
  checkNotContains('reply NON contiene 📅 (niente date non verificate)',          reply, '📅');
  checkNotContains('reply NON usa bullet • per date matematiche (BUG FIXED)',     reply, '• ');
});

run('CASO 14 — appartamento non riconosciuto (aptId="") → manual_review, NON has_alternatives', () => {
  // BUG FIX: old code → findAlternatives restituiva apt1+apt2 come "altri apt",
  // decideType tornava has_alternatives, reply diceva "per  purtroppo non è libero" (label vuoto).
  const ctx   = buildAgentContext({
    formData:   { aptId: '', checkin: '2026-07-04', checkout: '2026-07-11', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  const reply = generateGuestReply(ctx);
  check('decision: manual_review (BUG FIXED)',                 ctx.decision.type,    'manual_review');
  check('alternatives.count = 0 (BUG FIXED)',                  ctx.alternatives.count, 0);
  checkNotContains('reply NON contiene label vuoto "per  purtroppo"', reply, 'per  purtroppo');
});

run('CASO 15a — prezzo giugno, sab-sab, 7n → €500', () => {
  // Jun 6 2026 = Saturday
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-06-06', checkout: '2026-06-13', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: available',  ctx.decision.type,      'available');
  check('prezzo: €500',         ctx.pricing.totalPrice, 500);
});

run('CASO 15b — prezzo luglio, sab-sab, 7n → €800', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-07-04', checkout: '2026-07-11', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('prezzo luglio 7n: €800', ctx.pricing.totalPrice, 800);
});

run('CASO 15c — prezzo agosto, sab-sab, 14n → €1600', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-08-01', checkout: '2026-08-15', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('prezzo agosto 14n: €1600', ctx.pricing.totalPrice, 1600);
});

run('CASO 15d — prezzo settembre, 7n, regola flessibile → €500, available', () => {
  // Sep 5 2026 = Saturday. September ha needsRules=false → qualsiasi giorno è valido.
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', checkin: '2026-09-05', checkout: '2026-09-12', guests: 2 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: available (settembre flessibile)', ctx.decision.type,      'available');
  check('prezzo settembre 7n: €500',                  ctx.pricing.totalPrice, 500);
});

run('CASO 15e — mese intero giugno → full_month, €1600', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', isFullMonth: true, fullMonthNum: 6 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: full_month',    ctx.decision.type,      'full_month');
  check('prezzo mese giugno: €1600', ctx.pricing.totalPrice, 1600);
});

run('CASO 15f — mese intero settembre → full_month, €1500', () => {
  const ctx = buildAgentContext({
    formData:   { aptId: 'apt1', isFullMonth: true, fullMonthNum: 9 },
    apartments: APARTMENTS, bookings: NO_BOOKINGS,
  });
  check('decision: full_month',       ctx.decision.type,      'full_month');
  check('prezzo mese settembre: €1500', ctx.pricing.totalPrice, 1500);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
const total = pass + fail;
console.log(`Totale: ${total} test — ✓ ${pass} passati${fail > 0 ? `, ✗ ${fail} falliti` : ', 0 falliti'}`);
if (fail > 0) process.exit(1);
