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
import { getSubitoSeasonalPrice } from "./agentSeasonalRates.js";
import { checkStayRules }          from "./agentStayRules.js";
import { getRentalPricingRules, draftSubitoPromotion, analyzeFreeSlots } from "./rentalBusinessBrain.js";
import { resolveListingFromTitle, extractListingTitle } from "./agentListingResolver.js";
import { interpretMessage }        from "./managerAgentBrain.js";
import { buildAgentContext }        from "./buildAgentContext.js";

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

console.log("\n────────────────────────────────────────────────────────────────────");
console.log(`Totale: ${passed + failed} test — ✓ ${passed} passati, ${failed > 0 ? "✗ " + failed + " falliti" : "0 falliti"}`);
if (failed > 0) process.exit(1);
