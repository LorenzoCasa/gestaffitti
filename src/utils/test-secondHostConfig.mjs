/**
 * test-secondHostConfig.mjs — M4: Second Host Config Test
 *
 * Verifica che il motore GestAffitti funzioni con TEST_HOST_CONFIG (Pineto/Abruzzo)
 * senza modificare il comportamento di DEFAULT_HOST_CONFIG (Lorenzo/Senigallia).
 *
 * Aree testate:
 *   A. Listing resolver
 *   B. Apartment detection / Manager Agent Brain
 *   C. Pricing
 *   D. Stay rules
 *   E. Alternatives
 *   F. Rental Agent Orchestrator
 *   G. Business Brain / Promotion
 *   H. Isolamento cross-config (Lorenzo non interferisce con Pineto e viceversa)
 *   I. Manager Agent Commands con secondo host
 *
 * Run: node src/utils/test-secondHostConfig.mjs
 */

import { TEST_HOST_CONFIG }             from "../config/testHostConfig.js";
import { DEFAULT_HOST_CONFIG }          from "../config/hostConfig.js";
import { resolveListingFromTitle }      from "./agentListingResolver.js";
import { getSubitoSeasonalPrice }       from "./agentSeasonalRates.js";
import { checkStayRules }               from "./agentStayRules.js";
import { findAlternatives, findWindowsInMonth } from "./agentAlternatives.js";
import { interpretMessage }             from "./managerAgentBrain.js";
import { parseOwnerCommand, validateCommand } from "./managerAgentCommands.js";
import { runRentalAgent }               from "./rentalAgentOrchestrator.js";
import { getRentalPricingRules, draftSubitoPromotion, analyzeFreeSlots } from "./rentalBusinessBrain.js";

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
    console.error(`  ✗ ${label}: got falsy (${JSON.stringify(value)})`);
    failed++;
  }
}

function assertNull(label, value) {
  if (value === null || value === undefined) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected null, got ${JSON.stringify(value)}`);
    failed++;
  }
}

function assertNotEqual(label, actual, notExpected) {
  if (actual !== notExpected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: should NOT be ${JSON.stringify(notExpected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Runtime apartments for second host ───────────────────────────────────────

const PINETO_APTS = [
  { id: "unitA", label: "Villa del Pino" },
  { id: "unitB", label: "Casa del Pino" },
  { id: "all",   label: "Tutti" },
];

const LORENZO_APTS = [
  { id: "apt1", label: "Appartamento A" },
  { id: "apt2", label: "Appartamento B" },
  { id: "all",  label: "Tutti" },
];

// ── A. Listing resolver ───────────────────────────────────────────────────────

console.log("\n── A. Listing resolver ──────────────────────────────────────────────────");

// A01: titolo Pineto unitA risolve a unitA
assert("A01: subitoTitle Pineto unitA → unitA",
  resolveListingFromTitle("Pineto Abruzzo Villa del Pino Vacanze Estive", PINETO_APTS, null, TEST_HOST_CONFIG),
  "unitA");

// A02: titolo Pineto unitB risolve a unitB
assert("A02: subitoTitle Pineto unitB → unitB",
  resolveListingFromTitle("Pineto Abruzzo Casa del Pino Vacanze Estive", PINETO_APTS, null, TEST_HOST_CONFIG),
  "unitB");

// A03: titolo Lorenzo non risolve appartamenti Pineto
assertNull("A03: titolo Lorenzo non risolve unitA/unitB",
  resolveListingFromTitle("Lungomare Senigallia Appartamento Estivo 1", PINETO_APTS, null, TEST_HOST_CONFIG));

// A04: titolo Pineto non risolve appartamenti Lorenzo
assertNull("A04: titolo Pineto non risolve apt1/apt2",
  resolveListingFromTitle("Pineto Abruzzo Villa del Pino Vacanze Estive", LORENZO_APTS, null, DEFAULT_HOST_CONFIG));

// A05: titolo generico non produce falso positivo
assertNull("A05: titolo generico → null",
  resolveListingFromTitle("Casa vacanze sul mare", PINETO_APTS, null, TEST_HOST_CONFIG));

// A06: Lorenzo apt1 risolve correttamente con DEFAULT_HOST_CONFIG (invariato)
assert("A06: Lorenzo apt1 invariato",
  resolveListingFromTitle("Lungomare Senigallia Appartamento Estivo 1", LORENZO_APTS, null, DEFAULT_HOST_CONFIG),
  "apt1");

// ── B. Apartment detection / Manager Agent Brain ──────────────────────────────

console.log("\n── B. Apartment detection / Manager Agent Brain ─────────────────────────");

const CTX_PINETO = {
  apartments: PINETO_APTS,
  bookings: [], inbox: [], decisions: [],
  hostConfig: TEST_HOST_CONFIG,
};

const CTX_LORENZO = {
  apartments: LORENZO_APTS,
  bookings: [], inbox: [], decisions: [],
  hostConfig: DEFAULT_HOST_CONFIG,
};

// B01: naturalAliasPattern Pineto unitA — il pattern viene usato in detectApartment,
// verifichiamo che sull'alpha faccia riconoscere l'appartamento (tramite create_booking)
const rB01 = interpretMessage("crea prenotazione sull'alpha dal 5/7 al 12/7 prezzo 700", CTX_PINETO);
// intent riconosciuto + aptId risolto via naturalAliasPattern → non rimane no_action
assertNotEqual("B01: 'sull'alpha' con create_booking → intent non no_action", rB01.intent, "no_action");

// B02: naturalAliasPattern Pineto unitB
const rB02 = interpretMessage("prenotazione sull'beta dal 5/7 al 12/7 prezzo 700", CTX_PINETO);
assertNotEqual("B02: sull'beta riconosciuto", rB02.intent, "no_action");

// B03: id diretto "unitA" riconosciuto
const rB03 = interpretMessage("arrivato Rossi, fa check-in unitA", CTX_PINETO);
assert("B03: unitA → intent mark_checkin_done", rB03.intent, "mark_checkin_done");

// B04: label "Villa del Pino" riconosciuta
const rB04 = interpretMessage("crea prenotazione Villa del Pino", CTX_PINETO);
assertNotEqual("B04: 'Villa del Pino' → intent recognized", rB04.intent, "no_action");

// B05: "apt 1" NON deve risolvere unitA (numericAlias: null per Pineto)
const rB05 = interpretMessage("crea prenotazione Mario Bianchi apt 1 dal 5/7 al 12/7 prezzo 700", CTX_PINETO);
// With numericAlias: null, "apt 1" should not map to unitA
const aptB05 = rB05.action_plan?.payload?.aptId ?? null;
assertNotEqual("B05: 'apt 1' NON risolve unitA con numericAlias: null", aptB05, "unitA");

// B06: "apt 1" non risolve "apt1" in un contesto Pineto (no cross-contamination)
assertNotEqual("B06: aptId risultante non è 'apt1' nel contesto Pineto", aptB05, "apt1");

// B07: Lorenzo "sull'uno" invariato con DEFAULT_HOST_CONFIG
const rB07 = interpretMessage("metti ospite sull'uno", CTX_LORENZO);
assertNotEqual("B07: Lorenzo sull'uno ancora riconosciuto", rB07.intent, "no_action");

// B08: hint appartamento nel messaggio di missing usa gli id di Pineto
// Serve un ospite già in bookings + nessun appartamento specificato nel testo
// → resolveContext trova l'ospite → buildOperativePlan → missing apt hint
const booksB08 = [
  { id: "bx1", guest: "Mario Bianchi", apt: "unitB", checkin: "2026-08-01", checkout: "2026-08-08", status: "confirmed" },
];
const rB08 = interpretMessage("crea prenotazione Mario Bianchi dal 5/7 al 12/7 prezzo 700", {
  ...CTX_PINETO, bookings: booksB08,
});
// No apartment specified → clarification should mention unitA/unitB
const replyB08 = rB08.reply ?? "";
assertTruthy("B08: hint missing apt menziona 'unitA' o 'unitB'",
  replyB08.includes("unitA") || replyB08.includes("unitB"));
assertTruthy("B08: hint missing apt NON menziona 'apt1' o 'apt2'",
  !replyB08.includes("apt1") && !replyB08.includes("apt2"));

// ── C. Pricing ───────────────────────────────────────────────────────────────

console.log("\n── C. Pricing ───────────────────────────────────────────────────────────");

// C01: luglio weekly Pineto = 700
const pC01 = getSubitoSeasonalPrice({ checkin: "2026-07-04", checkout: "2026-07-11" }, TEST_HOST_CONFIG);
assert("C01: Pineto luglio 7n = €700", pC01.totalPrice, 700);
assert("C01: weeklyRate = 700", pC01.weeklyRate, 700);

// C02: agosto weekly Pineto = 700
const pC02 = getSubitoSeasonalPrice({ checkin: "2026-08-01", checkout: "2026-08-08" }, TEST_HOST_CONFIG);
assert("C02: Pineto agosto 7n = €700", pC02.totalPrice, 700);

// C03: settembre Pineto 7n = 350
const pC03 = getSubitoSeasonalPrice({ checkin: "2026-09-05", checkout: "2026-09-12" }, TEST_HOST_CONFIG);
assert("C03: Pineto settembre 7n = €350", pC03.totalPrice, 350);

// C04: mese intero luglio Pineto = 2200
const pC04 = getSubitoSeasonalPrice({ isFullMonth: true, fullMonthNum: 7 }, TEST_HOST_CONFIG);
assert("C04: Pineto luglio mensile = €2200", pC04.totalPrice, 2200);

// C05: giugno NON è in stagione per Pineto → null
const pC05 = getSubitoSeasonalPrice({ checkin: "2026-06-06", checkout: "2026-06-13" }, TEST_HOST_CONFIG);
assertNull("C05: Pineto giugno non in stagione → totalPrice null", pC05.totalPrice);
assert("C05: reason = month_not_in_season", pC05.reason, "month_not_in_season");

// C06: 14 notti Pineto luglio = 1400
const pC06 = getSubitoSeasonalPrice({ checkin: "2026-07-04", checkout: "2026-07-18" }, TEST_HOST_CONFIG);
assert("C06: Pineto luglio 14n = €1400", pC06.totalPrice, 1400);

// C07: Lorenzo prezzi invariati con DEFAULT_HOST_CONFIG
const pC07 = getSubitoSeasonalPrice({ checkin: "2026-08-01", checkout: "2026-08-08" }, DEFAULT_HOST_CONFIG);
assert("C07: Lorenzo agosto 7n = €800 (invariato)", pC07.totalPrice, 800);

// C08: giugno Lorenzo = 500 (invariato)
const pC08 = getSubitoSeasonalPrice({ checkin: "2026-06-06", checkout: "2026-06-13" }, DEFAULT_HOST_CONFIG);
assert("C08: Lorenzo giugno 7n = €500 (invariato)", pC08.totalPrice, 500);

// C09: getSubitoSeasonalPrice non applica validNights (quella è responsabilità di checkStayRules).
// 21 notti luglio Pineto → prezzo calcolato normalmente (3 settimane × 700), ma
// checkStayRules (D03) la rifiuta separatamente.
const pC09 = getSubitoSeasonalPrice({ checkin: "2026-07-04", checkout: "2026-07-25" }, TEST_HOST_CONFIG);
assert("C09: Pineto 21n → €2100 (prezzo calcolato; stay rules separate lo rifiutano)", pC09.totalPrice, 2100);

// ── D. Stay rules ─────────────────────────────────────────────────────────────

console.log("\n── D. Stay rules ────────────────────────────────────────────────────────");

// D01: luglio sab-sab 7n Pineto → valid
const rD01 = checkStayRules("2026-07-04", "2026-07-11", {}, TEST_HOST_CONFIG);
assert("D01: Pineto luglio sab-sab 7n → valid", rD01.valid, true);

// D02: luglio sab-sab 14n Pineto → valid
const rD02 = checkStayRules("2026-07-04", "2026-07-18", {}, TEST_HOST_CONFIG);
assert("D02: Pineto luglio sab-sab 14n → valid", rD02.valid, true);

// D03: luglio 21n Pineto → invalid (validNights [7,14], non include 21)
const rD03 = checkStayRules("2026-07-04", "2026-07-25", {}, TEST_HOST_CONFIG);
assert("D03: Pineto luglio 21n → invalid (no 21 in validNights)", rD03.valid, false);

// D04: giugno Pineto NON è peak → valid anche dom-dom
const rD04 = checkStayRules("2026-06-07", "2026-06-14", {}, TEST_HOST_CONFIG);
assert("D04: Pineto giugno non-peak → valid (flessibile)", rD04.valid, true);

// D05: Lorenzo giugno peak → non sab-sab invalid (invariato)
const rD05 = checkStayRules("2026-06-07", "2026-06-14", {}, DEFAULT_HOST_CONFIG);
assert("D05: Lorenzo giugno dom-dom → invalid (peak, invariato)", rD05.valid, false);

// D06: luglio Pineto non-sab → invalid con suggerimenti basati su validNights [7,14]
const rD06 = checkStayRules("2026-07-06", "2026-07-13", {}, TEST_HOST_CONFIG); // lunedì
assert("D06: Pineto luglio lun-lun → invalid", rD06.valid, false);
assertTruthy("D06: suggestedValidRanges non vuoto", rD06.suggestedValidRanges.length > 0);
// Suggested ranges should only contain 7 or 14 nights (not 21)
const hasOnly7or14 = rD06.suggestedValidRanges.every(r => r.nights === 7 || r.nights === 14);
assertTruthy("D06: suggerimenti solo 7 o 14 notti (no 21)", hasOnly7or14);

// D07: Lorenzo sab-sab 7n luglio ancora valid (invariato)
const rD07 = checkStayRules("2026-07-04", "2026-07-11", {}, DEFAULT_HOST_CONFIG);
assert("D07: Lorenzo luglio sab-sab 7n → valid (invariato)", rD07.valid, true);

// D08: Lorenzo 21n luglio valid (invariato)
const rD08 = checkStayRules("2026-07-04", "2026-07-25", {}, DEFAULT_HOST_CONFIG);
assert("D08: Lorenzo luglio 21n → valid (invariato)", rD08.valid, true);

// ── E. Alternatives ───────────────────────────────────────────────────────────

console.log("\n── E. Alternatives ──────────────────────────────────────────────────────");

const BOOKINGS_PINETO = [
  { id: "p1", apt: "unitA", apt_id: "unitA", guest: "Ospite Uno",
    checkin: "2026-07-04", checkout: "2026-07-11", status: "confirmed" },
];

// E01: alternativa stessa settimana unitB disponibile
const altE01 = findAlternatives({
  aptId: "unitA", requestedCheckin: "2026-07-04", requestedCheckout: "2026-07-11",
  apartments: PINETO_APTS, bookings: BOOKINGS_PINETO,
}, TEST_HOST_CONFIG);
assertTruthy("E01: alternativa trovata (unitB stesso periodo)", altE01.length > 0);
assertTruthy("E01: alternativa è unitB",
  altE01.some(a => a.aptId === "unitB"));

// E02: alternativa ha pricing corretto Pineto (non Lorenzo)
if (altE01.length > 0 && altE01[0].pricing) {
  assertNotEqual("E02: pricing alternativa non è €800 (Lorenzo)", altE01[0].pricing.totalPrice, 800);
  assert("E02: pricing alternativa = €700 (Pineto luglio)", altE01[0].pricing.totalPrice, 700);
}

// E03: alternativa NON produce apt1/apt2
const hasNoLorenzo = altE01.every(a => a.aptId !== "apt1" && a.aptId !== "apt2");
assertTruthy("E03: alternative non contengono apt1 o apt2", hasNoLorenzo);

// E04: maxAlternativeOffsetDays=14 per Pineto (non 15)
// Richiesta martedì non-sat → alternative entro 14 giorni (non 15)
const altE04 = findAlternatives({
  aptId: "unitA", requestedCheckin: "2026-07-07", requestedCheckout: "2026-07-14",
  apartments: PINETO_APTS, bookings: [],
}, TEST_HOST_CONFIG);
if (altE04.length > 0) {
  const maxOffset = Math.max(...altE04.map(a => {
    const diff = Math.abs(new Date(a.checkin).getTime() - new Date("2026-07-07").getTime()) / 86400000;
    return diff;
  }));
  assertTruthy("E04: offset max alternativa ≤ 14 giorni (Pineto)", maxOffset <= 14);
}

// E05: findWindowsInMonth per Pineto — solo 7 o 14 notti (no 21)
const winsE05 = findWindowsInMonth({
  aptId: "unitA", aptLabel: "Villa del Pino", month: 7, nights: 7,
  bookings: [], year: 2026, maxTotal: 3,
}, TEST_HOST_CONFIG);
assertTruthy("E05: windows luglio 7n trovate per Pineto", winsE05.length > 0);
const allUnitA = winsE05.every(w => w.aptId === "unitA");
assertTruthy("E05: windows sono per unitA", allUnitA);

// E06: findWindowsInMonth 21n non valide per Pineto (validNights: [7,14])
const winsE06 = findWindowsInMonth({
  aptId: "unitA", aptLabel: "Villa del Pino", month: 7, nights: 21,
  bookings: [], year: 2026, maxTotal: 3,
}, TEST_HOST_CONFIG);
assert("E06: 21 notti non valide per Pineto → vuoto", winsE06.length, 0);

// E07: Lorenzo alternatives invariate (apt1/apt2, offset 15)
const BOOKINGS_LORENZO = [
  { id: "l1", apt: "apt1", apt_id: "apt1", guest: "Ospite",
    checkin: "2026-07-04", checkout: "2026-07-11", status: "confirmed" },
];
const altE07 = findAlternatives({
  aptId: "apt1", requestedCheckin: "2026-07-04", requestedCheckout: "2026-07-11",
  apartments: LORENZO_APTS, bookings: BOOKINGS_LORENZO,
}, DEFAULT_HOST_CONFIG);
assertTruthy("E07: Lorenzo alternative trovate (invariato)", altE07.length > 0);
const hasApt2 = altE07.some(a => a.aptId === "apt2");
assertTruthy("E07: alternativa Lorenzo include apt2", hasApt2);

// ── F. Rental Agent Orchestrator ──────────────────────────────────────────────

console.log("\n── F. Rental Agent Orchestrator ─────────────────────────────────────────");

// F01: runRentalAgent con TEST_HOST_CONFIG — luglio 7n = 700
const rF01 = runRentalAgent({
  rawText:    "vorrei prenotare dal 4 luglio all'11 luglio",
  rawMetadata: {},
  formData:   { aptId: "unitA", checkin: "2026-07-04", checkout: "2026-07-11", guests: 2, source: "subito" },
  apartments: PINETO_APTS,
  bookings:   [],
  aptRules:   [],
  hostConfig: TEST_HOST_CONFIG,
});
assert("F01: Pineto luglio 7n totalPrice = €700", rF01.seasonalPrice.totalPrice, 700);

// F02: stay rules: luglio Pineto sab-sab → valid
assert("F02: Pineto luglio sab-sab → stayRuleResult.valid", rF01.stayRuleResult.valid, true);

// F03: response non contiene "Senigallia"
assertTruthy("F03: risposta non contiene 'Senigallia'",
  !(rF01.subitoResponse?.responseText ?? "").includes("Senigallia"));

// F04: runRentalAgent con DEFAULT_HOST_CONFIG — agosto 7n = 800 (invariato)
const rF04 = runRentalAgent({
  rawText:    "agosto settimana",
  rawMetadata: {},
  formData:   { aptId: "apt1", checkin: "2026-08-01", checkout: "2026-08-08", guests: 2, source: "subito" },
  apartments: LORENZO_APTS,
  bookings:   [],
  aptRules:   [],
  hostConfig: DEFAULT_HOST_CONFIG,
});
assert("F04: Lorenzo agosto 7n = €800 (invariato)", rF04.seasonalPrice.totalPrice, 800);

// F05: Pineto giugno non in stagione → pricing null
const rF05 = runRentalAgent({
  rawText:    "giugno",
  rawMetadata: {},
  formData:   { aptId: "unitA", checkin: "2026-06-06", checkout: "2026-06-13", guests: 2, source: "subito" },
  apartments: PINETO_APTS,
  bookings:   [],
  aptRules:   [],
  hostConfig: TEST_HOST_CONFIG,
});
assertNull("F05: Pineto giugno totalPrice null (non in stagione)", rF05.seasonalPrice.totalPrice);

// F06: Pineto giugno NON è peak → stayRules valid
assert("F06: Pineto giugno non-peak → stayRules valid", rF05.stayRuleResult.valid, true);

// F07: Pineto 21n luglio → stayRules invalid
const rF07 = runRentalAgent({
  rawText:    "3 settimane luglio",
  rawMetadata: {},
  formData:   { aptId: "unitA", checkin: "2026-07-04", checkout: "2026-07-25", guests: 2, source: "subito" },
  apartments: PINETO_APTS,
  bookings:   [],
  aptRules:   [],
  hostConfig: TEST_HOST_CONFIG,
});
assert("F07: Pineto 21n luglio → stayRuleResult invalid", rF07.stayRuleResult.valid, false);

// ── G. Business Brain / Promotion ────────────────────────────────────────────

console.log("\n── G. Business Brain / Promotion ────────────────────────────────────────");

const pinetoRules = getRentalPricingRules(TEST_HOST_CONFIG);
const lorenzoRules = getRentalPricingRules(DEFAULT_HOST_CONFIG);

// G01: pricingRules Pineto usa i prezzi del secondo host
assert("G01: Pineto pricingRules luglio weekly = 700", pinetoRules.seasonal_rates[7].weekly, 700);

// G02: giugno non in Pineto pricingRules
assertTruthy("G02: giugno non in Pineto seasonal_rates", pinetoRules.seasonal_rates[6] === undefined);

// G03: Lorenzo pricingRules invariati
assert("G03: Lorenzo pricingRules agosto weekly = 800 (invariato)", lorenzoRules.seasonal_rates[8].weekly, 800);
assert("G03: Lorenzo pricingRules giugno = 500 (invariato)", lorenzoRules.seasonal_rates[6].weekly, 500);

// G04: draftSubitoPromotion usa locationLine del secondo host
const slotG04 = {
  aptId: "unitA", aptLabel: "Villa del Pino",
  start: "2026-07-04", end: "2026-07-11",
  nights: 7, weeks: 1, month: 7, season: "peak",
  estimatedValue: 700, urgencyLevel: "medium", daysUntilStart: 20,
};
const promoG04 = draftSubitoPromotion(slotG04, pinetoRules, { label: "Villa del Pino" }, TEST_HOST_CONFIG);
assertTruthy("G04: promozione usa locationLine Pineto",
  promoG04.body.includes("Pineto Lungomare") || promoG04.body.includes("Costa dei Trabocchi"));
assertTruthy("G04: promozione NON contiene 'Senigallia'",
  !promoG04.body.includes("Senigallia"));
assertTruthy("G04: promozione NON contiene 'Velluto'",
  !promoG04.body.includes("Velluto"));

// G05: draftSubitoPromotion Lorenzo invariata
const slotG05 = {
  aptId: "apt1", aptLabel: "Appartamento A",
  start: "2026-08-01", end: "2026-08-08",
  nights: 7, weeks: 1, month: 8, season: "peak",
  estimatedValue: 800, urgencyLevel: "medium", daysUntilStart: 37,
};
const promoG05 = draftSubitoPromotion(slotG05, lorenzoRules, { label: "Appartamento A" }, DEFAULT_HOST_CONFIG);
assertTruthy("G05: promozione Lorenzo contiene 'Senigallia' (invariato)",
  promoG05.body.includes("Senigallia"));

// G06: analyzeFreeSlots Pineto usa i seasonalRates corretti
const BOOKINGS_PINETO_FULL = [
  { id: "p1", apt: "unitA", apt_id: "unitA", guest: "Ospite",
    checkin: "2026-08-01", checkout: "2026-08-08", status: "confirmed" },
];
const slotsG06 = analyzeFreeSlots(BOOKINGS_PINETO_FULL, PINETO_APTS, pinetoRules, "2026-07-01");
assertTruthy("G06: analyzeFreeSlots Pineto trova slot liberi", slotsG06.length > 0);
// Slot liberi non devono avere weeklyRate di Lorenzo (500 o 800)
const hasLorenzoPrices = slotsG06.some(s => s.weeklyRate === 500 || (s.weeklyRate === 800 && s.season === "peak"));
// weeklyRate 700 o 350 sono Pineto, 800 non esiste per Pineto
const allPinetoRates = slotsG06.every(s => s.weeklyRate === null || s.weeklyRate === 700 || s.weeklyRate === 350);
assertTruthy("G06: slot Pineto usano prezzi Pineto (700/350, non 800 di Lorenzo)", allPinetoRates);

// ── H. Isolamento cross-config ────────────────────────────────────────────────

console.log("\n── H. Isolamento cross-config ───────────────────────────────────────────");

// H01: subitoTitle Lorenzo non risolve unitA/unitB in Pineto config
assertNull("H01: Lorenzo subitoTitle non risolve unità Pineto",
  resolveListingFromTitle("lungomare senigallia appartamento estivo 1", PINETO_APTS, null, TEST_HOST_CONFIG));

// H02: subitoTitle Pineto non risolve apt1/apt2 in Lorenzo config
assertNull("H02: Pineto subitoTitle non risolve apt1/apt2",
  resolveListingFromTitle("pineto abruzzo villa del pino vacanze estive", LORENZO_APTS, null, DEFAULT_HOST_CONFIG));

// H03: interpretMessage "sull'uno" non funziona nel contesto Pineto
const rH03 = interpretMessage("metti ospite sull'uno", CTX_PINETO);
// sull'uno è pattern Lorenzo (naturalAliasPattern di apt1) — non deve risolvere a nessun unitA/unitB
const aptH03 = rH03.action_plan?.payload?.aptId ?? null;
assertNotEqual("H03: 'sull'uno' non risolve a unitA nel contesto Pineto", aptH03, "unitA");

// H04: interpretMessage "sull'alpha" non funziona nel contesto Lorenzo
const rH04 = interpretMessage("metti ospite sull'alpha", CTX_LORENZO);
const aptH04 = rH04.action_plan?.payload?.aptId ?? null;
assertNotEqual("H04: 'sull'alpha' non risolve a apt1 nel contesto Lorenzo", aptH04, "apt1");

// H05: prezzi non si mescolano — Pineto luglio non prende prezzo Lorenzo agosto
const pricePineto = getSubitoSeasonalPrice({ checkin: "2026-07-04", checkout: "2026-07-11" }, TEST_HOST_CONFIG);
const priceLorenzo = getSubitoSeasonalPrice({ checkin: "2026-07-04", checkout: "2026-07-11" }, DEFAULT_HOST_CONFIG);
assertNotEqual("H05: Pineto luglio 7n ≠ Lorenzo luglio 7n", pricePineto.totalPrice, priceLorenzo.totalPrice);
assert("H05: Pineto luglio = €700", pricePineto.totalPrice, 700);
assert("H05: Lorenzo luglio = €800", priceLorenzo.totalPrice, 800);

// H06: stayRules non si mescolano — giugno Pineto vs Lorenzo
// Giugno 7, 2026 è domenica → sabato-sabato non rispettato → invalid per Lorenzo (peak)
const srPineto  = checkStayRules("2026-06-07", "2026-06-14", {}, TEST_HOST_CONFIG);
const srLorenzo = checkStayRules("2026-06-07", "2026-06-14", {}, DEFAULT_HOST_CONFIG);
assert("H06: Pineto giugno non-peak → valid (dom-dom ok perché non-peak)", srPineto.valid, true);
assert("H06: Lorenzo giugno peak dom-dom → invalid (sab-sab richiesto)", srLorenzo.valid, false);

// ── I. Manager Agent Commands con secondo host ────────────────────────────────

console.log("\n── I. Manager Agent Commands — second host ──────────────────────────────");

// I01: parseOwnerCommand con Pineto — id "unitA" riconosciuto
const cmdI01 = parseOwnerCommand(
  "crea prenotazione per Mario Rossi in unitA dal 5/7 al 12/7 prezzo 700",
  { apartments: PINETO_APTS, hostConfig: TEST_HOST_CONFIG }
);
assert("I01: parseOwnerCommand → intent create_booking", cmdI01.intent, "create_booking");
assert("I01: aptId = unitA", cmdI01.rawParams.aptId, "unitA");

// I02: parseOwnerCommand con Pineto — label "Villa del Pino" riconosciuta
const cmdI02 = parseOwnerCommand(
  "crea prenotazione per Anna Bianchi in Villa del Pino dal 5/7 al 12/7 prezzo 700",
  { apartments: PINETO_APTS, hostConfig: TEST_HOST_CONFIG }
);
assert("I02: label Villa del Pino → unitA", cmdI02.rawParams.aptId, "unitA");

// I03: parseOwnerCommand Pineto — "apt 1" non risolve nessun unitX (numericAlias: null)
const cmdI03 = parseOwnerCommand(
  "crea prenotazione per Test in apt 1 dal 5/7 al 12/7 prezzo 700",
  { apartments: PINETO_APTS, hostConfig: TEST_HOST_CONFIG }
);
assertNull("I03: 'apt 1' non risolve unitA con numericAlias: null", cmdI03.rawParams.aptId);

// I04: validateCommand error hint usa ids Pineto
const validI04 = validateCommand(
  { intent: "create_booking", rawParams: { guest: "Test", aptId: null, checkin: "2026-07-04", checkout: "2026-07-11", price: 700 } },
  { apartments: PINETO_APTS, hostConfig: TEST_HOST_CONFIG }
);
assert("I04: validateCommand → invalid", validI04.valid, false);
const errorHintI04 = validI04.errors.join(" ");
assertTruthy("I04: error menziona 'unitA'", errorHintI04.includes("unitA"));
assertTruthy("I04: error NON menziona 'apt1'", !errorHintI04.includes("apt1"));

// I05: Lorenzo parseOwnerCommand invariato — apt1 riconosciuto
const cmdI05 = parseOwnerCommand(
  "crea prenotazione per Giovanni Greco in apt1 dal 19/7 al 26/7 prezzo 800",
  { apartments: LORENZO_APTS, hostConfig: DEFAULT_HOST_CONFIG }
);
assert("I05: Lorenzo apt1 invariato", cmdI05.rawParams.aptId, "apt1");

// I06: Lorenzo validateCommand error hint invariato — menziona apt1/apt2
const validI06 = validateCommand(
  { intent: "create_booking", rawParams: { guest: "Test", aptId: null, checkin: "2026-07-04", checkout: "2026-07-11", price: 800 } },
  { apartments: LORENZO_APTS, hostConfig: DEFAULT_HOST_CONFIG }
);
const errorHintI06 = validI06.errors.join(" ");
assertTruthy("I06: Lorenzo error hint menziona apt1", errorHintI06.includes("apt1"));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n────────────────────────────────────────────────────────────────────────");
console.log(`M4 Second Host Config Test: ${passed + failed} test — ✓ ${passed} passati, ${failed > 0 ? "✗ " + failed + " falliti" : "0 falliti"}`);
if (failed > 0) process.exit(1);
