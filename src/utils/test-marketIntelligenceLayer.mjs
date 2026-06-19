/**
 * test-marketIntelligenceLayer.mjs
 *
 * Tests for Market Intelligence Layer + integration with managerAgentLLMContext.
 * Pure function tests: no I/O, no Supabase, no LLM calls.
 *
 * Run: node src/utils/test-marketIntelligenceLayer.mjs
 */

import {
  buildMarketIntelligenceContext,
  classifyMarketQuestion,
  buildMarketGuidance,
  separateInternalFactsFromMarketAdvice,
} from "./marketIntelligenceLayer.js";

import { buildManagerAgentLLMContext } from "./managerAgentLLMContext.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? "Assertion failed"); }
function assertEqual(a, b, lbl = "") { if (a !== b) throw new Error(`${lbl}: expected "${b}" got "${a}"`); }
function assertContains(str, sub, lbl = "") {
  if (typeof str !== "string" || !str.includes(sub))
    throw new Error(`${lbl}: "${sub}" not found in "${String(str).slice(0,120)}"`);
}

// ── buildMarketIntelligenceContext ────────────────────────────────────────────────

console.log("\nbuildMarketIntelligenceContext:");

test("M01 — returns all required fields", () => {
  const ctx = buildMarketIntelligenceContext();
  assert("area"                    in ctx, "area");
  assert("property_type"           in ctx, "property_type");
  assert("business_model"          in ctx, "business_model");
  assert("primary_target"          in ctx, "primary_target");
  assert("internal_truth_rule"     in ctx, "internal_truth_rule");
  assert("no_live_data_disclaimer" in ctx, "no_live_data_disclaimer");
  assert("seasonality_summary"     in ctx, "seasonality_summary");
  assert("price_benchmarks"        in ctx, "price_benchmarks");
  assert("revenue_highlights"      in ctx, "revenue_highlights");
  assert("channel_summary"         in ctx, "channel_summary");
});

test("M02 — no_live_data_disclaimer mentions concorrenza/live data", () => {
  const ctx = buildMarketIntelligenceContext();
  const disc = ctx.no_live_data_disclaimer.toLowerCase();
  assert(disc.includes("live") || disc.includes("concorrenz"), "mentions live/concorrenza");
});

test("M03 — area contains Senigallia", () => {
  const ctx = buildMarketIntelligenceContext();
  assertContains(ctx.area, "Senigallia", "area");
});

test("M04 — price_benchmarks has disclaimer marking them as NOT our prices", () => {
  const ctx = buildMarketIntelligenceContext();
  const disc = ctx.price_benchmarks.disclaimer.toUpperCase();
  assert(disc.includes("NON") || disc.includes("INDICATIV"), "benchmark disclaimer present");
});

test("M05 — seasonality_summary has peak, june, september", () => {
  const ctx = buildMarketIntelligenceContext();
  assert("peak"      in ctx.seasonality_summary, "peak");
  assert("june"      in ctx.seasonality_summary, "june");
  assert("september" in ctx.seasonality_summary, "september");
});

test("M06 — revenue_highlights is non-empty array", () => {
  const ctx = buildMarketIntelligenceContext();
  assert(Array.isArray(ctx.revenue_highlights), "is array");
  assert(ctx.revenue_highlights.length > 0, "non-empty");
});

// ── classifyMarketQuestion ────────────────────────────────────────────────────────

console.log("\nclassifyMarketQuestion:");

test("M07 — 'quanto chiedere per agosto' → market", () => {
  assertEqual(classifyMarketQuestion("quanto chiedere per agosto"), "market", "market");
});

test("M08 — 'sto vendendo basso il ferragosto?' → market", () => {
  assertEqual(classifyMarketQuestion("sto vendendo basso il ferragosto?"), "market", "market");
});

test("M09 — 'chi è prenotato a luglio' → internal", () => {
  assertEqual(classifyMarketQuestion("chi è prenotato a luglio"), "internal", "internal");
});

test("M10 — 'disponibilità agosto' → internal", () => {
  assertEqual(classifyMarketQuestion("disponibilità agosto"), "internal", "internal");
});

test("M11 — 'cosa ho oggi' → internal", () => {
  assertEqual(classifyMarketQuestion("cosa ho oggi"), "internal", "internal");
});

test("M12 — 'disponibilità ferragosto e quanto vale sul mercato' → mixed", () => {
  assertEqual(classifyMarketQuestion("disponibilità ferragosto e quanto vale sul mercato"), "mixed", "mixed");
});

test("M13 — empty string → internal (safe default)", () => {
  assertEqual(classifyMarketQuestion(""), "internal", "empty default");
});

test("M14 — null → internal (safe default)", () => {
  assertEqual(classifyMarketQuestion(null), "internal", "null default");
});

// ── buildMarketGuidance ────────────────────────────────────────────────────────────

console.log("\nbuildMarketGuidance:");

test("M15 — 'competitors' has has_live_data=false", () => {
  const g = buildMarketGuidance("competitors");
  assertEqual(g.has_live_data, false, "has_live_data");
});

test("M16 — 'competitors' disclaimer mentions no live data", () => {
  const g = buildMarketGuidance("competitors");
  const d = g.disclaimer.toLowerCase();
  assert(d.includes("live") || d.includes("concorrenz"), "disclaimer about no live data");
});

test("M17 — 'competitors' guidance explicitly says no live data", () => {
  const g = buildMarketGuidance("competitors");
  const text = (g.guidance + " " + g.disclaimer).toLowerCase();
  assert(text.includes("non ho") || text.includes("nessun dato") || text.includes("no live"), "says no live data");
});

test("M18 — 'pricing' does not claim to know our official prices", () => {
  const g = buildMarketGuidance("pricing");
  const text = g.guidance.toLowerCase();
  // Should contain benchmark ranges (€ signs), not claim to be authoritative prices
  assert(text.includes("€") || text.includes("benchmark") || text.includes("range") || text.includes("/sett"), "has price ranges");
  assert(!text.includes("il prezzo ufficiale è") && !text.includes("il tuo prezzo è"), "doesn't claim our official price");
});

test("M19 — 'ferragosto' mentions no discount", () => {
  const g = buildMarketGuidance("ferragosto");
  const text = g.guidance.toLowerCase();
  assert(text.includes("non") && (text.includes("scont") || text.includes("massim")), "mentions no discounts/max price");
});

test("M20 — 'revenue' has tips array", () => {
  const g = buildMarketGuidance("revenue");
  assert(Array.isArray(g.tips), "tips is array");
  assert(g.tips.length > 0, "tips non-empty");
});

test("M21 — unknown topic falls back to 'general' guidance", () => {
  const g = buildMarketGuidance("nonexistent_topic_xyz");
  assert(typeof g.guidance === "string" && g.guidance.length > 0, "fallback guidance present");
  assert(g.has_live_data === false, "has_live_data false");
});

// ── separateInternalFactsFromMarketAdvice ─────────────────────────────────────────────

console.log("\nseparateInternalFactsFromMarketAdvice:");

test("M22 — internal facts get source=gestionale and authoritative=true", () => {
  const r = separateInternalFactsFromMarketAdvice({
    internalFacts: [{ text: "Rossi è prenotato dal 5 al 12 luglio" }],
    marketAdvice:  [],
  });
  assertEqual(r.internalFacts[0].source,        "gestionale", "source");
  assertEqual(r.internalFacts[0].authoritative,  true,        "authoritative");
});

test("M23 — market advice gets source=market_kb and authoritative=false", () => {
  const r = separateInternalFactsFromMarketAdvice({
    internalFacts: [],
    marketAdvice:  [{ text: "benchmark luglio 750-1050€" }],
  });
  assertEqual(r.marketAdvice[0].source,        "market_kb", "source");
  assertEqual(r.marketAdvice[0].authoritative, false,       "not authoritative");
  assert(typeof r.marketAdvice[0].disclaimer === "string",   "has disclaimer");
});

test("M24 — isSeparated=true and rule present", () => {
  const r = separateInternalFactsFromMarketAdvice({});
  assertEqual(r.isSeparated, true, "isSeparated");
  assert(typeof r.rule === "string" && r.rule.length > 0, "rule present");
});

test("M25 — empty input returns valid structure", () => {
  const r = separateInternalFactsFromMarketAdvice();
  assert(Array.isArray(r.internalFacts), "internalFacts array");
  assert(Array.isArray(r.marketAdvice),  "marketAdvice array");
  assert(r.internalFacts.length === 0,   "internalFacts empty");
  assert(r.marketAdvice.length  === 0,   "marketAdvice empty");
});

// ── Integration: buildManagerAgentLLMContext includes market_context ─────────────────

console.log("\nIntegration with buildManagerAgentLLMContext:");

test("M26 — market_context field is present in returned context", () => {
  const ctx = buildManagerAgentLLMContext({});
  assert("market_context" in ctx, "market_context field present");
  assert(ctx.market_context !== null && ctx.market_context !== undefined, "market_context not null");
});

test("M27 — market_context.no_live_data_disclaimer is present and non-empty", () => {
  const ctx = buildManagerAgentLLMContext({});
  assert(typeof ctx.market_context.no_live_data_disclaimer === "string", "string");
  assert(ctx.market_context.no_live_data_disclaimer.length > 0, "non-empty");
});

test("M28 — market_context.area contains Senigallia", () => {
  const ctx = buildManagerAgentLLMContext({});
  assertContains(ctx.market_context.area, "Senigallia", "area");
});

test("M29 — market_context.price_benchmarks present with disclaimer", () => {
  const ctx = buildManagerAgentLLMContext({});
  assert("price_benchmarks" in ctx.market_context, "price_benchmarks present");
  assert(typeof ctx.market_context.price_benchmarks.disclaimer === "string", "disclaimer string");
});

test("M30 — market_context does NOT override bookings/inbox (gestionale data intact)", () => {
  const bookings = [
    { id: "b1", apt: "apt1", guest: "Mario Rossi", checkin: "2026-07-05", checkout: "2026-07-12",
      status: "confirmed", depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  ];
  const ctx = buildManagerAgentLLMContext({ bookings, today: "2026-06-20" });
  assert(ctx.bookings.length === 1,           "bookings intact");
  assertEqual(ctx.bookings[0].guest, "Mario Rossi", "guest intact");
  assert("market_context" in ctx,             "market_context present alongside bookings");
});

// ── Summary ────────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
