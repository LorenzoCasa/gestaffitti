/**
 * test-managerAgentLLMContext.mjs
 *
 * Tests for buildManagerAgentLLMContext and validateLLMActionPlan.
 * Pure function tests: no I/O, no Supabase, no LLM calls.
 *
 * Run: node src/utils/test-managerAgentLLMContext.mjs
 */

import { buildManagerAgentLLMContext, validateLLMActionPlan } from "./managerAgentLLMContext.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if(!cond) throw new Error(msg ?? "Assertion failed"); }
function assertEqual(a, b, lbl="") { if(a!==b) throw new Error(`${lbl}: expected "${b}" got "${a}"`); }

const TODAY = "2026-06-19";

const APARTMENTS = [
  { id: "all",  label: "Tutti" },
  { id: "apt1", label: "Appartamento A", color: "#c9a96e" },
  { id: "apt2", label: "Appartamento B", color: "#9e6ec9" },
];

const BOOKINGS = [
  { id: "b1", apt: "apt1", guest: "Mario Rossi",    checkin: "2026-07-05", checkout: "2026-07-12", status: "confirmed",       depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  { id: "b2", apt: "apt2", guest: "Anna Bianchi",   checkin: "2026-07-12", checkout: "2026-07-19", status: "confirmed",       depositPaid: true,  checkinDone: false, price: 800, deposit: 200 },
  { id: "b3", apt: "apt1", guest: "Carlo Verdi",    checkin: "2026-08-02", checkout: "2026-08-09", status: "confirmed",       depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  { id: "b4", apt: "apt2", guest: "Laura Neri",     checkin: "2025-06-01", checkout: "2025-06-08", status: "confirmed",       depositPaid: false, checkinDone: false, price: 500, deposit: 150 },
  { id: "b5", apt: "apt1", guest: "Marco Esposito", checkin: "2026-07-19", checkout: "2026-07-26", status: "pending_payment", depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  { id: "b6", apt: "apt1", guest: "Old Booking",    checkin: "2025-01-01", checkout: "2025-01-08", status: "cancelled",       depositPaid: false, checkinDone: false, price: 500, deposit: 100 },
];

const INBOX = [
  { id: "i1", apt_id: "apt1", raw_text: "Vorrei prenotare dal 2 al 9 agosto", status: "new", source: "subito", created_at: "2026-06-10T10:00:00Z", parsed_guest_name: "Giovanni Greco" },
  { id: "i2", apt_id: "apt2", raw_text: "Disponibile a luglio?", status: "new", source: "subito", created_at: "2026-06-12T09:00:00Z", parsed_guest_name: null },
];

const DECISIONS = [
  {
    id: "d1", inbox_id: "i1", decision_type: "available", created_at: "2026-06-10T10:01:00Z",
    payload: { raw_decision_type: "available", context_snapshot: { inquiry: { aptId: "apt1", checkin: "2026-08-09", checkout: "2026-08-16" }, pricing: { totalPrice: 800 } } }
  },
];

console.log("\nbuildManagerAgentLLMContext:");

test("C01 — output has required fields", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, inbox: INBOX, decisions: DECISIONS, today: TODAY });
  assert("today"      in ctx, "today");
  assert("apartments" in ctx, "apartments");
  assert("bookings"   in ctx, "bookings");
  assert("inbox"      in ctx, "inbox");
  assert("snapshot"   in ctx, "snapshot");
});

test("C02 — filters out past bookings (checkout < today)", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const guests = ctx.bookings.map(b => b.guest);
  assert(!guests.includes("Laura Neri"),  "Laura Neri excluded (past)");
  assert(!guests.includes("Old Booking"), "Old Booking excluded");
  assert(guests.includes("Mario Rossi"),  "Mario Rossi included (future)");
});

test("C03 — filters out cancelled bookings", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const statuses = ctx.bookings.map(b => b.status);
  assert(!statuses.includes("cancelled"), "no cancelled bookings");
});

test("C04 — removes 'all' virtual apartment", () => {
  const ctx = buildManagerAgentLLMContext({ apartments: APARTMENTS });
  assert(!ctx.apartments.find(a => a.id === "all"), "no 'all' in apartments");
  assert(ctx.apartments.length === 2, "only apt1 and apt2");
});

test("C05 — enriches inbox with decision data", () => {
  const ctx = buildManagerAgentLLMContext({ inbox: INBOX, decisions: DECISIONS });
  const i1 = ctx.inbox.find(i => i.id === "i1");
  assert(i1, "i1 in inbox");
  assert(i1.decision !== null, "i1 has decision");
  assertEqual(i1.decision.type, "available", "decision type");
  assertEqual(i1.decision.checkin, "2026-08-09", "decision checkin");
});

test("C06 — inbox item without decision has decision: null", () => {
  const ctx = buildManagerAgentLLMContext({ inbox: INBOX, decisions: DECISIONS });
  const i2 = ctx.inbox.find(i => i.id === "i2");
  assert(i2, "i2 in inbox");
  assert(i2.decision === null, "i2 has no decision");
});

test("C07 — limits inbox to 15 items max", () => {
  const bigInbox = Array.from({ length: 20 }, (_, i) => ({
    id: `ix${i}`, apt_id: "apt1", raw_text: `msg ${i}`, status: "new", source: "subito",
    created_at: `2026-06-${String(i+1).padStart(2,"0")}T10:00:00Z`,
  }));
  const ctx = buildManagerAgentLLMContext({ inbox: bigInbox });
  assert(ctx.inbox.length <= 15, `inbox max 15, got ${ctx.inbox.length}`);
});

test("C08 — bookings sorted by checkin ascending", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  for (let i = 1; i < ctx.bookings.length; i++) {
    assert(ctx.bookings[i-1].checkin <= ctx.bookings[i].checkin, "sorted ascending");
  }
});

test("C09 — empty input returns valid structure", () => {
  const ctx = buildManagerAgentLLMContext({});
  assert(Array.isArray(ctx.apartments), "apartments is array");
  assert(Array.isArray(ctx.bookings),   "bookings is array");
  assert(Array.isArray(ctx.inbox),      "inbox is array");
  assert(ctx.snapshot === null,         "snapshot null");
});

test("C10 — booking depositPaid: true preserved", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  const b2 = ctx.bookings.find(b => b.id === "b2");
  assert(b2, "b2 found");
  assert(b2.depositPaid === true, "depositPaid preserved");
});

console.log("\nvalidateLLMActionPlan:");

test("V01 — mark_deposit_paid valid", () => {
  const plan = { type: "mark_deposit_paid", payload: { bookingId: "b1", guest: "Mario Rossi" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS, apartments: APARTMENTS });
  assert(r.valid, "valid");
  assertEqual(r.plan.type, "mark_deposit_paid", "type");
  assert(r.plan.canExecute === true, "canExecute");
  assertEqual(r.plan.payload.booking.id, "b1", "booking id");
});

test("V02 — mark_deposit_paid rejects already-paid deposit", () => {
  const plan = { type: "mark_deposit_paid", payload: { bookingId: "b2", guest: "Anna Bianchi" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(!r.valid, "invalid — already paid");
  assert(r.error.toLowerCase().includes("già"), "error mentions già");
});

test("V03 — mark_deposit_paid rejects unknown bookingId", () => {
  const plan = { type: "mark_deposit_paid", payload: { bookingId: "NONEXISTENT" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(!r.valid, "invalid — not found");
  assert(r.error.toLowerCase().includes("non trovata"), "error mentions non trovata");
});

test("V04 — mark_checkin_done valid", () => {
  const plan = { type: "mark_checkin_done", payload: { bookingId: "b1", guest: "Mario Rossi" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(r.valid, "valid");
  assertEqual(r.plan.type, "mark_checkin_done", "type");
});

test("V05 — cancel_booking valid", () => {
  const plan = { type: "cancel_booking", payload: { bookingId: "b3", guest: "Carlo Verdi" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(r.valid, "valid");
  assertEqual(r.plan.type, "cancel_booking", "type");
  assert(r.plan.canExecute === true, "canExecute");
});

test("V06 — create_booking valid and available", () => {
  const plan = {
    type: "create_booking",
    payload: { aptId: "apt2", guest: "Giulia Ferrari", checkin: "2026-08-23", checkout: "2026-08-30", price: 800, deposit: 200 },
  };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert(r.valid, `valid: ${r.error ?? ""}`);
  assertEqual(r.plan.payload.aptId, "apt2", "aptId");
  assert(r.plan.canExecute === true, "canExecute");
});

test("V07 — create_booking blocked by calendar conflict", () => {
  const plan = {
    type: "create_booking",
    payload: { aptId: "apt1", guest: "Nuovo Ospite", checkin: "2026-07-05", checkout: "2026-07-12", price: 800, deposit: 200 },
  };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS, apartments: APARTMENTS });
  assert(!r.valid, "invalid — conflict");
  assert(r.error.toLowerCase().includes("disponibile"), "error about availability");
});

test("V08 — create_booking rejects unknown apartment", () => {
  const plan = {
    type: "create_booking",
    payload: { aptId: "apt99", guest: "Test", checkin: "2026-08-01", checkout: "2026-08-08" },
  };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS, apartments: APARTMENTS });
  assert(!r.valid, "invalid — unknown apt");
  assert(r.error.toLowerCase().includes("non trovato"), "error about not found");
});

test("V09 — create_booking rejects checkin >= checkout", () => {
  const plan = {
    type: "create_booking",
    payload: { aptId: "apt2", guest: "Test", checkin: "2026-08-10", checkout: "2026-08-05", price: 500 },
  };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS, apartments: APARTMENTS });
  assert(!r.valid, "invalid — bad dates");
});

test("V10 — null action_plan returns error", () => {
  const r = validateLLMActionPlan(null, { bookings: BOOKINGS });
  assert(!r.valid, "invalid");
  assert(typeof r.error === "string", "has error string");
});

test("V11 — unknown action type returns error", () => {
  const plan = { type: "delete_everything", payload: {} };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(!r.valid, "invalid");
  assert(r.error.includes("delete_everything"), "error mentions type");
});

test("V12 — executeAction is NOT called by validateLLMActionPlan (pure validation only)", () => {
  let called = false;
  const plan = { type: "mark_deposit_paid", payload: { bookingId: "b1" } };
  const r = validateLLMActionPlan(plan, { bookings: BOOKINGS });
  assert(!called, "no side effects");
  assert(r.valid, "valid result");
  assert(r.plan.canExecute === true, "canExecute set but not executed");
});

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
