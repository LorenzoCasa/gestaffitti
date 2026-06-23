/**
 * test-agenticBrainNormalizer.mjs
 *
 * Tests for agenticBrainNormalizer.js
 * Pure function tests — no I/O, no Supabase, no LLM calls.
 *
 * Run: node src/utils/test-agenticBrainNormalizer.mjs
 */

import {
  normalizeOwnerMessage,
  extractSoftReferences,
  classifyOwnerIntent,
  detectMissingFields,
  buildClarificationQuestion,
  rankCandidateBookings,
  rankCandidateInboxRequests,
} from "./agenticBrainNormalizer.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? "Assertion failed"); }
function assertEqual(a, b, lbl = "") { if (a !== b) throw new Error(`${lbl}: expected "${b}" got "${a}"`); }
function assertContains(arr, val, lbl = "") {
  if (!Array.isArray(arr) || !arr.some(x => x === val || (x?.type ?? x) === val))
    throw new Error(`${lbl}: "${val}" not found in [${arr.map(x => x?.type ?? x).join(", ")}]`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOKING_CHECKIN = {
  id: "b1", apt: "apt1", guest: "Marco Rossi",
  checkin: "2026-06-21", checkout: "2026-06-28",
  status: "confirmed", depositPaid: false, checkinDone: false,
  price: 800, deposit: 200, guests: 2,
};
const BOOKING_FUTURE = {
  id: "b2", apt: "apt2", guest: "Famiglia Bianchi",
  checkin: "2026-08-01", checkout: "2026-08-15",
  status: "confirmed", depositPaid: false, checkinDone: false,
  price: 1600, deposit: 400, guests: 5,
};
const INBOX_SUBITO = {
  id: "i1", apt_id: "apt1", guest: "Luisa Verdi",
  status: "pending", source: "subito",
  preview: "Vorrei prenotare per agosto dal 10 al 17",
  received_at: "2026-06-20", decision: null,
};
const INBOX_EMAIL = {
  id: "i2", apt_id: "apt2", guest: "Paolo Neri",
  status: "pending", source: "email",
  preview: "Disponibilità luglio?",
  received_at: "2026-06-19", decision: null,
};

// ── N01–N06: classifyOwnerIntent — frasi naturali ─────────────────────────────

console.log("\nclassifyOwnerIntent — frasi naturali:");

test("N01 — 'quello di Subito ha confermato' → confirm_request", () => {
  const r = classifyOwnerIntent("quello di Subito ha confermato");
  assertEqual(r.intent, "confirm_request", "intent");
  assert(r.confidence >= 0.5, "confidence ok");
});

test("N02 — 'la signora dell'uno ha detto ok' → confirm_request", () => {
  const r = classifyOwnerIntent("la signora dell'uno ha detto ok");
  assertEqual(r.intent, "confirm_request", "intent");
});

test("N03 — 'segna l'acconto di quello di settembre' → mark_deposit_paid", () => {
  const r = classifyOwnerIntent("segna l'acconto di quello di settembre");
  assertEqual(r.intent, "mark_deposit_paid", "intent");
  assert(r.synonyms_matched.some(s => s === "acconto"), "matched acconto");
});

test("N04 — 'ha pagato la caparra' → mark_deposit_paid", () => {
  const r = classifyOwnerIntent("ha pagato la caparra");
  assertEqual(r.intent, "mark_deposit_paid", "intent");
});

test("N05 — 'quello dell'appartamento grande è arrivato' → mark_checkin_done", () => {
  const r = classifyOwnerIntent("quello dell'appartamento grande è arrivato");
  assertEqual(r.intent, "mark_checkin_done", "intent");
});

test("N06 — 'è partito' → mark_checkout_done", () => {
  const r = classifyOwnerIntent("è partito");
  assertEqual(r.intent, "mark_checkout_done", "intent");
});

// ── N07–N08: sinonimi ────────────────────────────────────────────────────────

console.log("\nSinonimi:");

test("N07 — sinonimi caparra: acconto / anticipo / deposito / versamento → mark_deposit_paid", () => {
  for (const syn of ["acconto", "anticipo", "deposito", "versamento", "ha versato"]) {
    const r = classifyOwnerIntent(`${syn} per la prenotazione`);
    assert(r.intent === "mark_deposit_paid", `"${syn}" → mark_deposit_paid (got ${r.intent})`);
  }
});

test("N08 — sinonimi check-in: entrato / ha fatto accesso / checkin → mark_checkin_done", () => {
  for (const syn of ["entrato", "ha fatto il check", "checkin", "è entrata", "arrivata"]) {
    const r = classifyOwnerIntent(`${syn} adesso`);
    assert(r.intent === "mark_checkin_done", `"${syn}" → mark_checkin_done (got ${r.intent})`);
  }
});

// ── N09: soft references ──────────────────────────────────────────────────────

console.log("\nextractSoftReferences:");

test("N09 — 'quello', 'lui', 'la famiglia' riconosciuti come soft references", () => {
  const refs1 = extractSoftReferences("quello di agosto");
  assert(refs1.some(r => r.type === "vague_person"), "quello → vague_person");

  const refs2 = extractSoftReferences("lui ha confermato");
  assert(refs2.some(r => r.type === "vague_person"), "lui → vague_person");

  const refs3 = extractSoftReferences("la famiglia di luglio è arrivata");
  assert(refs3.some(r => r.type === "family_group"), "la famiglia → family_group");

  const refs4 = extractSoftReferences("quello di Subito ha detto ok");
  assert(refs4.some(r => r.type === "inbox_subito"), "quello di Subito → inbox_subito");
});

// ── N10: missing fields → clarification ──────────────────────────────────────

console.log("\ndetectMissingFields + buildClarificationQuestion:");

test("N10 — mark_deposit_paid senza bookingId → clarification utile", () => {
  const { missing_fields, can_proceed } = detectMissingFields("mark_deposit_paid", {});
  assert(missing_fields.includes("bookingId"), "missing bookingId");
  assert(!can_proceed, "can_proceed false");

  const q = buildClarificationQuestion("mark_deposit_paid", missing_fields, {
    bookingCandidates: [BOOKING_CHECKIN, BOOKING_FUTURE],
  });
  assert(typeof q === "string" && q.length > 0, "question non vuota");
  assert(q.toLowerCase().includes("prenotazion") || q.toLowerCase().includes("riferis"), "question asks about booking");
});

// ── N11: market → no action_plan ─────────────────────────────────────────────

console.log("\nMarket intent — no action_plan:");

test("N11 — 'sto vendendo basso?' → market_analysis, no action_plan expected", () => {
  const r = classifyOwnerIntent("sto vendendo basso?");
  assertEqual(r.intent, "market_analysis", "intent market_analysis");
  // Normalizer returns a hint, not an action_plan — verify no action_plan field
  assert(!("action_plan" in r), "no action_plan in normalizer result");
});

// ── N12: rankCandidateBookings ────────────────────────────────────────────────

console.log("\nrankCandidateBookings:");

test("N12 — booking correntemente attivo (checkin passato, checkout futuro) rank più alto", () => {
  const today = "2026-06-22";
  const ranked = rankCandidateBookings([], [BOOKING_FUTURE, BOOKING_CHECKIN], { today });
  assert(ranked.length === 2, "two candidates");
  // BOOKING_CHECKIN: checkin 2026-06-21 <= today <= checkout 2026-06-28 → score +30
  // BOOKING_FUTURE: checkin 2026-08-01 > today → score +5 only
  assertEqual(ranked[0].booking.id, "b1", "currently checked-in booking ranks first");
});

// ── N13: detectMissingFields create_booking ───────────────────────────────────

console.log("\ndetectMissingFields — create_booking:");

test("N13 — create_booking senza dati → tutti i campi mancanti", () => {
  const { missing_fields, can_proceed } = detectMissingFields("create_booking", {});
  assert(missing_fields.includes("aptId"),    "missing aptId");
  assert(missing_fields.includes("guest"),    "missing guest");
  assert(missing_fields.includes("checkin"),  "missing checkin");
  assert(missing_fields.includes("checkout"), "missing checkout");
  assert(!can_proceed, "can_proceed false");
});

test("N13b — create_booking con tutti i dati → can_proceed true", () => {
  const { missing_fields, can_proceed } = detectMissingFields("create_booking", {
    aptId: "apt1", guest: "Mario Rossi", checkin: "2026-07-05", checkout: "2026-07-12",
  });
  assertEqual(missing_fields.length, 0, "no missing");
  assert(can_proceed, "can_proceed true");
});

// ── N14: normalizeOwnerMessage ────────────────────────────────────────────────

console.log("\nnormalizeOwnerMessage:");

test("N14 — normalizza accenti e minuscole", () => {
  const r = normalizeOwnerMessage("È Arrivàto");
  assert(r.normalized === "e arrivato" || r.normalized.includes("arrivato"), "normalized contains arrivato");
  assertEqual(r.original, "È Arrivàto", "original preserved");
});

test("N14b — frase vocale senza punteggiatura → is_voice true", () => {
  const r = normalizeOwnerMessage("quello di agosto ha confermato");
  assert(r.is_voice === true, "is_voice true");
});

// ── N15: show_today_tasks ─────────────────────────────────────────────────────

console.log("\nshow_today_tasks:");

test("N15 — 'fammi il punto di oggi' → show_today_tasks", () => {
  const r = classifyOwnerIntent("fammi il punto di oggi");
  assertEqual(r.intent, "show_today_tasks", "intent");
  assert(r.confidence >= 0.7, "confidence ok");
});

// ── N16: rankCandidateInboxRequests ──────────────────────────────────────────

console.log("\nrankCandidateInboxRequests:");

test("N16 — soft ref 'inbox_subito' boostra il record Subito", () => {
  const softRefs = [{ type: "inbox_subito", raw: "quello di Subito", confidence: 0.7 }];
  const ranked = rankCandidateInboxRequests(softRefs, [INBOX_EMAIL, INBOX_SUBITO]);
  assertEqual(ranked[0].item.id, "i1", "Subito item ranks first");
});

// ── N17: mark_checkout_done ───────────────────────────────────────────────────

console.log("\nmark_checkout_done:");

test("N17 — 'sono partiti stamattina' → mark_checkout_done", () => {
  const r = classifyOwnerIntent("sono partiti stamattina");
  assertEqual(r.intent, "mark_checkout_done", "intent");
});

test("N17b — detectMissingFields mark_checkout_done senza bookingId → missing", () => {
  const { missing_fields } = detectMissingFields("mark_checkout_done", {});
  assert(missing_fields.includes("bookingId"), "missing bookingId");
});

// ── N18: selectedBookingId priority ──────────────────────────────────────────

console.log("\nselectedBookingId priority:");

test("N18 — selectedBookingId nella context boostra il booking corrispondente", () => {
  const ranked = rankCandidateBookings([], [BOOKING_CHECKIN, BOOKING_FUTURE], {
    today: "2026-06-22", selectedBookingId: "b2",
  });
  assertEqual(ranked[0].booking.id, "b2", "selected booking ranks first");
  assert(ranked[0].reasons.includes("selectedBookingId match"), "reason present");
});

// ── N19: buildClarificationQuestion con opzioni ───────────────────────────────

console.log("\nbuildClarificationQuestion con candidati multipli:");

test("N19 — 2 candidati → clarification lista numerata", () => {
  const q = buildClarificationQuestion("mark_deposit_paid", ["bookingId"], {
    bookingCandidates: [BOOKING_CHECKIN, BOOKING_FUTURE],
  });
  assert(q.includes("1."), "has option 1");
  assert(q.includes("2."), "has option 2");
  assert(q.toLowerCase().includes("marco rossi") || q.toLowerCase().includes("bianchi"), "contains guest names");
});

test("N19b — 0 candidati → clarification generica", () => {
  const q = buildClarificationQuestion("mark_checkin_done", ["bookingId"], {
    bookingCandidates: [],
  });
  assert(typeof q === "string" && q.length > 0, "question present");
  assert(!q.includes("1."), "no numbered list without candidates");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
