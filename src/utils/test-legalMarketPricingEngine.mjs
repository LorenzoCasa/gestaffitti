/**
 * test-legalMarketPricingEngine.mjs
 *
 * Tests for legalMarketPricingEngine.js + integration with managerAgentLLMContext.
 * Pure function tests: no I/O, no Supabase, no LLM calls, no scraping.
 *
 * Run: node src/utils/test-legalMarketPricingEngine.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import {
  buildLegalMarketContext,
  normalizeCompetitorRecord,
  classifyMarketDataSource,
  calculateBenchmarkRange,
  analyzePricePosition,
  suggestPriceStrategy,
  generateMarketPricingAdvice,
  validateMarketDataTrustLevel,
  LEGAL_SOURCES,
  SCRAPING_ALLOWED,
} from "./legalMarketPricingEngine.js";

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
    throw new Error(`${lbl}: "${sub}" not found in "${String(str).slice(0, 120)}"`);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_RECORD = {
  id: "c1", source_type: "mock", source_name: "Stima interna",
  area: "senigallia_lungomare", platform: "other", title: "Test mock",
  distance_to_sea_meters: 100, beds: 4, bedrooms: 2, amenities: ["wifi"],
  period_start: "2026-08-01", period_end: "2026-08-31",
  price_total: 1000, price_weekly_equivalent: 1000,
  availability_status: "unknown", trust_level: "low", is_mock: true, notes: null,
};

const MANUAL_RECORD = {
  ...MOCK_RECORD, id: "c2", source_type: "manual",
  source_name: "Inserimento manuale proprietario", is_mock: false, trust_level: "medium",
};

const API_RECORD = {
  ...MOCK_RECORD, id: "c3", source_type: "authorized_api",
  source_name: "API autorizzata X", is_mock: false, trust_level: "high",
};

// ── P01 — P06: classifyMarketDataSource ───────────────────────────────────────

console.log("\nclassifyMarketDataSource:");

test("P01 — source mock → trust_level low + disclaimer mock", () => {
  const r = classifyMarketDataSource("mock");
  assertEqual(r.trust_level, "low", "trust_level");
  assertContains(r.disclaimer.toLowerCase(), "simulati", "disclaimer mentions simulati");
});

test("P02 — source manual → trust_level medium + disclaimer manuale", () => {
  const r = classifyMarketDataSource("manual");
  assertEqual(r.trust_level, "medium", "trust_level");
  assertContains(r.disclaimer.toLowerCase(), "manualmente", "disclaimer mentions manualmente");
});

test("P03 — source authorized_api → trust_level high", () => {
  const r = classifyMarketDataSource("authorized_api");
  assertEqual(r.trust_level, "high", "trust_level");
});

test("P04 — source csv_import → trust_level medium", () => {
  const r = classifyMarketDataSource("csv_import");
  assertEqual(r.trust_level, "medium", "trust_level");
});

test("P05 — source internal_history → trust_level high", () => {
  const r = classifyMarketDataSource("internal_history");
  assertEqual(r.trust_level, "high", "trust_level");
});

test("P06 — unknown source → defaults to mock trust_level low", () => {
  const r = classifyMarketDataSource("scraping_illegal");
  assertEqual(r.trust_level, "low", "defaults to low");
  assertEqual(r.source_type, "mock", "defaults to mock");
});

// ── P07 — P10: calculateBenchmarkRange ────────────────────────────────────────

console.log("\ncalculateBenchmarkRange:");

test("P07 — benchmark range calcolato da record reali", () => {
  const records = [
    { ...MOCK_RECORD, price_weekly_equivalent: 800 },
    { ...MOCK_RECORD, id: "c2", price_weekly_equivalent: 1000 },
    { ...MOCK_RECORD, id: "c3", price_weekly_equivalent: 1200 },
  ];
  const r = calculateBenchmarkRange(records);
  assertEqual(r.min, 800, "min");
  assertEqual(r.max, 1200, "max");
  assertEqual(r.avg, 1000, "avg");
  assert(r.count === 3, "count 3");
});

test("P08 — fallback a KB statica se nessun competitor", () => {
  const r = calculateBenchmarkRange([], { period: "august", area: "senigallia_lungomare" });
  assert(r.count > 0, "KB fallback ha record");
  assert(r.min != null, "min presente");
  assert(r.max != null, "max presente");
  assert(r.is_mock === true, "is_mock true (KB è mock)");
});

test("P09 — benchmark da mock → trust_level low", () => {
  const records = [MOCK_RECORD];
  const r = calculateBenchmarkRange(records);
  assertEqual(r.trust_level, "low", "trust_level low per mock");
});

test("P10 — benchmark da authorized_api senza mock → trust_level high", () => {
  const records = [
    { ...API_RECORD, price_weekly_equivalent: 1000 },
  ];
  const r = calculateBenchmarkRange(records);
  assertEqual(r.trust_level, "high", "trust_level high per API");
  assertEqual(r.is_mock, false, "is_mock false");
});

// ── P11 — P15: analyzePricePosition ──────────────────────────────────────────

console.log("\nanalyzePricePosition:");

test("P11 — se manca prezzo nostro → position unknown", () => {
  const benchmark = { min: 800, max: 1200, avg: 1000, median: 1000 };
  const r = analyzePricePosition(null, benchmark);
  assertEqual(r.position, "unknown", "unknown when no price");
  assert(r.pct_diff === null, "pct_diff null");
  assertContains(r.reasoning, "gestionale", "mentions gestionale");
});

test("P12 — prezzo sotto benchmark → below_market", () => {
  const benchmark = { min: 800, max: 1200, avg: 1000, median: 1000 };
  const r = analyzePricePosition(800, benchmark);  // -20%
  assertEqual(r.position, "below_market", "below_market");
  assert(r.pct_diff < 0, "pct_diff negative");
});

test("P13 — prezzo in linea (±10%) → aligned", () => {
  const benchmark = { min: 800, max: 1200, avg: 1000, median: 1000 };
  const r = analyzePricePosition(1000, benchmark);  // 0%
  assertEqual(r.position, "aligned", "aligned");
  assertEqual(r.pct_diff, 0, "pct_diff 0");
});

test("P14 — prezzo sopra benchmark → above_market", () => {
  const benchmark = { min: 800, max: 1200, avg: 1000, median: 1000 };
  const r = analyzePricePosition(1200, benchmark);  // +20%
  assertEqual(r.position, "above_market", "above_market");
  assert(r.pct_diff > 0, "pct_diff positive");
});

test("P15 — benchmark non disponibile → position unknown", () => {
  const benchmark = { min: null, max: null, avg: null, median: null };
  const r = analyzePricePosition(800, benchmark);
  assertEqual(r.position, "unknown", "unknown when no benchmark");
});

// ── P16 — P18: suggestPriceStrategy ──────────────────────────────────────────

console.log("\nsuggestPriceStrategy:");

test("P16 — strategy senza prezzo nostro → position unknown + consiglio generico", () => {
  const r = suggestPriceStrategy({ period: "august", area: "senigallia_lungomare" });
  assertEqual(r.position, "unknown", "position unknown");
  assert(r.current_price === null, "current_price null");
  assert(Array.isArray(r.recommendations), "recommendations array");
  assert(r.recommendations.length > 0, "has recommendations");
  assert(r.recommendations.some(rec => rec.toLowerCase().includes("gestionale") || rec.toLowerCase().includes("ufficiale")),
    "mentions gestionale");
});

test("P17 — Ferragosto → demand_level high + no-sconto nel reasoning", () => {
  const r = suggestPriceStrategy({ period: "ferragosto", current_price: 1200 });
  assertEqual(r.demand_level, "high", "high demand");
  assert(r.reasoning.some(s => s.toLowerCase().includes("ferragosto") || s.toLowerCase().includes("anelastica")),
    "mentions anelastica/ferragosto");
});

test("P18 — confidence cresce con trusted data", () => {
  const low = suggestPriceStrategy({ period: "august" });
  const high = suggestPriceStrategy({
    period: "august", current_price: 1000,
    competitors: [{ ...API_RECORD, price_weekly_equivalent: 1000 }],
  });
  assert(high.confidence > low.confidence, `high ${high.confidence} > low ${low.confidence}`);
});

// ── P19 — P21: generateMarketPricingAdvice ────────────────────────────────────

console.log("\ngenerateMarketPricingAdvice:");

test("P19 — pricing advice non genera action_plan", () => {
  const r = generateMarketPricingAdvice({ period: "august", current_price: 800 });
  assert(r.action_plan === null, "action_plan is null");
  assertEqual(r.needs_confirmation, false, "needs_confirmation false");
});

test("P20 — intent_hint è market_analysis (mai action)", () => {
  const r = generateMarketPricingAdvice({ period: "july" });
  assertEqual(r.intent_hint, "market_analysis", "intent_hint");
  assert(r.action_plan === null, "action_plan null");
});

test("P21 — contiene strategy, benchmark, position_analysis", () => {
  const r = generateMarketPricingAdvice({ period: "august", area: "senigallia_lungomare" });
  assert("strategy"          in r, "strategy");
  assert("benchmark"         in r, "benchmark");
  assert("position_analysis" in r, "position_analysis");
});

// ── P22 — P25: validateMarketDataTrustLevel ───────────────────────────────────

console.log("\nvalidateMarketDataTrustLevel:");

test("P22 — record mock → trust low + disclaimer mock", () => {
  const r = validateMarketDataTrustLevel(MOCK_RECORD);
  assertEqual(r.trust_level, "low", "trust_level low");
  assertContains(r.disclaimer, "simulati", "disclaimer mock");
});

test("P23 — record manual senza incongruenze → valid true", () => {
  const r = validateMarketDataTrustLevel(MANUAL_RECORD);
  assert(r.valid === true, "valid true");
  assertEqual(r.trust_level, "medium", "medium trust");
});

test("P24 — record null → valid false + trust low", () => {
  const r = validateMarketDataTrustLevel(null);
  assert(!r.valid, "invalid");
  assertEqual(r.trust_level, "low", "trust low");
  assert(r.warnings.length > 0, "has warnings");
});

test("P25 — record con is_mock=true ma source_type='manual' → warning", () => {
  const inconsistent = { ...MANUAL_RECORD, is_mock: true };
  const r = validateMarketDataTrustLevel(inconsistent);
  assert(r.warnings.length > 0, "has warning for inconsistency");
  assertEqual(r.trust_level, "low", "forced to low because is_mock");
});

// ── P26 — P28: normalizeCompetitorRecord ─────────────────────────────────────

console.log("\nnormalizeCompetitorRecord:");

test("P26 — normalizza record con campi mancanti", () => {
  const raw = { source_type: "manual", price_total: 900 };
  const r = normalizeCompetitorRecord(raw);
  assert(r !== null, "not null");
  assertEqual(r.source_type, "manual", "source_type");
  assertEqual(r.trust_level, "medium", "trust medium");
  assert(Array.isArray(r.amenities), "amenities array");
  assertEqual(r.availability_status, "unknown", "availability_status default");
  assertEqual(r.is_mock, false, "is_mock false for manual");
});

test("P27 — source_type illegale → forced to mock", () => {
  const raw = { source_type: "web_scraping", price_total: 800 };
  const r = normalizeCompetitorRecord(raw);
  assertEqual(r.source_type, "mock", "forced to mock");
  assertEqual(r.is_mock, true, "is_mock true");
  assertEqual(r.trust_level, "low", "trust low");
});

test("P28 — null input → returns null", () => {
  const r = normalizeCompetitorRecord(null);
  assert(r === null, "null for null input");
});

// ── P29 — P32: buildLegalMarketContext ───────────────────────────────────────

console.log("\nbuildLegalMarketContext:");

test("P29 — ha tutti i campi richiesti", () => {
  const ctx = buildLegalMarketContext();
  assert("legal_sources_only"   in ctx, "legal_sources_only");
  assert("scraping_allowed"     in ctx, "scraping_allowed");
  assert("supported_sources"    in ctx, "supported_sources");
  assert("area"                 in ctx, "area");
  assert("kb_summary"           in ctx, "kb_summary");
  assert("source_trust_rules"   in ctx, "source_trust_rules");
  assert("source_disclaimers"   in ctx, "source_disclaimers");
  assert("kb_benchmark_count"   in ctx, "kb_benchmark_count");
  assert("kb_is_mock"           in ctx, "kb_is_mock");
  assert("no_scraping_rule"     in ctx, "no_scraping_rule");
  assert("pricing_advice"       in ctx, "pricing_advice");
  assert("disclaimers"          in ctx, "disclaimers");
});

test("P30 — scraping_allowed sempre false", () => {
  const ctx = buildLegalMarketContext();
  assertEqual(ctx.scraping_allowed, false, "scraping_allowed false");
  assertEqual(SCRAPING_ALLOWED, false, "SCRAPING_ALLOWED constant false");
});

test("P31 — kb_is_mock true (benchmark statici)", () => {
  const ctx = buildLegalMarketContext();
  assert(ctx.kb_is_mock === true, "kb_is_mock true");
});

test("P32 — supported_sources include tutte le fonti legali", () => {
  const ctx = buildLegalMarketContext();
  for (const src of LEGAL_SOURCES) {
    assert(ctx.supported_sources.includes(src), `includes ${src}`);
  }
});

// ── P33 — P35: Integration con buildManagerAgentLLMContext ───────────────────

console.log("\nIntegration con buildManagerAgentLLMContext:");

test("P33 — market_pricing_context incluso nel context", () => {
  const ctx = buildManagerAgentLLMContext({});
  assert("market_pricing_context" in ctx, "market_pricing_context present");
  assert(ctx.market_pricing_context !== null && ctx.market_pricing_context !== undefined, "not null");
});

test("P34 — scraping_allowed sempre false nel context", () => {
  const ctx = buildManagerAgentLLMContext({});
  assertEqual(ctx.market_pricing_context.scraping_allowed, false, "scraping_allowed false");
});

test("P35 — market_pricing_context non sovrascrive bookings/gestionale", () => {
  const bookings = [
    { id: "b1", apt: "apt1", guest: "Mario Rossi", checkin: "2026-07-05", checkout: "2026-07-12",
      status: "confirmed", depositPaid: false, checkinDone: false, price: 800, deposit: 200 },
  ];
  const ctx = buildManagerAgentLLMContext({ bookings, today: "2026-06-20" });
  assert(ctx.bookings.length === 1, "bookings intact");
  assertEqual(ctx.bookings[0].guest, "Mario Rossi", "guest intact");
  assert("market_pricing_context" in ctx, "market_pricing_context present");
  assert("market_context"         in ctx, "market_context still present");
});

// ── P36 — P37: Security — no scraping ────────────────────────────────────────

console.log("\nSecurity — no scraping URLs:");

test("P36 — nessun URL scraping nel file sorgente", () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(__dir, "legalMarketPricingEngine.js"), "utf-8");
  const forbidden = [
    "booking.com/search",
    "airbnb.com/s/",
    "subito.it/annunci",
    "fetch(",
    "axios(",
    "XMLHttpRequest",
    "puppeteer",
    "playwright",
    "cheerio",
  ];
  for (const pattern of forbidden) {
    assert(!src.includes(pattern), `No "${pattern}" in source`);
  }
});

test("P37 — SCRAPING_ALLOWED è false (costante esportata)", () => {
  assertEqual(SCRAPING_ALLOWED, false, "SCRAPING_ALLOWED constant");
});

// ── P38 — P40: Logica prezzi ─────────────────────────────────────────────────

console.log("\nSicurezza logica prezzi:");

test("P38 — prezzo sotto soglia tolleranza (±10%) → aligned", () => {
  const r = analyzePricePosition(950, { min: 800, max: 1200, avg: 1000, median: 1000 });
  assertEqual(r.position, "aligned", "within ±10% = aligned");
});

test("P39 — data_sources include fonte benchmark nell'output strategy", () => {
  const r = suggestPriceStrategy({ period: "august", area: "senigallia_lungomare" });
  assert(Array.isArray(r.data_sources), "data_sources is array");
  assert(r.data_sources.some(s => typeof s === "string" && s.length > 0), "has source entries");
});

test("P40 — strategy per settembre → demand_level low + consiglio flessibilità", () => {
  const r = suggestPriceStrategy({ period: "september", current_price: 500 });
  assertEqual(r.demand_level, "low", "low demand september");
  assert(r.recommendations.some(s => s.toLowerCase().includes("settembre") || s.toLowerCase().includes("flessibil")),
    "recommendation mentions settembre/flessibilità");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
const total = passed + failed;
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) process.exit(1);
