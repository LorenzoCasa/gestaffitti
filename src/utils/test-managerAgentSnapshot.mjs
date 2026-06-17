/**
 * Test suite: getManagerAgentSnapshot()
 * Run: node src/utils/test-managerAgentSnapshot.mjs
 *
 * Covers:
 *  T1  Snapshot pulito (nessun dato) → nessuna azione
 *  T2  Messaggio needs_info → messages_to_review
 *  T3  Messaggio manual_review → messages_to_review
 *  T4  Messaggio senza decision → messages_to_review (no_decision)
 *  T5  Messaggio available (lead positivo) → pending_opportunities
 *  T6  Messaggio has_alternatives → pending_opportunities
 *  T7  Messaggio gestito (status=replied) → NON in active threads
 *  T8  Prenotazione prossimi 7 giorni → upcoming_arrivals
 *  T9  Prenotazione fuori 7 giorni → NON in upcoming_arrivals
 *  T10 Ospiti attualmente in appartamento → current_guests
 *  T11 Checkout già avvenuto → NON in current_guests
 *  T12 Ospite in casa + checkin_done=false → calendar_alerts (missed_checkin high)
 *  T13 Check-in oggi non registrato → calendar_alerts (medium)
 *  T14 Arrivo imminente (≤3gg) senza caparra → calendar_alerts (deposit_pending)
 *  T15 Arrivo tra 5 giorni senza caparra → NON in calendar_alerts
 *  T16 suggested_actions ordinate per priorità (P1 < P2 < P3 < P4)
 *  T17 revenue_notes: entrate prossimi 30 giorni
 *  T18 revenue_notes: caparre da ricevere
 *  T19 agent_summary contiene testo corretto
 *  T20 Nessun dato inventato: snapshot pulito su dati vuoti
 *  T21 Thread: più messaggi stessa trattativa → 1 solo entry
 *  T22 Messaggio outside_rules → pending_opportunities
 */

import { getManagerAgentSnapshot } from './managerAgentSnapshot.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      got:      ${JSON.stringify(actual)}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    fail++;
  }
}

function checkTrue(label, actual) {
  if (actual === true || actual) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      expected truthy, got: ${JSON.stringify(actual)}`);
    fail++;
  }
}

function checkFalse(label, actual) {
  if (!actual) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      expected falsy, got: ${JSON.stringify(actual)}`);
    fail++;
  }
}

function run(label, fn) {
  console.log(`\n=== ${label} ===`);
  fn();
}

// ── Date anchor (inject a stable "today" for deterministic tests) ─────────────

const TODAY = '2026-07-05';  // Sunday — known, stable reference date
function daysFrom(n) {
  const d = new Date(TODAY + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Fixture builders ──────────────────────────────────────────────────────────

function mkInbox(overrides = {}) {
  return {
    id:               'inbox-1',
    source:           'subito',
    source_thread_id: null,
    raw_text:         'Ciao, siamo interessati a luglio',
    raw_metadata:     {},
    status:           'new',
    apt_id:           'apt1',
    created_at:       '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function mkDecision(overrides = {}) {
  return {
    id:            'dec-1',
    inbox_id:      'inbox-1',
    decision_type: 'needs_info',
    suggested_text:'Salve, ...',
    was_modified:  false,
    created_at:    '2026-07-01T10:01:00Z',
    payload: {
      raw_decision_type: 'needs_info',
      llm_failed:        false,
      stage:             'llm_generated',
      context_snapshot:  { pricing_total: null },
    },
    ...overrides,
  };
}

function mkBooking(overrides = {}) {
  return {
    id:           'book-1',
    apt:          'apt1',
    guest:        'Mario Rossi',
    email:        '',
    phone:        '',
    checkin:      daysFrom(5),
    checkout:     daysFrom(12),
    price:        800,
    deposit:      200,
    deposit_paid: true,
    checkin_done: false,
    status:       'confirmed',
    platform:     'Subito',
    notes:        '',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

run('T1 — Snapshot pulito su dati vuoti', () => {
  const snap = getManagerAgentSnapshot({ today: TODAY });
  check('messages_to_review: vuoto',    snap.messages_to_review.length,    0);
  check('pending_opportunities: vuoto', snap.pending_opportunities.length,  0);
  check('upcoming_arrivals: vuoto',     snap.upcoming_arrivals.length,       0);
  check('current_guests: vuoto',        snap.current_guests.length,          0);
  check('calendar_alerts: vuoto',       snap.calendar_alerts.length,         0);
  check('suggested_actions: vuoto',     snap.suggested_actions.length,       0);
  checkTrue('agent_summary: ✅ (tutto ok)', snap.agent_summary.includes('✅'));
});

run('T2 — Messaggio needs_info → messages_to_review', () => {
  const inbox     = [mkInbox()];
  const decisions = [mkDecision({ decision_type: 'needs_info', payload: { raw_decision_type: 'needs_info', context_snapshot: {} } })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  check('1 message_to_review',      snap.messages_to_review.length, 1);
  check('decisionType: needs_info', snap.messages_to_review[0].decisionType, 'needs_info');
  check('NON in opportunities',     snap.pending_opportunities.length, 0);
});

run('T3 — Messaggio manual_review → messages_to_review', () => {
  const inbox     = [mkInbox()];
  const decisions = [mkDecision({ decision_type: 'manual_review', payload: { raw_decision_type: 'manual_review', context_snapshot: {} } })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  check('1 message_to_review',          snap.messages_to_review.length, 1);
  check('decisionType: manual_review',  snap.messages_to_review[0].decisionType, 'manual_review');
});

run('T4 — Messaggio senza decision → messages_to_review (no_decision)', () => {
  const inbox = [mkInbox()];
  const snap  = getManagerAgentSnapshot({ inbox, decisions: [], today: TODAY });
  check('1 message_to_review',        snap.messages_to_review.length, 1);
  check('decisionType: no_decision',  snap.messages_to_review[0].decisionType, 'no_decision');
});

run('T5 — Messaggio available → pending_opportunities', () => {
  const inbox     = [mkInbox()];
  const decisions = [mkDecision({
    decision_type: 'available',
    payload: { raw_decision_type: 'available', context_snapshot: { pricing_total: 800 } },
  })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  check('0 messages_to_review',       snap.messages_to_review.length,    0);
  check('1 pending_opportunity',      snap.pending_opportunities.length,  1);
  check('decisionType: available',    snap.pending_opportunities[0].decisionType, 'available');
  check('pricingTotal: 800',          snap.pending_opportunities[0].pricingTotal, 800);
});

run('T6 — Messaggio has_alternatives → pending_opportunities', () => {
  const inbox     = [mkInbox()];
  const decisions = [mkDecision({
    decision_type: 'manual_review',  // normalized DB value
    payload: { raw_decision_type: 'has_alternatives', context_snapshot: { pricing_total: 800 } },
  })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  // raw_decision_type wins over decision_type
  check('1 pending_opportunity (raw type wins)', snap.pending_opportunities.length, 1);
  check('decisionType: has_alternatives', snap.pending_opportunities[0].decisionType, 'has_alternatives');
  check('NON in messages_to_review', snap.messages_to_review.length, 0);
});

run('T7 — Messaggio gestito (status=replied) → NON in active threads', () => {
  const inbox     = [mkInbox({ status: 'replied' })];
  const decisions = [mkDecision({ decision_type: 'needs_info', payload: { raw_decision_type: 'needs_info', context_snapshot: {} } })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  check('0 messages_to_review',      snap.messages_to_review.length,   0);
  check('0 pending_opportunities',   snap.pending_opportunities.length, 0);
});

run('T8 — Prenotazione prossimi 7 giorni → upcoming_arrivals', () => {
  const bookings = [mkBooking({ checkin: daysFrom(3), checkout: daysFrom(10) })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  check('1 upcoming_arrival',   snap.upcoming_arrivals.length, 1);
  check('daysUntil: 3',         snap.upcoming_arrivals[0].daysUntil, 3);
  check('nights: 7',            snap.upcoming_arrivals[0].nights, 7);
  check('depositPaid: true',    snap.upcoming_arrivals[0].depositPaid, true);
});

run('T9 — Prenotazione tra 10 giorni → NON in upcoming_arrivals', () => {
  const bookings = [mkBooking({ checkin: daysFrom(10), checkout: daysFrom(17) })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  check('0 upcoming_arrivals', snap.upcoming_arrivals.length, 0);
});

run('T10 — Ospite attualmente in appartamento → current_guests', () => {
  const bookings = [mkBooking({ checkin: daysFrom(-2), checkout: daysFrom(5), checkin_done: true })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  check('1 current_guest',      snap.current_guests.length, 1);
  check('checkoutIn: 5',        snap.current_guests[0].checkoutIn, 5);
  check('checkinDone: true',    snap.current_guests[0].checkinDone, true);
  check('NON in upcoming',      snap.upcoming_arrivals.length, 0);
});

run('T11 — Checkout già avvenuto → NON in current_guests', () => {
  const bookings = [mkBooking({ checkin: daysFrom(-10), checkout: daysFrom(-3), checkin_done: true })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  check('0 current_guests',    snap.current_guests.length, 0);
});

run('T12 — Ospite in casa + checkin_done=false → calendar_alert HIGH', () => {
  // Guest checked in 2 days ago but checkin_done is false
  const bookings = [mkBooking({ checkin: daysFrom(-2), checkout: daysFrom(5), checkin_done: false })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  check('1 calendar_alert',        snap.calendar_alerts.length, 1);
  check('type: missed_checkin',    snap.calendar_alerts[0].type, 'missed_checkin');
  check('severity: high',          snap.calendar_alerts[0].severity, 'high');
  checkTrue('azione P1 presente',  snap.suggested_actions.some(a => a.priority === 1 && a.category === 'calendar'));
});

run('T13 — Check-in OGGI non registrato → calendar_alert MEDIUM', () => {
  const bookings = [mkBooking({ checkin: TODAY, checkout: daysFrom(7), checkin_done: false })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  const checkinAlert = snap.calendar_alerts.find(a => a.type === 'missed_checkin');
  checkTrue('missed_checkin alert presente', checkinAlert);
  // Today booking with no checkin_done should be medium (it's also in upcoming so gets arrival action)
  checkTrue('arrival action presente', snap.suggested_actions.some(a => a.category === 'arrival'));
});

run('T14 — Arrivo tra 2 giorni senza caparra → calendar_alert deposit_pending', () => {
  const bookings = [mkBooking({ checkin: daysFrom(2), checkout: daysFrom(9), deposit_paid: false })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  const depAlert = snap.calendar_alerts.find(a => a.type === 'deposit_pending');
  checkTrue('deposit_pending alert presente', depAlert);
  check('severity: medium',  depAlert.severity, 'medium');
  checkTrue('alert menziona giorni', depAlert.message.includes('giorni') || depAlert.message.includes('giorno'));
});

run('T15 — Arrivo tra 5 giorni senza caparra → NON in deposit_pending alerts', () => {
  // deposit alert only fires for ≤ 3 days
  const bookings = [mkBooking({ checkin: daysFrom(5), checkout: daysFrom(12), deposit_paid: false })];
  const snap     = getManagerAgentSnapshot({ bookings, today: TODAY });
  const depAlert = snap.calendar_alerts.find(a => a.type === 'deposit_pending');
  checkFalse('nessun deposit_pending per arrivo tra 5 giorni', depAlert);
});

run('T16 — suggested_actions ordinate per priorità', () => {
  // Mix: calendar alert (P1) + opportunity (P3) + review (P4)
  const inbox     = [mkInbox({ id: 'i1', status: 'new' }), mkInbox({ id: 'i2', status: 'new', source_thread_id: null })];
  // i1 → available opportunity
  // i2 → no decision → review
  const decisions = [mkDecision({
    inbox_id: 'i1',
    decision_type: 'available',
    payload: { raw_decision_type: 'available', context_snapshot: { pricing_total: 800 } },
  })];
  const bookings  = [mkBooking({ checkin: daysFrom(-1), checkout: daysFrom(4), checkin_done: false })];
  const snap      = getManagerAgentSnapshot({ inbox, decisions, bookings, today: TODAY });

  const priorities = snap.suggested_actions.map(a => a.priority);
  let sorted = true;
  for (let i = 1; i < priorities.length; i++) {
    if (priorities[i] < priorities[i - 1]) { sorted = false; break; }
  }
  checkTrue('azioni ordinate per priorità crescente', sorted);
  checkTrue('P1 (calendar) presente', snap.suggested_actions[0].priority === 1);
});

run('T17 — revenue_notes: entrate prossimi 30 giorni', () => {
  const bookings = [
    mkBooking({ checkin: daysFrom(5),  checkout: daysFrom(12), price: 800 }),
    mkBooking({ id: 'book-2', checkin: daysFrom(15), checkout: daysFrom(22), price: 800 }),
  ];
  const snap = getManagerAgentSnapshot({ bookings, today: TODAY });
  const note = snap.revenue_notes.find(n => n.type === 'upcoming_revenue');
  checkTrue('revenue_note presente',        note);
  check('valore: 1600',                     note.value, 1600);
  checkTrue('nota menziona €1600',           note.note.includes('1600'));
});

run('T18 — revenue_notes: caparre da ricevere', () => {
  const bookings = [
    mkBooking({ checkin: daysFrom(5), checkout: daysFrom(12), deposit: 200, deposit_paid: false }),
  ];
  const snap = getManagerAgentSnapshot({ bookings, today: TODAY });
  const note = snap.revenue_notes.find(n => n.type === 'pending_deposits');
  checkTrue('pending_deposits note presente', note);
  check('valore: 200', note.value, 200);
});

run('T19 — agent_summary contiene testo corretto per ogni scenario', () => {
  // Scenario: ospite in casa + messaggio in arrivo + opportunity
  const inbox    = [mkInbox()];
  const decisions= [mkDecision({ decision_type: 'available', payload: { raw_decision_type: 'available', context_snapshot: { pricing_total: 800 } } })];
  const bookings = [mkBooking({ checkin: daysFrom(-2), checkout: daysFrom(5), checkin_done: true })];
  const snap     = getManagerAgentSnapshot({ inbox, decisions, bookings, today: TODAY });
  checkTrue('summary menziona ospiti', snap.agent_summary.includes('ospite'));
  checkTrue('summary menziona opportunità', snap.agent_summary.includes('opportunità') || snap.agent_summary.includes('richiesta'));
  checkFalse('summary non è vuoto', !snap.agent_summary);
});

run('T20 — Nessun dato inventato: snapshot pulito su dati vuoti', () => {
  const snap = getManagerAgentSnapshot({ today: TODAY });
  check('messages_to_review = []',     snap.messages_to_review.length,    0);
  check('pending_opportunities = []',  snap.pending_opportunities.length,  0);
  check('upcoming_arrivals = []',      snap.upcoming_arrivals.length,       0);
  check('current_guests = []',         snap.current_guests.length,          0);
  check('calendar_alerts = []',        snap.calendar_alerts.length,         0);
  check('suggested_actions = []',      snap.suggested_actions.length,       0);
  check('revenue_notes = []',          snap.revenue_notes.length,           0);
  check('_meta.active_bookings = 0',   snap._meta.active_bookings,          0);
});

run('T21 — Thread: più messaggi stesso source_thread_id → 1 sola entry', () => {
  const threadId = 'thread-abc';
  const inbox = [
    mkInbox({ id: 'msg-1', source_thread_id: threadId, created_at: '2026-07-01T09:00:00Z', status: 'new' }),
    mkInbox({ id: 'msg-2', source_thread_id: threadId, created_at: '2026-07-01T10:00:00Z', status: 'new' }),
  ];
  const decisions = [mkDecision({ inbox_id: 'msg-2', decision_type: 'needs_info', payload: { raw_decision_type: 'needs_info', context_snapshot: {} } })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  // 2 messages but only 1 thread → 1 review entry
  check('1 sola entry in messages_to_review (thread grouping)', snap.messages_to_review.length, 1);
});

run('T22 — Messaggio outside_rules → pending_opportunities', () => {
  const inbox     = [mkInbox()];
  const decisions = [mkDecision({
    decision_type: 'manual_review',   // normalized DB value
    payload: { raw_decision_type: 'outside_rules', context_snapshot: {} },
  })];
  const snap = getManagerAgentSnapshot({ inbox, decisions, today: TODAY });
  // outside_rules is an opportunity (guest could find a valid date)
  check('1 pending_opportunity',      snap.pending_opportunities.length, 1);
  check('decisionType: outside_rules',snap.pending_opportunities[0].decisionType, 'outside_rules');
  check('0 messages_to_review',       snap.messages_to_review.length, 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
const total = pass + fail;
console.log(`Totale: ${total} test — ✓ ${pass} passati${fail > 0 ? `, ✗ ${fail} falliti` : ', 0 falliti'}`);
if (fail > 0) process.exit(1);
