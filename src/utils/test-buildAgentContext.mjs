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

// ── Test F: needs_info (nessuna data, nessun mese) ────────────────────────────

console.log('\n=== Test F: NEEDS_INFO (nessuna data, nessun mese) ===');
const ctxF = buildAgentContext({
  rawText: 'Ciao, quando siete disponibili?',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type', ctxF.decision.type, 'needs_info');
check('non è flexible', String(ctxF.inquiry.isFlexibleDatesRequest), 'false');

// ── Nuovi test: richieste flessibili (agosto 2026) ────────────────────────────
//
// Sabati di agosto 2026: 1, 8, 15, 22, 29 (01/08/2026 = sabato)
// apt1 occupato prima settimana: 01/08 → 08/08
// apt2 libero tutto agosto
const bookingsAug = [
  { id: 'ba1', apt: 'apt1', checkin: '2026-08-01', checkout: '2026-08-08', status: 'confirmed', guest: 'Bianchi' },
];

// ── Test G: "due settimane di agosto" → windows nel mese ─────────────────────

console.log('\n=== Test G: "due settimane di agosto" → finestre disponibili in agosto ===');
const ctxG = buildAgentContext({
  rawText: 'Ciao, siamo in 4, vorremmo due settimane di agosto',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: bookingsAug, aptRules: [], inbox: [],
});
const replyG = generateGuestReply(ctxG);
check('decision.type', ctxG.decision.type, 'needs_info');
check('requestedMonth = 8',  String(ctxG.inquiry.requestedMonth),  '8');
check('requestedNights = 14', String(ctxG.inquiry.requestedNights), '14');
check('isFlexible = true', String(ctxG.inquiry.isFlexibleDatesRequest), 'true');
check('monthWindows trovate', String((ctxG.inquiry.monthWindows?.length ?? 0) > 0), 'true');
checkContains('reply mostra finestre agosto', replyG, 'agosto');
checkContains('reply propone date disponibili', replyG, '📅');
checkNotContains('reply non dice "ci mancano"', replyG, 'ci mancano');
console.log('  reply:\n' + replyG.split('\n').map(l => '    ' + l).join('\n'));

// ── Test H: "prima settimana di agosto" → position first ─────────────────────

console.log('\n=== Test H: "prima settimana di agosto" → position=first ===');
const ctxH = buildAgentContext({
  rawText: 'Ciao, vorrei la prima settimana di agosto per 4 persone',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: bookingsAug, aptRules: [], inbox: [],
});
const replyH = generateGuestReply(ctxH);
check('requestedMonth = 8',  String(ctxH.inquiry.requestedMonth),  '8');
check('requestedNights = 7', String(ctxH.inquiry.requestedNights),  '7');
check('position = first',    ctxH.inquiry.requestedWeekPosition, 'first');
check('guests = 4', String(ctxH.inquiry.guests), '4');
check('monthWindows trovate (la prima è occupata, propone la successiva)', String((ctxH.inquiry.monthWindows?.length ?? 0) > 0), 'true');
checkContains('reply agosto', replyH, 'agosto');
console.log('  reply:\n' + replyH.split('\n').map(l => '    ' + l).join('\n'));

// ── Test I: "avete disponibilità ad agosto?" → mese noto, nessuna durata ─────

console.log('\n=== Test I: "disponibilità ad agosto?" → chiede periodo ===');
const ctxI = buildAgentContext({
  rawText: 'Ciao, avete disponibilità ad agosto?',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: bookingsAug, aptRules: [], inbox: [],
});
const replyI = generateGuestReply(ctxI);
check('requestedMonth = 8', String(ctxI.inquiry.requestedMonth), '8');
check('requestedNights = null', String(ctxI.inquiry.requestedNights), 'null');
check('monthWindows = null (non cercate)', String(ctxI.inquiry.monthWindows), 'null');
check('decision.type = needs_info', ctxI.decision.type, 'needs_info');
checkContains('reply menziona agosto', replyI, 'agosto');
checkContains('reply chiede periodo', replyI, 'periodo');
checkNotContains('reply non dice "ci mancano"', replyI, 'ci mancano');
console.log('  reply:\n' + replyI.split('\n').map(l => '    ' + l).join('\n'));

// ── Test L: "prime due settimane di agosto" → position first_two ─────────────

console.log('\n=== Test L: "prime due settimane di agosto" → first_two ===');
const ctxL = buildAgentContext({
  rawText: 'Ciao, vorrei le prime due settimane di agosto',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: bookingsAug, aptRules: [], inbox: [],
});
check('requestedNights = 14',  String(ctxL.inquiry.requestedNights), '14');
check('position = first_two',  ctxL.inquiry.requestedWeekPosition, 'first_two');
check('monthWindows trovate',  String((ctxL.inquiry.monthWindows?.length ?? 0) > 0), 'true');

// ── Test M: "ultima settimana di luglio" → position last ─────────────────────

console.log('\n=== Test M: "ultima settimana di luglio" → position=last ===');
const ctxM = buildAgentContext({
  rawText: 'Ciao, cerco l\'ultima settimana di luglio per 2 persone',
  formData: { aptId: 'apt2', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('requestedMonth = 7',  String(ctxM.inquiry.requestedMonth), '7');
check('requestedNights = 7', String(ctxM.inquiry.requestedNights), '7');
check('position = last',     ctxM.inquiry.requestedWeekPosition, 'last');

// ── Test N: date precise non sabato-sabato → outside_rules ───────────────────

console.log('\n=== Test N: "dal 10 al 17 agosto" → outside_rules (lunedì-lunedì) ===');
const ctxN = buildAgentContext({
  rawText: 'Ciao, vorrei dal 10 al 17 agosto per 2 persone',
  formData: { aptId: 'apt1', source: 'subito' },
  apartments, bookings: [], aptRules: [], inbox: [],
});
check('decision.type = outside_rules', ctxN.decision.type, 'outside_rules');
check('checkin estratto', ctxN.inquiry.checkin, '2026-08-10');
check('checkout estratto', ctxN.inquiry.checkout, '2026-08-17');
check('isFlexible = false (date precise)', String(ctxN.inquiry.isFlexibleDatesRequest), 'false');

// ── Test O: apt1 occupato, apt2 libero → alternativa chiarita ────────────────

console.log('\n=== Test O: apt1 occupato 01/08 → alternativa su apt2 ===');
const ctxO = buildAgentContext({
  formData: { aptId: 'apt1', source: 'subito', checkin: '2026-08-01', checkout: '2026-08-08', guests: 3 },
  apartments, bookings: bookingsAug, aptRules: [], inbox: [],
});
const replyO = generateGuestReply(ctxO);
check('decision.type = has_alternatives', ctxO.decision.type, 'has_alternatives');
check('apt1 non disponibile', String(ctxO.availability.isAvailable), 'false');
checkContains('reply menziona Appartamento A', replyO, 'Appartamento A');
checkContains('reply propone Appartamento B', replyO, 'Appartamento B');
checkContains('reply dice "altro appartamento"', replyO, 'altro appartamento');
console.log('  reply:\n' + replyO.split('\n').map(l => '    ' + l).join('\n'));

// ── Risultato ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
