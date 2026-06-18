/**
 * test-managerAgentCommands.mjs — Unit tests for managerAgentCommands.js
 *
 * Pure function tests: parseOwnerCommand, validateCommand, planAction.
 * No Supabase, no I/O.
 *
 * Run: node src/utils/test-managerAgentCommands.mjs
 */

import { parseOwnerCommand, validateCommand, planAction } from "./managerAgentCommands.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`${label} expected "${expected}" got "${actual}"`);
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const APARTMENTS = [
  { id: "apt1", label: "Appartamento A", color: "#c9a96e" },
  { id: "apt2", label: "Appartamento B", color: "#9e6ec9" },
];

const BOOKINGS = [
  { id: "b1", apt: "apt1", guest: "Mario Rossi",   checkin: "2026-07-05", checkout: "2026-07-12", status: "confirmed", depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  { id: "b2", apt: "apt2", guest: "Anna Bianchi",  checkin: "2026-07-12", checkout: "2026-07-19", status: "confirmed", depositPaid: true,  checkinDone: true,  price: 800, deposit: 200 },
  { id: "b3", apt: "apt1", guest: "Carlo Verdi",   checkin: "2026-08-02", checkout: "2026-08-09", status: "confirmed", depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  { id: "b4", apt: "apt2", guest: "Laura Neri",    checkin: "2026-09-06", checkout: "2026-09-13", status: "cancelled", depositPaid: false, checkinDone: false, price: 500, deposit: 150 },
];

const TODAY = "2026-06-18";

// ── Parse: intent detection ───────────────────────────────────────────────────

console.log("\nParse — intent detection:");

test("T01 — show_today_tasks: 'cosa ho oggi'", () => {
  const r = parseOwnerCommand("cosa ho oggi", { apartments: APARTMENTS });
  assertEqual(r.intent, "show_today_tasks");
});

test("T02 — show_today_tasks: 'cosa devo fare'", () => {
  const r = parseOwnerCommand("cosa devo fare", { apartments: APARTMENTS });
  assertEqual(r.intent, "show_today_tasks");
});

test("T03 — create_booking: 'crea prenotazione'", () => {
  const r = parseOwnerCommand("crea prenotazione per Giovanni Greco in apt1 dal 19/7 al 26/7 prezzo 800", { apartments: APARTMENTS });
  assertEqual(r.intent, "create_booking");
});

test("T04 — mark_deposit_paid: 'caparra ricevuta di Rossi'", () => {
  const r = parseOwnerCommand("caparra ricevuta di Rossi", { apartments: APARTMENTS });
  assertEqual(r.intent, "mark_deposit_paid");
});

test("T05 — mark_deposit_paid: 'segna caparra pagata'", () => {
  const r = parseOwnerCommand("segna caparra pagata di Verdi", { apartments: APARTMENTS });
  assertEqual(r.intent, "mark_deposit_paid");
});

test("T06 — mark_checkin_done: 'check-in fatto di Bianchi'", () => {
  const r = parseOwnerCommand("check-in fatto di Bianchi", { apartments: APARTMENTS });
  assertEqual(r.intent, "mark_checkin_done");
});

test("T07 — mark_checkin_done: 'registra check-in di Rossi'", () => {
  const r = parseOwnerCommand("registra check-in di Rossi", { apartments: APARTMENTS });
  assertEqual(r.intent, "mark_checkin_done");
});

test("T08 — cancel_booking: 'cancella prenotazione di Verdi'", () => {
  const r = parseOwnerCommand("cancella prenotazione di Verdi", { apartments: APARTMENTS });
  assertEqual(r.intent, "cancel_booking");
});

test("T09 — unknown_command: unrecognized text", () => {
  const r = parseOwnerCommand("buongiorno come stai", { apartments: APARTMENTS });
  assertEqual(r.intent, "unknown_command");
});

// ── Parse: param extraction ───────────────────────────────────────────────────

console.log("\nParse — param extraction:");

test("T10 — create_booking: parses date dd/mm al dd/mm", () => {
  const r = parseOwnerCommand("crea prenotazione per Giovanni Greco in apt1 dal 19/7 al 26/7 prezzo 800", { apartments: APARTMENTS });
  assertEqual(r.rawParams.checkin,  "2026-07-19", "checkin");
  assertEqual(r.rawParams.checkout, "2026-07-26", "checkout");
});

test("T11 — create_booking: parses apt1 by ID", () => {
  const r = parseOwnerCommand("crea prenotazione per Giovanni Greco in apt1 dal 19/7 al 26/7 prezzo 800", { apartments: APARTMENTS });
  assertEqual(r.rawParams.aptId, "apt1", "aptId");
});

test("T12 — create_booking: parses apt by label 'Appartamento A'", () => {
  const r = parseOwnerCommand("crea prenotazione per Maria Conti in Appartamento A dal 19/7 al 26/7 prezzo 800", { apartments: APARTMENTS });
  assertEqual(r.rawParams.aptId, "apt1", "aptId from label");
});

test("T13 — create_booking: parses price", () => {
  const r = parseOwnerCommand("crea prenotazione per Giovanni Greco in apt1 dal 19/7 al 26/7 prezzo 800 caparra 200", { apartments: APARTMENTS });
  assertEqual(r.rawParams.price,   800, "price");
  assertEqual(r.rawParams.deposit, 200, "deposit");
});

test("T14 — create_booking: parses textual date 'dal 19 luglio al 26 luglio'", () => {
  const r = parseOwnerCommand("crea prenotazione per Marco Esposito in apt2 dal 19 luglio al 26 luglio prezzo 800", { apartments: APARTMENTS });
  assertEqual(r.rawParams.checkin,  "2026-07-19", "checkin textual");
  assertEqual(r.rawParams.checkout, "2026-07-26", "checkout textual");
});

test("T15 — mark_deposit_paid: extracts guestRef 'di Rossi'", () => {
  const r = parseOwnerCommand("caparra ricevuta di Rossi", { apartments: APARTMENTS });
  assertEqual(r.rawParams.guestRef, "Rossi", "guestRef");
});

test("T16 — cancel_booking: extracts guestRef 'di Verdi'", () => {
  const r = parseOwnerCommand("cancella prenotazione di Carlo Verdi", { apartments: APARTMENTS });
  assertEqual(r.rawParams.guestRef, "Carlo Verdi", "guestRef full name");
});

// ── Validate: show_today_tasks ────────────────────────────────────────────────

console.log("\nValidate — show_today_tasks:");

test("T17 — show_today_tasks always valid", () => {
  const parsed    = { intent: "show_today_tasks", rawParams: {} };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(validated.valid, "should be valid");
  assertEqual(validated.errors.length, 0, "no errors");
});

// ── Validate: unknown_command ─────────────────────────────────────────────────

console.log("\nValidate — unknown_command:");

test("T18 — unknown_command returns invalid with error message", () => {
  const parsed    = { intent: "unknown_command", rawParams: {} };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "should be invalid");
  assert(validated.errors.length > 0, "should have errors");
});

// ── Validate: create_booking ──────────────────────────────────────────────────

console.log("\nValidate — create_booking:");

test("T19 — valid create_booking (no conflict)", () => {
  const parsed = {
    intent: "create_booking",
    rawParams: { guest: "Giovanni Greco", aptId: "apt1", checkin: "2026-07-19", checkout: "2026-07-26", price: 800, deposit: 200, guests: 2 },
  };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(validated.valid, "should be valid — no conflict in that window");
  assertEqual(validated.errors.length, 0, "no errors");
});

test("T20 — create_booking conflict (apt1 July 5-12 occupied by Rossi)", () => {
  const parsed = {
    intent: "create_booking",
    rawParams: { guest: "Nuovo Cliente", aptId: "apt1", checkin: "2026-07-07", checkout: "2026-07-14", price: 800, deposit: 0, guests: null },
  };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "should be invalid due to conflict");
  assert(validated.errors.some(e => e.includes("Conflitto")), "should mention Conflitto");
});

test("T21 — create_booking missing guest → error", () => {
  const parsed = {
    intent: "create_booking",
    rawParams: { guest: null, aptId: "apt1", checkin: "2026-07-19", checkout: "2026-07-26", price: 800 },
  };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid when guest missing");
  assert(validated.errors.some(e => e.includes("ospite")), "mentions ospite");
});

test("T22 — create_booking missing aptId → error", () => {
  const parsed = {
    intent: "create_booking",
    rawParams: { guest: "Test", aptId: null, checkin: "2026-07-19", checkout: "2026-07-26", price: 800 },
  };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid when apt missing");
  assert(validated.errors.some(e => e.includes("Appartamento")), "mentions Appartamento");
});

test("T23 — create_booking missing price → error", () => {
  const parsed = {
    intent: "create_booking",
    rawParams: { guest: "Test", aptId: "apt1", checkin: "2026-07-19", checkout: "2026-07-26", price: null },
  };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid when price missing");
  assert(validated.errors.some(e => e.includes("Prezzo")), "mentions Prezzo");
});

// ── Validate: mark_deposit_paid ───────────────────────────────────────────────

console.log("\nValidate — mark_deposit_paid:");

test("T24 — valid mark_deposit_paid for Rossi (deposit not yet paid)", () => {
  const parsed    = { intent: "mark_deposit_paid", rawParams: { guestRef: "Rossi" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(validated.valid, "should be valid");
  assertEqual(validated.payload.booking.id, "b1", "finds b1");
});

test("T25 — mark_deposit_paid for Bianchi already paid → error", () => {
  const parsed    = { intent: "mark_deposit_paid", rawParams: { guestRef: "Bianchi" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "should be invalid — already paid");
  assert(validated.errors.some(e => e.includes("già")), "mentions già");
});

test("T26 — mark_deposit_paid no guestRef → error", () => {
  const parsed    = { intent: "mark_deposit_paid", rawParams: { guestRef: null } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid when no guestRef");
});

test("T27 — mark_deposit_paid unknown guest → error", () => {
  const parsed    = { intent: "mark_deposit_paid", rawParams: { guestRef: "Sconosciuto" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid for unknown guest");
  assert(validated.errors.some(e => e.includes("Nessuna")), "mentions Nessuna");
});

// ── Validate: mark_checkin_done ───────────────────────────────────────────────

console.log("\nValidate — mark_checkin_done:");

test("T28 — valid mark_checkin_done for Rossi", () => {
  const parsed    = { intent: "mark_checkin_done", rawParams: { guestRef: "Rossi" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(validated.valid, "should be valid");
  assertEqual(validated.payload.booking.id, "b1", "finds b1");
});

test("T29 — mark_checkin_done for Bianchi already done → error", () => {
  const parsed    = { intent: "mark_checkin_done", rawParams: { guestRef: "Bianchi" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid — already done");
});

// ── Validate: cancel_booking ──────────────────────────────────────────────────

console.log("\nValidate — cancel_booking:");

test("T30 — valid cancel_booking for Rossi", () => {
  const parsed    = { intent: "cancel_booking", rawParams: { guestRef: "Rossi" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(validated.valid, "should be valid");
  assertEqual(validated.payload.booking.id, "b1", "finds b1");
});

test("T31 — cancel_booking for Neri (already cancelled) → error", () => {
  const parsed    = { intent: "cancel_booking", rawParams: { guestRef: "Neri" } };
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(!validated.valid, "invalid — already cancelled");
  assert(validated.errors.some(e => e.includes("già")), "mentions già");
});

// ── planAction ────────────────────────────────────────────────────────────────

console.log("\nplanAction:");

test("T32 — invalid validated → canExecute=false", () => {
  const parsed    = { intent: "unknown_command", rawParams: {} };
  const validated = { valid: false, errors: ["Comando non riconosciuto."], payload: {} };
  const plan      = planAction(parsed, validated);
  assert(!plan.canExecute, "canExecute=false");
  assert(plan.payload === null, "payload null");
  assert(!plan.confirmRequired, "no confirm needed");
});

test("T33 — show_today_tasks → canExecute=true, confirmRequired=false", () => {
  const parsed    = { intent: "show_today_tasks", rawParams: {} };
  const validated = { valid: true, errors: [], payload: {} };
  const plan      = planAction(parsed, validated);
  assert(plan.canExecute, "canExecute=true");
  assert(!plan.confirmRequired, "no confirm for show_today");
});

test("T34 — valid create_booking → canExecute=true, confirmRequired=true", () => {
  const payload   = { guest: "Giovanni", aptId: "apt1", checkin: "2026-07-19", checkout: "2026-07-26", price: 800, deposit: 200 };
  const parsed    = { intent: "create_booking", rawParams: payload };
  const validated = { valid: true, errors: [], payload };
  const plan      = planAction(parsed, validated);
  assert(plan.canExecute, "canExecute");
  assert(plan.confirmRequired, "confirmRequired");
  assert(plan.message.includes("Giovanni"), "message includes guest name");
  assert(plan.message.includes("apt1"), "message includes aptId");
  assert(plan.message.includes("800"), "message includes price");
});

test("T35 — valid mark_deposit_paid → message includes guest name", () => {
  const booking   = { id: "b1", guest: "Mario Rossi", apt: "apt1", checkin: "2026-07-05" };
  const parsed    = { intent: "mark_deposit_paid", rawParams: { guestRef: "Rossi" } };
  const validated = { valid: true, errors: [], payload: { booking } };
  const plan      = planAction(parsed, validated);
  assert(plan.canExecute, "canExecute");
  assert(plan.message.includes("Mario Rossi"), "message includes full guest name");
});

test("T36 — full pipeline: 'cosa ho oggi' → show_today_tasks canExecute", () => {
  const parsed    = parseOwnerCommand("cosa ho oggi", { apartments: APARTMENTS });
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const plan      = planAction(parsed, validated);
  assertEqual(plan.type, "show_today_tasks");
  assert(plan.canExecute);
  assert(!plan.confirmRequired);
});

test("T37 — full pipeline: 'caparra ricevuta di Rossi' → valid plan", () => {
  const parsed    = parseOwnerCommand("caparra ricevuta di Rossi", { apartments: APARTMENTS });
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const plan      = planAction(parsed, validated);
  assertEqual(plan.type, "mark_deposit_paid");
  assert(plan.canExecute);
  assert(plan.confirmRequired);
  assert(plan.message.includes("Rossi"));
});

test("T38 — full pipeline: conflicting create_booking → canExecute=false", () => {
  const cmd = "crea prenotazione per Nuovo Cliente in apt1 dal 7/7 al 14/7 prezzo 800";
  const parsed    = parseOwnerCommand(cmd, { apartments: APARTMENTS });
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const plan      = planAction(parsed, validated);
  assertEqual(plan.type, "create_booking");
  assert(!plan.canExecute, "conflict → canExecute=false");
  assert(plan.message.includes("Conflitto"), "message has Conflitto");
});

test("T39 — full pipeline: 'cancella prenotazione di Carlo Verdi' → valid plan", () => {
  const parsed    = parseOwnerCommand("cancella prenotazione di Carlo Verdi", { apartments: APARTMENTS });
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const plan      = planAction(parsed, validated);
  assertEqual(plan.type, "cancel_booking");
  assert(plan.canExecute);
  assert(plan.message.includes("Carlo Verdi"));
});

test("T40 — full pipeline: mark_checkin_done for already-done guest → canExecute=false", () => {
  const parsed    = parseOwnerCommand("check-in fatto di Bianchi", { apartments: APARTMENTS });
  const validated = validateCommand(parsed, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const plan      = planAction(parsed, validated);
  assert(!plan.canExecute, "already done → cannot execute");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
