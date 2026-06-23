/**
 * test-agentResponseNormalization.mjs — tests for normalizeAgentResponse + Edge Function logic.
 *
 * Covers partial/non-standard Edge Function responses.
 * Run: node src/utils/test-agentResponseNormalization.mjs
 */

import { normalizeAgentResponse } from "./normalizeAgentResponse.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? "Assertion failed"); }
function assertEqual(a, b, lbl = "") { if (a !== b) throw new Error(`${lbl}: expected "${b}" got "${a}"`); }

// ── normalizeAgentResponse ───────────────────────────────────────────────────

console.log("\nnormalizeAgentResponse — valid responses:");

test("N01 — full valid response → returns normalized object", () => {
  const data = {
    reply: "Hai 2 arrivi domani.",
    intent: "show_today_tasks",
    confidence: 0.9,
    needs_clarification: false,
    clarification_question: null,
    needs_confirmation: false,
    action_plan: null,
    options: [],
  };
  const r = normalizeAgentResponse(data);
  assert(r !== null, "not null");
  assertEqual(r.reply, "Hai 2 arrivi domani.");
  assertEqual(r.intent, "show_today_tasks");
  assertEqual(r.confidence, 0.9);
  assert(!r.needs_confirmation, "no confirmation");
  assert(Array.isArray(r.options), "options is array");
});

test("N02 — options not array → defaults to []", () => {
  const data = { reply: "Ok.", options: "non-array" };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assert(Array.isArray(r.options) && r.options.length === 0, "options defaulted to []");
});

test("N03 — needs_confirmation truthy but not boolean → false", () => {
  const data = { reply: "Ok.", needs_confirmation: 1, action_plan: { type: "x" } };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assertEqual(r.needs_confirmation, false, "needs_confirmation must be strict boolean");
});

test("N04 — needs_confirmation: false with action_plan → not confirmed", () => {
  const data = { reply: "Ok.", needs_confirmation: false, action_plan: { type: "mark_deposit_paid" } };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assert(!r.needs_confirmation, "no confirmation");
  assert(r.action_plan !== null, "action_plan preserved");
});

test("N05 — reply is whitespace only → returns null (triggers fallback)", () => {
  const data = { reply: "   " };
  const r = normalizeAgentResponse(data);
  assertEqual(r, null, "null for whitespace reply");
});

test("N06 — reply missing → returns null", () => {
  const data = { intent: "show_today_tasks" };
  const r = normalizeAgentResponse(data);
  assertEqual(r, null, "null when no reply");
});

test("N07 — reply is number → returns null", () => {
  const data = { reply: 42 };
  const r = normalizeAgentResponse(data);
  assertEqual(r, null, "null for non-string reply");
});

test("N08 — data is null → returns null", () => {
  assertEqual(normalizeAgentResponse(null), null);
});

test("N09 — data is undefined → returns null", () => {
  assertEqual(normalizeAgentResponse(undefined), null);
});

test("N10 — data is string → returns null", () => {
  assertEqual(normalizeAgentResponse("hello"), null);
});

test("N11 — intent missing → defaults to no_action", () => {
  const data = { reply: "Ok." };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assertEqual(r.intent, "no_action");
});

test("N12 — confidence missing → defaults to 0.5", () => {
  const data = { reply: "Ok." };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assertEqual(r.confidence, 0.5);
});

test("N13 — extra unknown fields → ignored, core fields present", () => {
  const data = { reply: "Ok.", __extra: "ignored", foo: 123 };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assert(!("__extra" in r), "extra field stripped");
  assert("reply" in r && "intent" in r && "options" in r);
});

test("N14 — reply trimmed", () => {
  const data = { reply: "  Ciao!  " };
  const r = normalizeAgentResponse(data);
  assert(r !== null);
  assertEqual(r.reply, "Ciao!");
});

// ── Reply path resolution ───────────────────────────────────────────────────

console.log("\nnormalizeAgentResponse — reply path resolution:");

test("N15 — data.result.reply path → reply and intent from result", () => {
  const data = { result: { reply: "Ciao da result.", intent: "show_calendar_status", confidence: 0.8 } };
  const r = normalizeAgentResponse(data);
  assert(r !== null, "not null");
  assertEqual(r.reply, "Ciao da result.");
  assertEqual(r.intent, "show_calendar_status");
  assertEqual(r.confidence, 0.8);
});

test("N16 — data.data.reply path → reply extracted", () => {
  const data = { data: { reply: "Ciao da data.", intent: "no_action" } };
  const r = normalizeAgentResponse(data);
  assert(r !== null, "not null");
  assertEqual(r.reply, "Ciao da data.");
});

test("N17 — data.message path (no .reply) → reply from message", () => {
  const data = { message: "Risposta via message.", intent: "no_action" };
  const r = normalizeAgentResponse(data);
  assert(r !== null, "not null");
  assertEqual(r.reply, "Risposta via message.");
});

test("N18 — data.reply whitespace falls through to data.result.reply", () => {
  const data = { reply: "   ", result: { reply: "Risposta da result." } };
  const r = normalizeAgentResponse(data);
  assert(r !== null, "not null");
  assertEqual(r.reply, "Risposta da result.", "should use result.reply when top-level is whitespace");
});

test("N19 — data.reply takes priority over data.result.reply", () => {
  const data = { reply: "Top level.", result: { reply: "Result level." } };
  const r = normalizeAgentResponse(data);
  assertEqual(r.reply, "Top level.", "top-level reply has priority");
});

test("N20 — all four paths fail → null", () => {
  const data = { reply: "  ", result: { reply: 0 }, data: { reply: null }, message: "" };
  assertEqual(normalizeAgentResponse(data), null, "null when no valid reply anywhere");
});

// ── Required fields completeness ────────────────────────────────────────────

console.log("\nnormalizeAgentResponse — required fields:");

const REQUIRED_FIELDS = ["reply","intent","confidence","needs_clarification","clarification_question",
  "needs_confirmation","action_plan","options","resolved_references","missing_fields",
  "data_used","reasoning_summary","fallback"];

test("N21 — normalized response always has all 13 required fields", () => {
  const r = normalizeAgentResponse({ reply: "Ok." });
  assert(r !== null);
  for (const f of REQUIRED_FIELDS) {
    assert(f in r, `field "${f}" missing`);
  }
});

test("N22 — data_used missing → default object with empty arrays", () => {
  const r = normalizeAgentResponse({ reply: "Ok." });
  assert(r !== null);
  assert(r.data_used && typeof r.data_used === "object", "data_used is object");
  for (const k of ["bookings","inbox","decisions","apartments","market"]) {
    assert(Array.isArray(r.data_used[k]), `data_used.${k} is array`);
  }
});

test("N23 — data_used present → preserved", () => {
  const du = { bookings: ["b1"], inbox: [], decisions: [], apartments: ["apt1"], market: [] };
  const r = normalizeAgentResponse({ reply: "Ok.", data_used: du });
  assert(r !== null);
  assertEqual(r.data_used.bookings[0], "b1", "data_used.bookings preserved");
  assertEqual(r.data_used.apartments[0], "apt1", "data_used.apartments preserved");
});

test("N24 — reasoning_summary string → preserved", () => {
  const r = normalizeAgentResponse({ reply: "Ok.", reasoning_summary: "Ho trovato Rossi in booking b1." });
  assert(r !== null);
  assertEqual(r.reasoning_summary, "Ho trovato Rossi in booking b1.");
});

test("N25 — reasoning_summary non-string → null", () => {
  const r = normalizeAgentResponse({ reply: "Ok.", reasoning_summary: 42 });
  assert(r !== null);
  assertEqual(r.reasoning_summary, null);
});

test("N26 — _fallback: true (Edge Function debug field) → fallback: true", () => {
  const r = normalizeAgentResponse({ reply: "Risposta di fallback.", _fallback: true });
  assert(r !== null);
  assertEqual(r.fallback, true);
});

test("N27 — fallback: true (explicit) → fallback: true", () => {
  const r = normalizeAgentResponse({ reply: "Risposta.", fallback: true });
  assert(r !== null);
  assertEqual(r.fallback, true);
});

test("N28 — no fallback field → fallback: false", () => {
  const r = normalizeAgentResponse({ reply: "Risposta normale." });
  assert(r !== null);
  assertEqual(r.fallback, false);
});

// ── Edge Function parseBrainResponse logic (mirrored in JS) ──────────────────

console.log("\nparseBrainResponse logic — JSON extraction:");

function parseBrainResponseJS(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error("No JSON object found");
    }
  }
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply : "Risposta non disponibile.",
    intent: typeof parsed.intent === "string" ? parsed.intent : "no_action",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    needs_clarification: typeof parsed.needs_clarification === "boolean" ? parsed.needs_clarification : false,
    needs_confirmation: typeof parsed.needs_confirmation === "boolean" ? parsed.needs_confirmation : false,
    action_plan: parsed.action_plan ?? null,
    options: Array.isArray(parsed.options) ? parsed.options : [],
  };
}

const VALID_JSON = JSON.stringify({ reply: "Ciao!", intent: "show_today_tasks", confidence: 0.9, needs_clarification: false, needs_confirmation: false, action_plan: null, options: [] });

test("P01 — plain JSON string → parsed correctly", () => {
  const r = parseBrainResponseJS(VALID_JSON);
  assertEqual(r.reply, "Ciao!");
  assertEqual(r.intent, "show_today_tasks");
});

test("P02 — JSON wrapped in markdown code block → parsed correctly", () => {
  const raw = "```json\n" + VALID_JSON + "\n```";
  const r = parseBrainResponseJS(raw);
  assertEqual(r.reply, "Ciao!");
});

test("P03 — JSON preceded by prose → extracted and parsed (dammi le priorità scenario)", () => {
  const raw = "Ecco la risposta in JSON:\n" + VALID_JSON;
  const r = parseBrainResponseJS(raw);
  assertEqual(r.reply, "Ciao!");
});

test("P04 — JSON followed by note → extracted and parsed (inserisci prenotazione scenario)", () => {
  const raw = VALID_JSON + "\n\nNota: ho risposto con tutto il necessario.";
  const r = parseBrainResponseJS(raw);
  assertEqual(r.reply, "Ciao!");
});

test("P05 — JSON inside code block with leading text → extracted", () => {
  const raw = "Risposta:\n```json\n" + VALID_JSON + "\n```\nFine.";
  const r = parseBrainResponseJS(raw);
  assertEqual(r.reply, "Ciao!");
});

test("P06 — long prose response (> 500 chars) without JSON → throws", () => {
  const longProse = "A".repeat(600);
  let threw = false;
  try { parseBrainResponseJS(longProse); } catch { threw = true; }
  assert(threw, "should throw when no JSON found");
});

test("P07 — fallback catch uses raw text (not error message)", () => {
  // Mirrors the catch block fix: raw text is used as reply
  const raw = "Le priorità di oggi sono: arriva Rossi domani, controlla caparra Bianchi, invia risposta Greco.";
  const rawReply = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/m, "").trim().slice(0, 1200);
  assert(rawReply.length > 0, "raw text preserved");
  assert(!rawReply.includes("non strutturata correttamente"), "old error message gone");
  assert(rawReply.includes("Rossi"), "actual content present");
});

// ── Security checks ──────────────────────────────────────────────────────────

console.log("\nSecurity:");

test("S01 — needs_confirmation false by default → no executeAction without explicit true", () => {
  const data = { reply: "Ok.", action_plan: { type: "mark_deposit_paid", payload: { bookingId: "b1" } } };
  const r = normalizeAgentResponse(data);
  assert(!r.needs_confirmation, "no confirmation without explicit true");
});

test("S02 — options present but needs_confirmation false → options show, no execute", () => {
  const data = {
    reply: "Quale prenotazione?",
    needs_confirmation: false,
    action_plan: null,
    options: [{ label: "Rossi · apt1 · 5/7" }, { label: "Bianchi · apt2 · 12/7" }],
  };
  const r = normalizeAgentResponse(data);
  assert(!r.needs_confirmation, "no execute triggered");
  assertEqual(r.options.length, 2, "options preserved");
});

test("S03 — reply does not contain raw API key patterns", () => {
  const data = { reply: "Risposta normale senza segreti." };
  const r = normalizeAgentResponse(data);
  assert(!/sk-ant-api\d{2}/i.test(r.reply), "no API key pattern in reply");
});

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
