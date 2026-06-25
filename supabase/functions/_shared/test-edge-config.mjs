/**
 * test-edge-config.mjs — M3: Edge Config Sync
 *
 * Verifica che _shared/hostConfig.ts (Edge) sia allineato con
 * src/config/hostConfig.js (frontend). Legge il file TS come testo
 * e confronta i valori chiave — cattura drift se i prezzi vengono
 * aggiornati in un solo posto.
 *
 * Run: node supabase/functions/_shared/test-edge-config.mjs
 */

import { DEFAULT_HOST_CONFIG } from "../../../src/config/hostConfig.js";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const tsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "hostConfig.ts");
const ts = fs.readFileSync(tsPath, "utf8");

let passed = 0;
let failed = 0;

function assertContains(label, needle) {
  if (ts.includes(needle)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: "${needle}" non trovato in _shared/hostConfig.ts`);
    failed++;
  }
}

console.log("\n── E01: EDGE_SEASONAL_RATES ↔ DEFAULT_HOST_CONFIG.seasonalRates ──");
for (const [month, rates] of Object.entries(DEFAULT_HOST_CONFIG.seasonalRates)) {
  assertContains(`mese ${month} weekly: ${rates.weekly}`,  `weekly: ${rates.weekly}`);
  assertContains(`mese ${month} monthly: ${rates.monthly}`, `monthly: ${rates.monthly}`);
  assertContains(`mese ${month} name: "${rates.month}"`,    `"${rates.month}"`);
}

console.log("\n── E02: EDGE_PEAK_MONTHS ↔ DEFAULT_HOST_CONFIG.stayRules.peakMonths ──");
const peakMonths = DEFAULT_HOST_CONFIG.stayRules.peakMonths;
assertContains(`peakMonths: [${peakMonths.join(", ")}]`, peakMonths.join(", "));

console.log("\n── E03: EDGE_VALID_NIGHTS ↔ DEFAULT_HOST_CONFIG.stayRules.validNights ──");
const validNights = DEFAULT_HOST_CONFIG.stayRules.validNights;
assertContains(`validNights: [${validNights.join(", ")}]`, validNights.join(", "));

console.log("\n── E04: EDGE_SUBITO_TITLE_MAP ↔ DEFAULT_HOST_CONFIG.apartments ──");
for (const apt of DEFAULT_HOST_CONFIG.apartments) {
  assertContains(`subitoTitle: "${apt.subitoTitle}"`, `"${apt.subitoTitle}"`);
  assertContains(`aptId: "${apt.id}"`,                `"${apt.id}"`);
}

console.log("\n── E05: EDGE_HOST_IDENTITY ↔ DEFAULT_HOST_CONFIG.identity ──");
const id = DEFAULT_HOST_CONFIG.identity;
assertContains(`city: "${id.city}"`,         id.city);
assertContains(`region: "${id.region}"`,     id.region);
assertContains(`area: "${id.area}"`,         id.area);
assertContains(`locationLine: "${id.locationLine}"`, id.locationLine);
assertContains(`businessName: "${id.businessName}"`, id.businessName);

console.log("\n──────────────────────────────────────────────────────────────────");
console.log(`Totale: ${passed + failed} test — ✓ ${passed} passati, ${failed > 0 ? "✗ " + failed + " falliti" : "0 falliti"}`);
if (failed > 0) {
  console.error("\n⚠  DRIFT RILEVATO: aggiorna supabase/functions/_shared/hostConfig.ts");
  process.exit(1);
}
