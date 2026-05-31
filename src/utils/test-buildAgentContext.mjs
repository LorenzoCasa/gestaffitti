/**
 * Manual node test for buildAgentContext + generateGuestReply.
 * Run: node src/utils/test-buildAgentContext.mjs
 */

import { buildAgentContext }  from './buildAgentContext.js';
import { generateGuestReply } from './generateGuestReply.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const apartments = [
  { id: 'apt1', label: 'Appartamento Mare', name: 'Appartamento Mare', color: '#c9a96e' },
];

const bookings = [
  // Blocks 2025-07-05 → 2025-07-12
  { id: 'b1', apt: 'apt1', checkin: '2025-07-05', checkout: '2025-07-12', status: 'confirmed', guest: 'Rossi' },
];

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label} — got "${actual}", expected "${expected}"`);
    fail++;
  }
}

// ── Test 1: available (sat-sat, 7 notti, libero) ──────────────────────────────
console.log('\n=== Test 1: AVAILABLE (sat→sat, 7 notti, libero) ===');
const ctx1 = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2025-06-28', checkout: '2025-07-05', guests: 2 },
  apartments, bookings, aptRules: [], inbox: [],
});
check('decision.type',          ctx1.decision.type,              'available');
check('availability.isAvailable', String(ctx1.availability.isAvailable), 'true');
check('pricing.totalPrice',     String(ctx1.pricing.totalPrice), '500');
console.log('  reply preview:', generateGuestReply(ctx1).split('\n')[2]);

// ── Test 2: has_alternatives (conflitto calendario) ───────────────────────────
console.log('\n=== Test 2: HAS_ALTERNATIVES (conflitto calendario) ===');
const ctx2 = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2025-07-05', checkout: '2025-07-12', guests: 2 },
  apartments, bookings, aptRules: [], inbox: [],
});
check('decision.type',          ctx2.decision.type,              'has_alternatives');
check('availability.isAvailable', String(ctx2.availability.isAvailable), 'false');
check('alternatives.count > 0', String(ctx2.alternatives.count > 0), 'true');
console.log('  reply preview:', generateGuestReply(ctx2).split('\n').slice(0,4).join(' | '));

// ── Test 3: outside_rules (non sabato-sabato) ─────────────────────────────────
console.log('\n=== Test 3: OUTSIDE_RULES (lun→lun, luglio) ===');
const ctx3 = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2025-07-07', checkout: '2025-07-14', guests: 2 },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type',   ctx3.decision.type,          'outside_rules');
check('stayRules.valid', String(ctx3.stayRules.valid), 'false');

// ── Test 4: needs_info (nessuna data) ────────────────────────────────────────
console.log('\n=== Test 4: NEEDS_INFO (nessuna data) ===');
const ctx4 = buildAgentContext({
  rawText: 'Ciao, avete disponibilità ad agosto?',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type', ctx4.decision.type, 'needs_info');

// ── Test A: full_month agosto (testo libero) ──────────────────────────────────
console.log('\n=== Test A: FULL_MONTH agosto — "Buongiorno, vorrei tutto agosto, siamo in 4." ===');
const ctxA = buildAgentContext({
  rawText: 'Buongiorno, vorrei tutto agosto, siamo in 4.',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type',    ctxA.decision.type,    'full_month');
check('isFullMonth',      String(ctxA.inquiry.isFullMonth), 'true');
check('fullMonthNum',     String(ctxA.inquiry.fullMonthNum), '8');
check('guests',           String(ctxA.inquiry.guests), '4');
check('pricing.total',    String(ctxA.pricing.totalPrice), '2600');
console.log('  reply:\n' + generateGuestReply(ctxA));

// ── Test B: full_month luglio (testo libero) ──────────────────────────────────
console.log('\n=== Test B: FULL_MONTH luglio — "Ciao, siamo in 3 e vorremmo tutto luglio." ===');
const ctxB = buildAgentContext({
  rawText: 'Ciao, siamo in 3 e vorremmo tutto luglio.',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type',  ctxB.decision.type,  'full_month');
check('fullMonthNum',   String(ctxB.inquiry.fullMonthNum), '7');
check('pricing.total',  String(ctxB.pricing.totalPrice), '2600');

// ── Test C: full_month giugno (testo libero) ──────────────────────────────────
console.log('\n=== Test C: FULL_MONTH giugno — "Buongiorno, vorrei il mese intero di giugno per 2 persone." ===');
const ctxC = buildAgentContext({
  rawText: 'Buongiorno, vorrei il mese intero di giugno per 2 persone.',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type',  ctxC.decision.type,  'full_month');
check('fullMonthNum',   String(ctxC.inquiry.fullMonthNum), '6');
check('pricing.total',  String(ctxC.pricing.totalPrice), '1600');

// ── Test D: available con prezzo (date esplicite) ─────────────────────────────
console.log('\n=== Test D: testo con date — "dal 9 al 16 agosto per 4 persone" ===');
const ctxD = buildAgentContext({
  rawText: 'Ciao, vorrei sapere se è disponibile dal 9 al 16 agosto per 4 persone.',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
// 9 agosto 2025 è sabato → checkout 16 agosto 2025 è sabato
console.log('  decision.type:',   ctxD.decision.type);
console.log('  checkin:',         ctxD.inquiry.checkin);
console.log('  checkout:',        ctxD.inquiry.checkout);
console.log('  pricing.total:',   ctxD.pricing.totalPrice);
console.log('  reply preview:',   generateGuestReply(ctxD).split('\n')[2]);

// ── Risultato ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
