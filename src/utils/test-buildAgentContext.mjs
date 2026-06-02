/**
 * Manual node test for buildAgentContext + generateGuestReply + resolveListingFromTitle.
 * Run: node src/utils/test-buildAgentContext.mjs
 */

import { buildAgentContext }                        from './buildAgentContext.js';
import { generateGuestReply }                       from './generateGuestReply.js';
import { resolveListingFromTitle, extractListingTitle } from './agentListingResolver.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const apartments = [
  { id: 'apt1', label: 'Appartamento A', color: '#6e9ec9' },
  { id: 'apt2', label: 'Appartamento B', color: '#c96e9e' },
];

// apt1 occupato 2025-07-05 → 2025-07-12
// apt2 libero tutto luglio
const bookings = [
  { id: 'b1', apt: 'apt1', checkin: '2025-07-05', checkout: '2025-07-12', status: 'confirmed', guest: 'Rossi' },
];

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
    console.log(`      testo non contiene: "${substring}"`);
    console.log(`      testo: "${actual?.slice(0, 200)}"`);
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
    console.log(`      testo: "${actual?.slice(0, 200)}"`);
    fail++;
  }
}

// ── Resolver Tests ────────────────────────────────────────────────────────────

console.log('\n=== RESOLVER: mapping esplicito titolo → aptId ===');

check('titolo apt1 → apt1',
  resolveListingFromTitle('Lungomare Senigallia appartamento estivo 1', apartments),
  'apt1');

check('titolo apt2 → apt2',
  resolveListingFromTitle('Lungomare Senigallia appartamento estivo 2', apartments),
  'apt2');

check('titolo contenente apt1 → apt1',
  resolveListingFromTitle('RE: Lungomare Senigallia appartamento estivo 1 - domanda ospite', apartments),
  'apt1');

check('titolo sconosciuto → null',
  resolveListingFromTitle('Appartamento economico al mare', apartments),
  null);

check('titolo null → null',
  resolveListingFromTitle(null, apartments),
  null);

check('label apt1 → apt1',
  resolveListingFromTitle('Appartamento A', apartments),
  'apt1');

// ── extractListingTitle: priorità campi raw_metadata ─────────────────────────

console.log('\n=== extractListingTitle: priorità campi raw_metadata ===');

check('listing_title ha priorità su email_subject',
  extractListingTitle({ listing_title: 'Lungomare Senigallia appartamento estivo 1', email_subject: 'Altro' }),
  'Lungomare Senigallia appartamento estivo 1');

check('email_subject usato se listing_title assente',
  extractListingTitle({ email_subject: 'Lungomare Senigallia appartamento estivo 2' }),
  'Lungomare Senigallia appartamento estivo 2');

check('subject come fallback finale',
  extractListingTitle({ subject: 'Lungomare Senigallia appartamento estivo 1' }),
  'Lungomare Senigallia appartamento estivo 1');

check('null se tutti assenti',
  extractListingTitle({}),
  null);

check('null se rawMetadata è null',
  extractListingTitle(null),
  null);

// ── Integrazione Make reale ───────────────────────────────────────────────────

console.log('\n=== Integrazione Make: email_subject → apt ===');

const metaMake1 = { email_subject: 'Lungomare Senigallia appartamento estivo 1', email_from: 'noreply@subito.it' };
check('Make email_subject → apt1',
  resolveListingFromTitle(extractListingTitle(metaMake1), apartments),
  'apt1');

const metaMake2 = { email_subject: 'Lungomare Senigallia appartamento estivo 2' };
check('Make email_subject → apt2',
  resolveListingFromTitle(extractListingTitle(metaMake2), apartments),
  'apt2');

const metaUnknown = { email_subject: 'Annuncio approvato' };
check('email non cliente → null',
  resolveListingFromTitle(extractListingTitle(metaUnknown), apartments),
  null);

// ── Test A: apt1 libero → disponibile ────────────────────────────────────────

console.log('\n=== Test A: apt1 libero → available ===');
const ctxA = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2025-06-28', checkout: '2025-07-05', guests: 2 },
  apartments, bookings, aptRules: [], inbox: [],
});
const replyA = generateGuestReply(ctxA);
check('decision.type',              ctxA.decision.type,              'available');
check('availability.isAvailable',   String(ctxA.availability.isAvailable), 'true');
checkContains('reply menziona apt1', replyA, 'Appartamento A');
console.log('  reply:\n' + replyA.split('\n').map(l => '    ' + l).join('\n'));

// ── Test B: apt1 occupato, apt2 libero → ha_alternatives con altro apt ────────

console.log('\n=== Test B: apt1 occupato, apt2 libero → has_alternatives con Appartamento B ===');
const ctxB = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2025-07-05', checkout: '2025-07-12', guests: 2 },
  apartments, bookings, aptRules: [], inbox: [],
});
const replyB = generateGuestReply(ctxB);
check('decision.type',              ctxB.decision.type,              'has_alternatives');
check('availability.isAvailable',   String(ctxB.availability.isAvailable), 'false');
checkContains('reply menziona apt1 non disponibile', replyB, 'Appartamento A');
checkContains('reply menziona Appartamento B',        replyB, 'Appartamento B');
checkContains('reply ha sezione altro appartamento',  replyB, 'altro appartamento');
checkNotContains('reply non dice generico disponibile', replyB, 'è disponibile');
console.log('  reply:\n' + replyB.split('\n').map(l => '    ' + l).join('\n'));

// ── Test C: apt2 occupato, apt1 libero → has_alternatives con altro apt ────────

console.log('\n=== Test C: apt2 occupato, apt1 libero → has_alternatives con Appartamento A ===');
const bookingsC = [
  { id: 'b2', apt: 'apt2', checkin: '2025-07-05', checkout: '2025-07-12', status: 'confirmed', guest: 'Bianchi' },
];
const ctxC = buildAgentContext({
  formData: { aptId: 'apt2', source: 'subito', checkin: '2025-07-05', checkout: '2025-07-12', guests: 2 },
  apartments, bookings: bookingsC, aptRules: [], inbox: [],
});
const replyC = generateGuestReply(ctxC);
check('decision.type',              ctxC.decision.type,              'has_alternatives');
check('availability.isAvailable',   String(ctxC.availability.isAvailable), 'false');
checkContains('reply menziona apt2 non disponibile', replyC, 'Appartamento B');
checkContains('reply menziona Appartamento A',        replyC, 'Appartamento A');
checkContains('reply ha sezione altro appartamento',  replyC, 'altro appartamento');
console.log('  reply:\n' + replyC.split('\n').map(l => '    ' + l).join('\n'));

// ── Test D: aptId vuoto → buildAgentContext senza fallback silenzioso ─────────

console.log('\n=== Test D: aptId vuoto → nessun fallback a apt1 ===');
const ctxD = buildAgentContext({
  formData: { aptId: '', source: 'subito', checkin: '2025-07-05', checkout: '2025-07-12', guests: 2 },
  apartments, bookings, aptRules: [], inbox: [],
});
check('inquiry.aptId è stringa vuota', ctxD.inquiry.aptId, '');
check('apartment.id non è apt1', ctxD.apartment.id !== 'apt1' ? 'ok' : 'fallback!', 'ok');

// ── Test E: mese intero ────────────────────────────────────────────────────────

console.log('\n=== Test E: FULL_MONTH agosto ===');
const ctxE = buildAgentContext({
  rawText: 'Buongiorno, vorrei tutto agosto, siamo in 4.',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type',   ctxE.decision.type,   'full_month');
check('fullMonthNum',    String(ctxE.inquiry.fullMonthNum), '8');
check('pricing.total',   String(ctxE.pricing.totalPrice), '2600');

// ── Test F: needs_info ─────────────────────────────────────────────────────────

console.log('\n=== Test F: NEEDS_INFO (nessuna data) ===');
const ctxF = buildAgentContext({
  rawText: 'Ciao, avete disponibilità ad agosto?',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type', ctxF.decision.type, 'needs_info');

// ── Risultato ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
