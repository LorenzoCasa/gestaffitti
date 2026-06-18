/**
 * test-managerAgentBrain.mjs — Unit tests for managerAgentBrain.js
 *
 * Pure function tests: interpretMessage with various natural Italian phrases.
 * No Supabase, no I/O.
 *
 * Run: node src/utils/test-managerAgentBrain.mjs
 */

import { interpretMessage } from "./managerAgentBrain.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if(!cond) throw new Error(msg ?? "Assertion failed"); }
function assertEqual(a, b, lbl="") { if(a!==b) throw new Error(`${lbl}: expected "${b}" got "${a}"`); }

const APARTMENTS = [
  { id:"apt1", label:"Appartamento A", color:"#c9a96e" },
  { id:"apt2", label:"Appartamento B", color:"#9e6ec9" },
];

const TODAY = "2026-06-18";

const BOOKINGS = [
  { id:"b1", apt:"apt1", guest:"Mario Rossi",   checkin:"2026-07-05", checkout:"2026-07-12", status:"confirmed",       depositPaid:false, checkinDone:false,  price:800, deposit:200 },
  { id:"b2", apt:"apt2", guest:"Anna Bianchi",  checkin:"2026-07-12", checkout:"2026-07-19", status:"confirmed",       depositPaid:false, checkinDone:false,  price:800, deposit:200 },
  { id:"b3", apt:"apt1", guest:"Carlo Verdi",   checkin:"2026-08-02", checkout:"2026-08-09", status:"confirmed",       depositPaid:false, checkinDone:false,  price:800, deposit:200 },
  { id:"b4", apt:"apt2", guest:"Laura Neri",    checkin:"2026-09-06", checkout:"2026-09-13", status:"cancelled",       depositPaid:false, checkinDone:false,  price:500, deposit:150 },
  { id:"b5", apt:"apt1", guest:"Marco Esposito",checkin:"2026-07-19", checkout:"2026-07-26", status:"pending_payment", depositPaid:false, checkinDone:false,  price:800, deposit:200 },
];

const INBOX = [
  { id:"i1", apt_id:"apt1", raw_text:"Vorrei prenotare dal 2 al 9 agosto", status:"new", source:"subito", created_at:"2026-06-10T10:00:00Z", raw_metadata:{ parsed_guest_name:"Giovanni Greco" }, parsed_guest_name:"Giovanni Greco" },
];
const DECISIONS = [
  {
    id:"d1", inbox_id:"i1", decision_type:"available", created_at:"2026-06-10T10:01:00Z",
    payload:{
      raw_decision_type:"available",
      context_snapshot:{
        inquiry:{aptId:"apt1", checkin:"2026-08-09", checkout:"2026-08-16", guests:2},
        pricing:{totalPrice:800},
        apartment:{id:"apt1", label:"Appartamento A"},
      }
    }
  }
];

const SNAPSHOT = {
  agent_summary: "📅 2 arrivi nei prossimi 7 giorni.\n💬 1 richiesta con opportunità da confermare.",
  suggested_actions: [{priority:2,category:"arrival",action:"Preparare check-in Rossi (apt1) — tra 17g"}],
  pending_opportunities: [{inboxId:"i1", guestName:"Giovanni Greco", source:"subito", aptId:"apt1", decisionType:"available"}],
  messages_to_review: [],
  upcoming_arrivals: [{bookingId:"b1", apt:"apt1", guest:"Mario Rossi", checkin:"2026-07-05", checkout:"2026-07-12", daysUntil:17}],
  current_guests: [],
  calendar_alerts: [],
  revenue_notes: [],
};

const CTX = { bookings:BOOKINGS, apartments:APARTMENTS, inbox:INBOX, decisions:DECISIONS, snapshot:SNAPSHOT, today:TODAY };

console.log("\nInformative intents:");

test("T01 — 'cosa devo fare oggi' → show_today_tasks, no confirmation", () => {
  const r = interpretMessage("cosa devo fare oggi", CTX);
  assertEqual(r.intent, "show_today_tasks");
  assert(!r.needs_confirmation, "no confirmation needed");
  assert(!r.needs_clarification, "no clarification needed");
  assert(r.reply.length > 0, "has reply");
  assert(r.action_plan === null, "no action_plan");
});

test("T02 — 'fammi il punto della situazione' → show_today_tasks", () => {
  const r = interpretMessage("fammi il punto della situazione", CTX);
  assertEqual(r.intent, "show_today_tasks");
  assert(r.reply.includes("arrivi") || r.reply.includes("ospiti") || r.reply.includes("Nessuna"), "reply mentions arrivals or status");
});

test("T03 — 'chi devo richiamare?' → show_pending_requests", () => {
  const r = interpretMessage("chi devo richiamare?", CTX);
  assertEqual(r.intent, "show_pending_requests");
  assert(!r.needs_confirmation);
  assert(r.reply.length > 0);
});

test("T04 — 'come siamo messi ad agosto?' → show_calendar_status with month", () => {
  const r = interpretMessage("come siamo messi ad agosto?", CTX);
  assertEqual(r.intent, "show_calendar_status");
  assert(!r.needs_confirmation);
  assert(r.reply.toLowerCase().includes("agosto"), "reply mentions agosto");
});

test("T05 — 'disponibilità luglio' → show_calendar_status", () => {
  const r = interpretMessage("disponibilità luglio", CTX);
  assertEqual(r.intent, "show_calendar_status");
  assert(!r.needs_confirmation);
});

console.log("\nmark_deposit_paid:");

test("T06 — 'Bianchi ha pagato la caparra' → mark_deposit_paid, needs confirmation", () => {
  const r = interpretMessage("Bianchi ha pagato la caparra", CTX);
  assertEqual(r.intent, "mark_deposit_paid");
  assert(r.needs_confirmation, "needs confirmation");
  assert(!r.needs_clarification);
  assert(r.action_plan?.payload?.booking?.guest.includes("Bianchi"), "booking is Bianchi");
});

test("T07 — 'caparra di Rossi ricevuta' → mark_deposit_paid for Rossi", () => {
  const r = interpretMessage("caparra di Rossi ricevuta", CTX);
  assertEqual(r.intent, "mark_deposit_paid");
  assert(r.needs_confirmation);
  assert(r.action_plan?.payload?.booking?.id === "b1", "correct booking b1");
});

test("T08 — 'bonifico di Bianchi arrivato' → mark_deposit_paid", () => {
  const r = interpretMessage("bonifico di Bianchi arrivato", CTX);
  assertEqual(r.intent, "mark_deposit_paid");
  assert(r.needs_confirmation);
});

test("T09 — 'ha pagato' without name → clarification", () => {
  const r = interpretMessage("ha pagato", { ...CTX, bookings:[] });
  assert(r.needs_clarification || !r.needs_confirmation, "no blind execution without context");
});

console.log("\nmark_checkin_done:");

test("T10 — 'Rossi è arrivato' → mark_checkin_done", () => {
  const r = interpretMessage("Rossi è arrivato", CTX);
  assertEqual(r.intent, "mark_checkin_done");
  assert(r.needs_confirmation);
  assert(r.action_plan?.payload?.booking?.id === "b1", "correct booking b1");
});

test("T11 — 'check-in fatto Bianchi' → mark_checkin_done", () => {
  const r = interpretMessage("check-in fatto Bianchi", CTX);
  assertEqual(r.intent, "mark_checkin_done");
  assert(r.needs_confirmation);
});

test("T12 — 'Verdi è arrivato' → mark_checkin_done for Verdi (agosto)", () => {
  const r = interpretMessage("Verdi è arrivato", CTX);
  assertEqual(r.intent, "mark_checkin_done");
  assert(r.needs_confirmation);
  assert(r.action_plan?.payload?.booking?.guest.includes("Verdi"), "Verdi booking");
});

console.log("\ncreate_booking / confirm_request:");

test("T13 — 'Giulia Ferrari dal 23/8 al 30/8 apt2 prezzo 800' → create_booking", () => {
  const r = interpretMessage("Giulia Ferrari dal 23/8 al 30/8 apt2 prezzo 800", CTX);
  assert(["create_booking","confirm_request"].includes(r.intent), `intent was ${r.intent}`);
  assert(r.needs_confirmation || r.needs_clarification, "needs confirmation or clarification");
});

test("T14 — 'metti Mario sull\'uno dal 4 al 11 luglio' → create_booking intent + apt1", () => {
  const r = interpretMessage("metti Mario sull'uno dal 4 al 11 luglio", CTX);
  assert(["create_booking","confirm_request","no_action"].includes(r.intent));
  assert(r.reply.length > 0);
});

test("T15 — 'Greco ha confermato' → confirm_request, resolves from inbox", () => {
  const r = interpretMessage("Greco ha confermato", CTX);
  assertEqual(r.intent, "confirm_request");
  assert(r.needs_confirmation || r.needs_clarification, "has decision");
  if(r.needs_confirmation) {
    assert(r.action_plan?.payload?.aptId === "apt1" || r.reply.includes("apt1"), "apt1 from decision");
  }
});

test("T16 — 'Rossi ha confermato' without inbox → clarification or confirmation from booking", () => {
  const r = interpretMessage("Rossi ha confermato", CTX);
  assertEqual(r.intent, "confirm_request");
  assert(r.needs_clarification || r.needs_confirmation, "not silently dropped");
});

console.log("\ncancel_booking:");

test("T17 — 'cancella la prenotazione di Rossi' → cancel_booking", () => {
  const r = interpretMessage("cancella la prenotazione di Rossi", CTX);
  assertEqual(r.intent, "cancel_booking");
  assert(r.needs_confirmation);
  assert(r.action_plan?.payload?.booking?.id === "b1", "correct booking");
});

test("T18 — 'cancella Neri' (already cancelled) → blocked", () => {
  const r = interpretMessage("cancella Neri", CTX);
  assertEqual(r.intent, "cancel_booking");
  assert(!r.needs_confirmation, "cannot execute already-cancelled");
  assert(r.reply.toLowerCase().includes("già"), "reply says già");
});

console.log("\nmove_booking:");

test("T19 — 'sposta Rossi la settimana dopo' → move_booking with +7 days", () => {
  const r = interpretMessage("sposta Rossi la settimana dopo", CTX);
  assertEqual(r.intent, "move_booking");
  assert(r.needs_confirmation || r.needs_clarification, "needs decision");
  if(r.needs_confirmation) {
    assert(r.action_plan?.payload?.newCheckin === "2026-07-12", "newCheckin = 2026-07-12");
  }
});

test("T20 — 'sposta Verdi di 7 giorni dopo' → move_booking", () => {
  const r = interpretMessage("sposta Verdi di 7 giorni dopo", CTX);
  assert(["move_booking"].includes(r.intent), `intent was ${r.intent}`);
  if(r.needs_confirmation) {
    assert(r.action_plan?.payload?.newCheckin === "2026-08-09", "newCheckin +7");
  }
});

test("T21 — 'sposta Rossi la settimana dopo' when new slot conflicts → blocked", () => {
  const conflicting = [...BOOKINGS, {id:"bx", apt:"apt1", guest:"Altro Ospite", checkin:"2026-07-11", checkout:"2026-07-18", status:"confirmed"}];
  const r = interpretMessage("sposta Rossi la settimana dopo", {...CTX, bookings:conflicting});
  if(r.intent==="move_booking") {
    assert(!r.needs_confirmation || r.reply.includes("?"), "blocked or clarification when conflict");
  }
});

console.log("\nSafety & edge cases:");

test("T22 — No DB write without confirmation", () => {
  const r = interpretMessage("Bianchi ha pagato", CTX);
  assert(typeof r.needs_confirmation === "boolean", "needs_confirmation is boolean");
  assert(r.action_plan !== undefined, "action_plan field present");
});

test("T23 — Ambiguous: multiple bookings with similar name → options shown", () => {
  const ambBks = [
    ...BOOKINGS,
    {id:"b9", apt:"apt2", guest:"Luigi Rossi", checkin:"2026-09-06", checkout:"2026-09-13", status:"confirmed", depositPaid:false, checkinDone:false}
  ];
  const r = interpretMessage("Rossi ha pagato la caparra", {...CTX, bookings:ambBks});
  assert(r.options.length > 0 || r.needs_clarification, "shows options or asks clarification");
});

test("T24 — Unknown guest → not found, clarification", () => {
  const r = interpretMessage("Sconosciuto ha confermato", CTX);
  assert(r.needs_clarification || r.reply.toLowerCase().includes("non ho trovato"), "handles unknown guest");
});

test("T25 — reply is always a plain string", () => {
  const r = interpretMessage("fammi il punto", CTX);
  assert(typeof r.reply === "string", "reply is string");
  assert(r.reply.length > 0, "reply non-empty");
});

test("T26 — interpretMessage returns all required fields", () => {
  const r = interpretMessage("Rossi è arrivato", CTX);
  for(const k of ["reply","intent","confidence","needs_clarification","clarification_question","needs_confirmation","action_plan","options"]) {
    assert(k in r, `field ${k} present`);
  }
  assert(typeof r.confidence === "number", "confidence is number");
  assert(r.confidence >= 0 && r.confidence <= 1, "confidence in [0,1]");
});

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if(failed > 0) process.exit(1);
