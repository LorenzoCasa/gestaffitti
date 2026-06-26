/**
 * test-hostConfig.mjs — M2: Host Config Decoupling
 *
 * Verifica che:
 * - alias "uno"/"due" risolvano ancora apt1/apt2
 * - prezzi per mese siano corretti
 * - regole soggiorno sabato-sabato ancora applicate
 * - alternative entro ±15 giorni
 * - Senigallia/Marche ancora presenti dove devono
 * - getRentalPricingRules usa hostConfig
 * - draftSubitoPromotion usa locationLine da hostConfig
 */

import { DEFAULT_HOST_CONFIG }  from "../config/hostConfig.js";
import { BETA_HOST_CONFIG }      from "../config/hostConfig.betaHost.js";
import { getSubitoSeasonalPrice } from "./agentSeasonalRates.js";
import { checkStayRules }          from "./agentStayRules.js";
import { getRentalPricingRules, draftSubitoPromotion, analyzeFreeSlots } from "./rentalBusinessBrain.js";
import { resolveListingFromTitle, extractListingTitle } from "./agentListingResolver.js";
import { interpretMessage }        from "./managerAgentBrain.js";
import { buildAgentContext }        from "./buildAgentContext.js";
import { buildMarketIntelligenceContext, buildMarketGuidance } from "./marketIntelligenceLayer.js";
import { buildLegalMarketContext, generateMarketPricingAdvice } from "./legalMarketPricingEngine.js";
import { buildFallbackPromoText } from "./marketingReplyRepair.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTruthy(label, value) {
  if (value) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: got falsy`);
    failed++;
  }
}

console.log("\n── H01: DEFAULT_HOST_CONFIG struttura ──────────────────────────");
assert("identity.city = Senigallia",        DEFAULT_HOST_CONFIG.identity.city,    "Senigallia");
assert("identity.region = Marche",           DEFAULT_HOST_CONFIG.identity.region,  "Marche");
assertTruthy("identity.locationLine presente",  DEFAULT_HOST_CONFIG.identity.locationLine);
assert("apartments length = 2",             DEFAULT_HOST_CONFIG.apartments.length, 2);
assert("apt1 id",                           DEFAULT_HOST_CONFIG.apartments[0].id,  "apt1");
assert("apt2 id",                           DEFAULT_HOST_CONFIG.apartments[1].id,  "apt2");
assertTruthy("apt1 subitoTitle presente",   DEFAULT_HOST_CONFIG.apartments[0].subitoTitle);
assertTruthy("apt2 subitoTitle presente",   DEFAULT_HOST_CONFIG.apartments[1].subitoTitle);
assertTruthy("apt1 naturalAliasPattern",    DEFAULT_HOST_CONFIG.apartments[0].naturalAliasPattern instanceof RegExp);
assertTruthy("apt2 naturalAliasPattern",    DEFAULT_HOST_CONFIG.apartments[1].naturalAliasPattern instanceof RegExp);

console.log("\n── H02: Prezzi stagionali da hostConfig ────────────────────────");
assert("giugno weekly = 500",              DEFAULT_HOST_CONFIG.seasonalRates[6].weekly,  500);
assert("luglio weekly = 800",              DEFAULT_HOST_CONFIG.seasonalRates[7].weekly,  800);
assert("agosto weekly = 800",             DEFAULT_HOST_CONFIG.seasonalRates[8].weekly,  800);
assert("settembre weekly = 500",          DEFAULT_HOST_CONFIG.seasonalRates[9].weekly,  500);
assert("giugno monthly = 1600",           DEFAULT_HOST_CONFIG.seasonalRates[6].monthly, 1600);
assert("luglio monthly = 2600",           DEFAULT_HOST_CONFIG.seasonalRates[7].monthly, 2600);
assert("agosto monthly = 2600",           DEFAULT_HOST_CONFIG.seasonalRates[8].monthly, 2600);
assert("settembre monthly = 1500",        DEFAULT_HOST_CONFIG.seasonalRates[9].monthly, 1500);

console.log("\n── H03: Regole soggiorno da hostConfig ─────────────────────────");
assert("peakMonths include 6",            DEFAULT_HOST_CONFIG.stayRules.peakMonths.includes(6), true);
assert("peakMonths include 7",            DEFAULT_HOST_CONFIG.stayRules.peakMonths.includes(7), true);
assert("peakMonths include 8",            DEFAULT_HOST_CONFIG.stayRules.peakMonths.includes(8), true);
assert("validNights include 7",           DEFAULT_HOST_CONFIG.stayRules.validNights.includes(7),  true);
assert("validNights include 14",          DEFAULT_HOST_CONFIG.stayRules.validNights.includes(14), true);
assert("validNights include 21",          DEFAULT_HOST_CONFIG.stayRules.validNights.includes(21), true);
assert("checkInDayOfWeek = 6 (sabato)",   DEFAULT_HOST_CONFIG.stayRules.checkInDayOfWeek,        6);
assert("maxAlternativeOffsetDays = 15",   DEFAULT_HOST_CONFIG.stayRules.maxAlternativeOffsetDays, 15);

console.log("\n── H04: getSubitoSeasonalPrice usa hostConfig ───────────────────");
const priceAug7 = getSubitoSeasonalPrice({ checkin: "2026-08-01", checkout: "2026-08-08" });
assert("agosto 7n = €800",               priceAug7.totalPrice, 800);
assert("agosto weeklyRate = €800",       priceAug7.weeklyRate, 800);

const priceAug14 = getSubitoSeasonalPrice({ checkin: "2026-08-01", checkout: "2026-08-15" });
assert("agosto 14n = €1600",             priceAug14.totalPrice, 1600);

const priceFullAug = getSubitoSeasonalPrice({ isFullMonth: true, fullMonthNum: 8 });
assert("mese intero agosto = €2600",     priceFullAug.totalPrice, 2600);

const priceJun = getSubitoSeasonalPrice({ checkin: "2026-06-06", checkout: "2026-06-13" });
assert("giugno 7n = €500",              priceJun.totalPrice, 500);

const priceSept = getSubitoSeasonalPrice({ isFullMonth: true, fullMonthNum: 9 });
assert("mese intero settembre = €1500", priceSept.totalPrice, 1500);

console.log("\n── H05: checkStayRules usa hostConfig ───────────────────────────");
// Luglio sab-sab 7n → valid
const r1 = checkStayRules("2026-07-04", "2026-07-11"); // sabato→sabato
assert("luglio sab-sab 7n → valid",     r1.valid, true);

// Luglio non-sabato → invalid
const r2 = checkStayRules("2026-07-05", "2026-07-12"); // domenica→domenica
assert("luglio dom-dom → invalid",      r2.valid, false);
assertTruthy("luglio dom-dom ha suggerimenti", r2.suggestedValidRanges.length > 0);

// Settembre → non peak → valid (flessibile)
const r3 = checkStayRules("2026-09-07", "2026-09-10");
assert("settembre non peak → valid",    r3.valid, true);

// Richiesta non sab-sab luglio → suggestedValidRanges entro ±15 giorni
const r4 = checkStayRules("2026-07-06", "2026-07-13"); // lunedì
assertTruthy("suggestedValidRanges non vuoto", r4.suggestedValidRanges.length > 0);
const firstSugg = r4.suggestedValidRanges[0];
const diffDays = Math.abs(new Date(firstSugg.checkin).getTime() - new Date("2026-07-06").getTime()) / 86400000;
assert("prima alternativa entro 15 giorni", diffDays <= 15, true);

console.log("\n── H06: getRentalPricingRules usa hostConfig ────────────────────");
const rules = getRentalPricingRules();
assert("seasonal_rates[6].weekly = 500",  rules.seasonal_rates[6].weekly,  500);
assert("seasonal_rates[8].weekly = 800",  rules.seasonal_rates[8].weekly,  800);
assert("seasonal_rates[9].monthly = 1500",rules.seasonal_rates[9].monthly, 1500);
assert("valid_durations_nights includes 7", rules.stay_rules.valid_durations_nights.includes(7), true);
assert("full_month_eligible = true",       rules.stay_rules.full_month_eligible, true);
assert("september_flexible = true",        rules.stay_rules.september_flexible, true);

// Verifica con hostConfig custom (smoke test)
const customConfig = {
  ...DEFAULT_HOST_CONFIG,
  seasonalRates: { 7: { month: "luglio", weekly: 999, monthly: 3000, season: "peak" } },
  stayRules: { ...DEFAULT_HOST_CONFIG.stayRules, validNights: [7] },
};
const customRules = getRentalPricingRules(customConfig);
assert("custom config: luglio weekly = 999", customRules.seasonal_rates[7].weekly, 999);

console.log("\n── H07: draftSubitoPromotion usa locationLine da hostConfig ─────");
const slot = {
  aptId: "apt1", aptLabel: "Appartamento A",
  start: "2026-08-01", end: "2026-08-08",
  nights: 7, weeks: 1, month: 8, season: "peak",
  estimatedValue: 800, urgencyLevel: "medium", daysUntilStart: 30,
};
const promo = draftSubitoPromotion(slot, rules, { label: "Appartamento A" });
assertTruthy("promo.body contiene locationLine",
  promo.body.includes(DEFAULT_HOST_CONFIG.identity.locationLine));

// Verifica che con config custom cambi la locationLine
const customPromo = draftSubitoPromotion(slot, rules, { label: "Test Apt" }, {
  ...DEFAULT_HOST_CONFIG,
  identity: { ...DEFAULT_HOST_CONFIG.identity, locationLine: "Piazza Roma, Milano" },
});
assertTruthy("custom config: locationLine aggiornata",
  customPromo.body.includes("Piazza Roma, Milano"));

console.log("\n── H08: resolveListingFromTitle usa hostConfig ───────────────────");
const apts = [{ id: "apt1", label: "Appartamento A" }, { id: "apt2", label: "Appartamento B" }];

// Titolo Subito esatto
assert("Subito title 1 → apt1",
  resolveListingFromTitle("Lungomare Senigallia Appartamento Estivo 1", apts),
  "apt1");
assert("Subito title 2 → apt2",
  resolveListingFromTitle("Lungomare Senigallia Appartamento Estivo 2", apts),
  "apt2");

// Titolo non riconosciuto → null (evitare "Appartamento" che matcha label "Appartamento A")
assert("titolo sconosciuto → null",
  resolveListingFromTitle("Casa vacanze sul Lago di Como", apts),
  null);

console.log("\n── H09: interpretMessage — alias 'uno'/'due' ancora funzionanti ──");
const CTX = {
  apartments: [
    { id: "apt1", label: "Appartamento A" },
    { id: "apt2", label: "Appartamento B" },
    { id: "all",  label: "Tutti" },
  ],
  bookings: [],
  inbox: [],
  decisions: [],
};

// "sull'uno" → apt1
const r9a = interpretMessage("metti Mario sull'uno dal 4 al 11 luglio", CTX);
assertTruthy("sull'uno → intent detect (non no_action)", r9a.intent !== "no_action");

// "sull'due" → apt2 (via aptId in missing)
const r9b = interpretMessage("crea prenotazione sull'due", CTX);
assertTruthy("sull'due → reply is string", typeof r9b.reply === "string");

// "apt1" → riconosciuto
const r9c = interpretMessage("Rossi è arrivato, fa check-in apt1", CTX);
assertTruthy("apt1 → intent mark_checkin_done", r9c.intent === "mark_checkin_done");

// "appartamento 1" → riconosciuto
const r9d = interpretMessage("crea prenotazione appartamento 1", CTX);
assertTruthy("appartamento 1 → intent recognized", r9d.intent !== "no_action");

// "appartamento 2" → riconosciuto
const r9e = interpretMessage("Giulia Ferrari appartamento 2 dal 23/8 al 30/8 prezzo 800", CTX);
assertTruthy("appartamento 2 → intent recognized", r9e.intent !== "no_action");

console.log("\n── H10: Senigallia/Marche presenti nel contesto market ──────────");
assert("identity.city = Senigallia",  DEFAULT_HOST_CONFIG.identity.city, "Senigallia");
assert("identity.region = Marche",    DEFAULT_HOST_CONFIG.identity.region, "Marche");
assertTruthy("locationLine include Senigallia",
  DEFAULT_HOST_CONFIG.identity.locationLine.includes("Senigallia"));

console.log("\n── H11: Fix — instanceof RegExp guard + numericAlias esplicito ─────");

// H11-A: nessun TypeError se naturalAliasPattern non è RegExp (config da JSON)
const fakeConfigBadPattern = {
  ...DEFAULT_HOST_CONFIG,
  apartments: [
    { id: "apt1", label: "A", subitoTitle: "", naturalAliasPattern: {}, numericAlias: 1 },
  ],
};
let noThrow = true;
try {
  interpretMessage("sull'uno crea prenotazione", {
    apartments: [{ id: "apt1", label: "A" }],
    bookings: [], inbox: [], decisions: [],
    hostConfig: fakeConfigBadPattern,
  });
} catch (e) {
  noThrow = false;
}
assertTruthy("H11-A: nessun TypeError con naturalAliasPattern non-RegExp", noThrow);

// H11-B: numericAlias esplicito — "apt 1" risolve ad apt1 (non posizionale)
// Ospite già presente nei bookings (apt2) + testo specifica "apt 1" → finalAptId deve essere apt1
const booksH11b = [
  { id: "bx1", guest: "Mario Verdi", apt: "apt2", checkin: "2026-08-01", checkout: "2026-08-08", status: "confirmed" },
];
const r11b = interpretMessage("crea prenotazione Mario Verdi apt 1 dal 5/7 al 12/7 prezzo 800", {
  apartments: [
    { id: "apt1", label: "Appartamento A" },
    { id: "apt2", label: "Appartamento B" },
    { id: "all", label: "Tutti" },
  ],
  bookings: booksH11b, inbox: [], decisions: [],
});
assertTruthy("H11-B: apt 1 → apt1 via numericAlias → needs_confirmation", r11b.needs_confirmation === true);
assert("H11-B extra: action_plan.payload.aptId = apt1 (non apt2 del booking)",
  r11b.action_plan?.payload?.aptId, "apt1");

// H11-C: config con apt5 (numericAlias=5) — "apt 1" non deve mappare silenziosamente a apt5
const fakeConfigApt5 = {
  ...DEFAULT_HOST_CONFIG,
  apartments: [
    { id: "apt5", label: "Appartamento X", subitoTitle: "", naturalAliasPattern: /apt-x/i, numericAlias: 5 },
  ],
};
const r11c = interpretMessage("crea prenotazione apt 1", {
  apartments: [{ id: "apt5", label: "Appartamento X" }],
  bookings: [], inbox: [], decisions: [],
  hostConfig: fakeConfigApt5,
});
const aptResolved11c = r11c.action_plan?.payload?.aptId ?? null;
assert("H11-C: apt 1 non risolve a apt5 con config non-sequenziale (no silent fallback)",
  aptResolved11c !== "apt5", true);

console.log("\n── H12: Fix — buildAgentContext riceve e usa hostConfig ─────────");

const customRatesConfig = {
  ...DEFAULT_HOST_CONFIG,
  seasonalRates: {
    ...DEFAULT_HOST_CONFIG.seasonalRates,
    8: { month: "agosto", weekly: 1200, monthly: 4000, season: "peak" },
  },
};
const ctx12 = buildAgentContext({
  formData: { aptId: "apt1", checkin: "2026-08-01", checkout: "2026-08-08", guests: 2, source: "subito" },
  apartments: [{ id: "apt1", label: "Appartamento A" }],
  bookings: [], aptRules: [],
  hostConfig: customRatesConfig,
});
assert("H12-A: buildAgentContext usa hostConfig custom per pricing agosto (€1200)", ctx12.pricing.totalPrice, 1200);

const ctx12b = buildAgentContext({
  formData: { aptId: "apt1", checkin: "2026-08-01", checkout: "2026-08-08", guests: 2, source: "subito" },
  apartments: [{ id: "apt1", label: "Appartamento A" }],
  bookings: [], aptRules: [],
});
assert("H12-B: buildAgentContext senza hostConfig usa default (€800)", ctx12b.pricing.totalPrice, 800);

console.log("\n── H13: M5A-0 — nessun dato Lorenzo con testHostConfig ─────────────");

const testHostCfg = {
  ...DEFAULT_HOST_CONFIG,
  identity: {
    businessName: "Mario Rossi",
    city:         "Pineto",
    area:         "Lungomare",
    region:       "Abruzzo",
    locationLine: "Lungomare Pineto, Costa dei Trabocchi",
  },
};

// H13-A: buildMarketIntelligenceContext → no Senigallia / no Spiaggia di Velluto
const mktCtx = buildMarketIntelligenceContext(testHostCfg);
assertTruthy("H13-A: area no Senigallia",          !mktCtx.area.includes("Senigallia"));
assertTruthy("H13-A: area no Spiaggia di Velluto", !mktCtx.area.includes("Spiaggia di Velluto"));
assertTruthy("H13-A: area contiene Pineto",         mktCtx.area.includes("Pineto"));

// H13-B: buildLegalMarketContext → no senigallia_lungomare / no Senigallia / areas_covered vuoto
const legalCtx = buildLegalMarketContext(testHostCfg);
const legalStr  = JSON.stringify(legalCtx);
assertTruthy("H13-B: area no Senigallia",               !legalCtx.area.includes("Senigallia"));
assertTruthy("H13-B: areas_covered vuoto",               legalCtx.areas_covered.length === 0);
assertTruthy("H13-B: no senigallia_lungomare in output", !legalStr.includes("senigallia_lungomare"));
assert(      "H13-B: kb_source = none",                  legalCtx.kb_source, "none");

// H13-C: buildFallbackPromoText → no Senigallia / no Spiaggia di Velluto / usa Pineto
const slotH13 = {
  aptId: "apt1", aptLabel: "Appartamento A",
  start: "2026-08-01", end: "2026-08-08",
  nights: 7, weeks: 1, month: 8, estimatedValue: 800, daysUntilStart: 30,
};
const promoText = buildFallbackPromoText(slotH13, { label: "Appartamento A" }, testHostCfg);
assertTruthy("H13-C: promo no Senigallia",           !promoText.fullText.includes("Senigallia"));
assertTruthy("H13-C: promo no Spiaggia di Velluto",  !promoText.fullText.includes("Spiaggia di Velluto"));
assertTruthy("H13-C: promo usa locationLine Pineto",   promoText.fullText.includes("Pineto"));

// H13-D: buildMarketGuidance competitors → no Senigallia con testHostConfig
const guideCtx = buildMarketGuidance("competitors", testHostCfg);
assertTruthy("H13-D: competitors guidance no Senigallia", !guideCtx.guidance.includes("Senigallia"));
assertTruthy("H13-D: competitors guidance contiene Pineto", guideCtx.guidance.includes("Pineto"));

// H13-E: generateMarketPricingAdvice → no_kb con host senza benchmark, no Senigallia
const advice    = generateMarketPricingAdvice({ hostConfig: testHostCfg });
const adviceStr = JSON.stringify(advice);
assert(      "H13-E: intent_hint = no_kb",               advice.intent_hint, "no_kb");
assertTruthy("H13-E: no senigallia_lungomare in advice", !adviceStr.includes("senigallia_lungomare"));
assertTruthy("H13-E: no KB strategica Senigallia",       !adviceStr.includes("KB strategica Senigallia"));
assertTruthy("H13-E: no KB strategica Pineto su dati SN",!adviceStr.includes("KB strategica Pineto"));

// H13-F: DEFAULT Lorenzo → comportamento invariato
const defaultMkt   = buildMarketIntelligenceContext();
const defaultLegal = buildLegalMarketContext();
assertTruthy("H13-F: Lorenzo market area ha Senigallia",     defaultMkt.area.includes("Senigallia"));
assertTruthy("H13-F: Lorenzo areas_covered non vuoto",       defaultLegal.areas_covered.length > 0);
assertTruthy("H13-F: Lorenzo kb_summary ha Senigallia",      defaultLegal.kb_summary.includes("Senigallia"));
assertTruthy("H13-F: Lorenzo competitors guidance Senigallia",
  buildMarketGuidance("competitors").guidance.includes("Senigallia"));
const defaultAdv = generateMarketPricingAdvice({});
assert("H13-F: Lorenzo generateMarketPricingAdvice → market_analysis", defaultAdv.intent_hint, "market_analysis");

console.log("\n── H14: M5A-1 — Config beta B&B MARE Riccione ──────────────────────");

// H14-A: struttura identità
assert("H14-A: identity.city = Riccione",              BETA_HOST_CONFIG.identity.city,         "Riccione");
assert("H14-A: identity.businessName = B&B MARE",      BETA_HOST_CONFIG.identity.businessName, "B&B MARE");
assert("H14-A: identity.region = Emilia-Romagna",      BETA_HOST_CONFIG.identity.region,       "Emilia-Romagna");
assertTruthy("H14-A: locationLine contiene Riccione",  BETA_HOST_CONFIG.identity.locationLine.includes("Riccione"));
assertTruthy("H14-A: locationLine contiene Lungomare", BETA_HOST_CONFIG.identity.locationLine.includes("Lungomare"));

// H14-B: nessun leak Senigallia nella config beta
const betaStr = JSON.stringify(BETA_HOST_CONFIG);
assertTruthy("H14-B: no Senigallia",            !betaStr.includes("Senigallia"));
assertTruthy("H14-B: no Spiaggia di Velluto",   !betaStr.includes("Spiaggia di Velluto"));
assertTruthy("H14-B: no senigallia_lungomare",  !betaStr.includes("senigallia_lungomare"));
assertTruthy("H14-B: no Lungomare Senigallia",  !betaStr.includes("Lungomare Senigallia"));

// H14-C: prezzi per notte
assert("H14-C: agosto nightly = 190",     BETA_HOST_CONFIG.seasonalRates[8].nightly, 190);
assert("H14-C: luglio nightly = 160",     BETA_HOST_CONFIG.seasonalRates[7].nightly, 160);
assert("H14-C: giugno nightly = 120",     BETA_HOST_CONFIG.seasonalRates[6].nightly, 120);
assert("H14-C: settembre nightly = 130",  BETA_HOST_CONFIG.seasonalRates[9].nightly, 130);
assert("H14-C: bassa stagione nightly = 80", BETA_HOST_CONFIG.seasonalRates[1].nightly, 80);
assert("H14-C: ferragosto nightly = 230", BETA_HOST_CONFIG.specialRates.ferragosto.nightly, 230);
assert("H14-C: pricingModel = nightly",   BETA_HOST_CONFIG.pricingModel, "nightly");
// weekly = nightly × 7 per compatibilità motore
assert("H14-C: agosto weekly = 190×7",    BETA_HOST_CONFIG.seasonalRates[8].weekly, 1330);

// H14-D: 5 camere B&B
assert("H14-D: apartments.length = 5",      BETA_HOST_CONFIG.apartments.length, 5);
assert("H14-D: cam1 id",                    BETA_HOST_CONFIG.apartments[0].id,    "cam1");
assert("H14-D: cam1 label = Camera 1",      BETA_HOST_CONFIG.apartments[0].label, "Camera 1");
assert("H14-D: cam5 id",                    BETA_HOST_CONFIG.apartments[4].id,    "cam5");
assert("H14-D: cam5 label = Camera 5",      BETA_HOST_CONFIG.apartments[4].label, "Camera 5");
assert("H14-D: cam1 hasBalcone = true",     BETA_HOST_CONFIG.apartments[0].hasBalcone, true);
assert("H14-D: cam3 hasBalcone = true",     BETA_HOST_CONFIG.apartments[2].hasBalcone, true);
assert("H14-D: cam4 hasBalcone = false",    BETA_HOST_CONFIG.apartments[3].hasBalcone, false);
assert("H14-D: cam5 hasBalcone = false",    BETA_HOST_CONFIG.apartments[4].hasBalcone, false);
assertTruthy("H14-D: ogni camera ha numericAlias",
  BETA_HOST_CONFIG.apartments.every((a, i) => a.numericAlias === i + 1));
assertTruthy("H14-D: ogni camera ha naturalAliasPattern RegExp",
  BETA_HOST_CONFIG.apartments.every(a => a.naturalAliasPattern instanceof RegExp));

// H14-E: regole soggiorno B&B
assert("H14-E: minNights = 1",             BETA_HOST_CONFIG.stayRules.minNights, 1);
assert("H14-E: checkInDayOfWeek = null",   BETA_HOST_CONFIG.stayRules.checkInDayOfWeek, null);
assert("H14-E: weekendsAllowed = true",    BETA_HOST_CONFIG.stayRules.weekendsAllowed, true);
assert("H14-E: validNights length = 0",    BETA_HOST_CONFIG.stayRules.validNights.length, 0);
assert("H14-E: fullMonthEligible = false", BETA_HOST_CONFIG.stayRules.fullMonthEligible, false);
assert("H14-E: septemberFlexible = true",  BETA_HOST_CONFIG.stayRules.septemberFlexible, true);

// H14-F: supplemento ospiti
assert("H14-F: baseGuests = 2",            BETA_HOST_CONFIG.guestSupplements.baseGuests, 2);
assert("H14-F: extraPersonPerNight = 20",  BETA_HOST_CONFIG.guestSupplements.extraPersonPerNight, 20);
assert("H14-F: maxGuests = 4",             BETA_HOST_CONFIG.guestSupplements.maxGuests, 4);

// H14-G: buildMarketIntelligenceContext → Riccione, no Senigallia
const mktCtxBeta = buildMarketIntelligenceContext(BETA_HOST_CONFIG);
assertTruthy("H14-G: area contiene Riccione",          mktCtxBeta.area.includes("Riccione"));
assertTruthy("H14-G: area no Senigallia",              !mktCtxBeta.area.includes("Senigallia"));
assertTruthy("H14-G: area no Spiaggia di Velluto",    !mktCtxBeta.area.includes("Spiaggia di Velluto"));

// H14-H: buildLegalMarketContext → no_kb per Riccione
const legalCtxBeta  = buildLegalMarketContext(BETA_HOST_CONFIG);
const legalBetaStr  = JSON.stringify(legalCtxBeta);
assert(      "H14-H: kb_source = none",                legalCtxBeta.kb_source, "none");
assertTruthy("H14-H: areas_covered vuoto",             legalCtxBeta.areas_covered.length === 0);
assertTruthy("H14-H: area = Riccione",                 legalCtxBeta.area === "Riccione");
assertTruthy("H14-H: no senigallia_lungomare",        !legalBetaStr.includes("senigallia_lungomare"));
assertTruthy("H14-H: no Senigallia nel legal ctx",    !legalBetaStr.includes("Senigallia"));

// H14-I: buildFallbackPromoText → usa locationLine Riccione
const slotBeta = {
  aptId: "cam1", aptLabel: "Camera 1",
  start: "2026-08-01", end: "2026-08-08",
  nights: 7, weeks: 1, month: 8, estimatedValue: 1330, daysUntilStart: 30,
};
const promoBeta = buildFallbackPromoText(slotBeta, { label: "Camera 1" }, BETA_HOST_CONFIG);
assertTruthy("H14-I: promo no Senigallia",          !promoBeta.fullText.includes("Senigallia"));
assertTruthy("H14-I: promo no Spiaggia di Velluto", !promoBeta.fullText.includes("Spiaggia di Velluto"));
assertTruthy("H14-I: promo usa locationLine Riccione", promoBeta.fullText.includes("Riccione"));

// H14-J: buildMarketGuidance competitors → no Senigallia, ha Riccione
const guideBeta = buildMarketGuidance("competitors", BETA_HOST_CONFIG);
assertTruthy("H14-J: guidance no Senigallia",  !guideBeta.guidance.includes("Senigallia"));
assertTruthy("H14-J: guidance ha Riccione",     guideBeta.guidance.includes("Riccione"));

// H14-K: generateMarketPricingAdvice → intent_hint = no_kb per Riccione
const adviceBeta    = generateMarketPricingAdvice({ hostConfig: BETA_HOST_CONFIG });
const adviceBetaStr = JSON.stringify(adviceBeta);
assert(      "H14-K: intent_hint = no_kb",              adviceBeta.intent_hint, "no_kb");
assertTruthy("H14-K: no senigallia_lungomare",         !adviceBetaStr.includes("senigallia_lungomare"));
assertTruthy("H14-K: no KB strategica Senigallia",     !adviceBetaStr.includes("KB strategica Senigallia"));
assertTruthy("H14-K: no KB strategica Riccione su dati SN", !adviceBetaStr.includes("KB strategica Riccione"));

// H14-L: getRentalPricingRules funziona con beta config senza errori
let rulesBetaNoThrow = true;
let rulesBeta;
try {
  rulesBeta = getRentalPricingRules(BETA_HOST_CONFIG);
} catch (e) {
  rulesBetaNoThrow = false;
}
assertTruthy("H14-L: getRentalPricingRules no throw con beta config", rulesBetaNoThrow);
assertTruthy("H14-L: seasonal_rates[8] presente",    rulesBeta?.seasonal_rates?.[8] != null);
assert("H14-L: agosto weekly = 1330 (nightly×7)",    rulesBeta?.seasonal_rates?.[8]?.weekly, 1330);
assert("H14-L: agosto season = peak",                rulesBeta?.seasonal_rates?.[8]?.season, "peak");

// H14-M: Lorenzo DEFAULT invariato (invariant check)
assert("H14-M: Lorenzo identity.city = Senigallia",         DEFAULT_HOST_CONFIG.identity.city,              "Senigallia");
assert("H14-M: Lorenzo stayRules.checkInDayOfWeek = 6",     DEFAULT_HOST_CONFIG.stayRules.checkInDayOfWeek, 6);
assert("H14-M: Lorenzo stayRules.minNights = undefined",    DEFAULT_HOST_CONFIG.stayRules.minNights,        undefined);
assert("H14-M: Lorenzo apartments.length = 2",              DEFAULT_HOST_CONFIG.apartments.length,          2);
assert("H14-M: Lorenzo seasonalRates[8].weekly = 800",      DEFAULT_HOST_CONFIG.seasonalRates[8].weekly,    800);
assertTruthy("H14-M: Lorenzo locationLine ha Senigallia",   DEFAULT_HOST_CONFIG.identity.locationLine.includes("Senigallia"));

console.log("\n────────────────────────────────────────────────────────────────────");
console.log(`Totale: ${passed + failed} test — ✓ ${passed} passati, ${failed > 0 ? "✗ " + failed + " falliti" : "0 falliti"}`);
if (failed > 0) process.exit(1);
