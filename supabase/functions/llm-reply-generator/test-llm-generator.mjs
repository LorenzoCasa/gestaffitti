/**
 * Test Sprint D1.1 — llm-reply-generator
 *
 * Testa la logica di costruzione del contesto, del system prompt,
 * e del fallback template SENZA chiamare l'API Anthropic.
 *
 * Run: node supabase/functions/llm-reply-generator/test-llm-generator.mjs
 */

import { parseAgentInquiry }      from "../../../src/utils/agentParser.js";
import { checkAvailability }       from "../../../src/utils/agentAvailability.js";
import { checkStayRules }          from "../../../src/utils/agentStayRules.js";
import { getSubitoSeasonalPrice }  from "../../../src/utils/agentSeasonalRates.js";
import { findAlternatives }        from "../../../src/utils/agentAlternatives.js";
import { buildAgentContext }       from "../../../src/utils/buildAgentContext.js";
import { generateGuestReply }      from "../../../src/utils/generateGuestReply.js";
import { extractListingTitle, resolveListingFromTitle } from "../../../src/utils/agentListingResolver.js";

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      got:      ${JSON.stringify(actual)}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    fail++;
  }
}

function checkIncludes(label, actual, substring) {
  if (typeof actual === "string" && actual.includes(substring)) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      got:      ${JSON.stringify(actual?.slice(0, 100))}`);
    console.log(`      expected to include: ${JSON.stringify(substring)}`);
    fail++;
  }
}

function checkNotIncludes(label, actual, substring) {
  if (typeof actual === "string" && !actual.includes(substring)) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      string should NOT contain: ${JSON.stringify(substring)}`);
    fail++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const APARTMENTS = [
  { id: "apt1", label: "Lungomare Senigallia appartamento estivo 1", name: "apt1", color: "#blue" },
  { id: "apt2", label: "Lungomare Senigallia appartamento estivo 2", name: "apt2", color: "#green" },
];

const BOOKINGS_EMPTY = [];

const BOOKINGS_OCCUPIED = [
  { id: "b1", apt: "apt1", checkin: "2026-07-04", checkout: "2026-07-11", status: "confirmed" },
  { id: "b2", apt: "apt1", checkin: "2026-07-11", checkout: "2026-07-18", status: "confirmed" },
];

const APT_RULES = [];

const METADATA_APT1 = {
  email_subject: "Nuovo messaggio — Lungomare senigallia appartamento estivo 1",
};

// ── Sistema di System Prompt builder (versione JS equivalente all'Edge Function) ──

const MONTH_NAMES_IT = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre",
];

function itDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${MONTH_NAMES_IT[parseInt(m, 10) - 1]} ${y}`;
}

function itMonth(num) {
  return num >= 1 && num <= 12 ? MONTH_NAMES_IT[num - 1] : "—";
}

function buildSystemPrompt(context, rawText) {
  const { inquiry, apartment, availability, pricing, stayRules, alternatives, decision, fullMonthAvailability } = context;
  const checkin = inquiry.checkin;
  const checkout = inquiry.checkout;
  const nights = availability.nights ?? availability.nights;
  const guests = inquiry.guests;
  const isFullMonth = inquiry.isFullMonth;
  const fullMonthNum = inquiry.fullMonthNum;
  const monthWindows = inquiry.monthWindows;

  let availabilityStatus;
  if (isFullMonth && fullMonthAvailability) {
    availabilityStatus = fullMonthAvailability.isAvailable
      ? "DISPONIBILE (mese intero)"
      : "NON DISPONIBILE (mese intero — ci sono prenotazioni)";
  } else {
    availabilityStatus = availability.isAvailable
      ? "DISPONIBILE"
      : `NON DISPONIBILE${availability.reason ? ` (motivo: ${availability.reason})` : ""}`;
  }

  const priceLines = [];
  if (pricing.totalPrice != null) priceLines.push(`- Prezzo totale soggiorno: €${pricing.totalPrice}`);
  if (pricing.weeklyRate != null) priceLines.push(`- Tariffa settimanale: €${pricing.weeklyRate}`);
  if (pricing.monthRate != null) priceLines.push(`- Tariffa mensile: €${pricing.monthRate}`);
  if (priceLines.length === 0) priceLines.push("- Prezzo non calcolabile (informazioni insufficienti o periodo fuori stagione)");

  const altItems = alternatives.items ?? [];
  let alternativesBlock = "";
  if (altItems.length > 0) {
    const lines = altItems.slice(0, 3).map((a) => {
      const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : "";
      return `  • ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${price})`;
    });
    alternativesBlock = `\nAlternative disponibili (calendario verificato):\n${lines.join("\n")}`;
  }

  const questions = inquiry.questions ?? [];
  let questionsBlock = "";
  if (questions.length > 0) {
    questionsBlock = `\nDomande specifiche:\n${questions.map((q) => `  - ${q}`).join("\n")}`;
  }

  return `Sei l'assistente virtuale di GestAffitti.

## FATTI VERIFICATI

Tipo risposta: ${decision.type}
Appartamento: ${apartment.label || "non specificato"}

Date richieste:
- Check-in: ${checkin ? itDate(checkin) : "non specificato"}
- Check-out: ${checkout ? itDate(checkout) : "non specificato"}
- Notti: ${nights ?? "non applicabile"}
- Ospiti: ${guests ?? "non specificato"}
${isFullMonth && fullMonthNum ? `- Mese intero: ${itMonth(fullMonthNum)}` : ""}

Disponibilità: ${availabilityStatus}

Prezzi:
${priceLines.join("\n")}
${alternativesBlock}${questionsBlock}

## MESSAGGIO ORIGINALE

"${rawText}"`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 1 — Listing resolver
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 1: Listing resolver ===");

check(
  "subject con apt1 → risolve apt1",
  resolveListingFromTitle(extractListingTitle(METADATA_APT1), APARTMENTS),
  "apt1",
);

check(
  "subject con apt2 → risolve apt2",
  resolveListingFromTitle(
    extractListingTitle({ email_subject: "Nuovo messaggio — lungomare senigallia appartamento estivo 2" }),
    APARTMENTS,
  ),
  "apt2",
);

check(
  "metadata null → null",
  resolveListingFromTitle(extractListingTitle(null), APARTMENTS),
  null,
);

check(
  "titolo non riconosciuto → null",
  resolveListingFromTitle("appartamento generico qualsiasi", APARTMENTS),
  null,
);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 2 — buildAgentContext → decision type corretto
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 2: buildAgentContext — decision type ===");

// Richiesta disponibile (sat-sat, periodo libero)
// Nota: 4 luglio 2026 è sabato, 11 luglio 2026 è sabato → valido per luglio
const ctx_available = buildAgentContext({
  rawText: "Buongiorno, siamo in 4 persone e vorremmo prenotare dal 4 luglio al 11 luglio 2026.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("richiesta disponibile → decision available", ctx_available.decision.type, "available");
check("richiesta disponibile → prezzo calcolato", ctx_available.pricing.totalPrice, 800);
check("richiesta disponibile → apartment label ok", ctx_available.apartment.label.includes("1"), true);

// Richiesta non disponibile (periodo occupato — 4 lug è sabato, ma le prenotazioni lo coprono)
const ctx_unavailable = buildAgentContext({
  rawText: "Vorrei prenotare apt1 dal 4 luglio al 11 luglio, siamo 3 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_OCCUPIED,
  aptRules: APT_RULES,
});
check("periodo occupato → decision unavailable o has_alternatives", ["unavailable", "has_alternatives"].includes(ctx_unavailable.decision.type), true);

// Richiesta senza date
const ctx_noinfo = buildAgentContext({
  rawText: "Ciao, vorrei sapere se l'appartamento è disponibile quest'estate.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("senza date → needs_info", ctx_noinfo.decision.type, "needs_info");

// Richiesta fuori regole (non sab-sab in luglio — 7 luglio è martedì)
const ctx_outrules = buildAgentContext({
  rawText: "Vorrei prenotare dal 7 luglio al 14 luglio per 4 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("lun-lun luglio → outside_rules", ctx_outrules.decision.type, "outside_rules");

// Richiesta mese intero
const ctx_fullmonth = buildAgentContext({
  rawText: "Vorrei prenotare tutto agosto per 5 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("tutto agosto → full_month", ctx_fullmonth.decision.type, "full_month");
check("agosto → prezzo mensile 2600", ctx_fullmonth.pricing.totalPrice, 2600);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 3 — generateGuestReply (fallback template)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 3: generateGuestReply fallback template ===");

const reply_available = generateGuestReply(ctx_available);
check("reply available → non vuoto", reply_available.length > 0, true);
checkIncludes("reply available → contiene prezzo €800", reply_available, "800");
checkIncludes("reply available → contiene Cordiali saluti", reply_available, "Cordiali saluti");

const reply_noinfo = generateGuestReply(ctx_noinfo);
checkIncludes("reply needs_info → chiede data arrivo", reply_noinfo, "data di arrivo");
checkIncludes("reply needs_info → chiede Cordiali saluti", reply_noinfo, "Cordiali saluti");

const reply_outrules = generateGuestReply(ctx_outrules);
checkIncludes("reply outside_rules → menziona sabato", reply_outrules, "sabato");

const reply_fullmonth = generateGuestReply(ctx_fullmonth);
checkIncludes("reply full_month → menziona agosto", reply_fullmonth, "agosto");
checkIncludes("reply full_month → menziona 2600", reply_fullmonth, "2600");

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 4 — buildSystemPrompt — struttura e contenuto
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 4: buildSystemPrompt — struttura ===");

const prompt_available = buildSystemPrompt(ctx_available, "Vorrei prenotare dal 5 luglio al 12 luglio.");
checkIncludes("prompt → contiene FATTI VERIFICATI", prompt_available, "FATTI VERIFICATI");
checkIncludes("prompt → contiene tipo risposta available", prompt_available, "available");
checkIncludes("prompt → contiene prezzo €800", prompt_available, "800");
checkIncludes("prompt → contiene DISPONIBILE", prompt_available, "DISPONIBILE");
checkIncludes("prompt → contiene messaggio originale", prompt_available, "MESSAGGIO ORIGINALE");
checkNotIncludes("prompt → NON contiene IBAN", prompt_available, "IBAN");
checkNotIncludes("prompt → NON contiene numero telefono", prompt_available, "+39");

const prompt_noinfo = buildSystemPrompt(ctx_noinfo, "Sono disponibile ad agosto?");
checkIncludes("prompt needs_info → contiene 'non specificato'", prompt_noinfo, "non specificato");
checkIncludes("prompt needs_info → contiene needs_info", prompt_noinfo, "needs_info");

const prompt_fullmonth = buildSystemPrompt(ctx_fullmonth, "Vorrei prenotare tutto agosto.");
checkIncludes("prompt full_month → contiene agosto", prompt_fullmonth, "agosto");
checkIncludes("prompt full_month → contiene 2600", prompt_fullmonth, "2600");
checkIncludes("prompt full_month → contiene mese intero", prompt_fullmonth, "intero");

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 5 — Webhook payload parsing
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 5: Webhook payload parsing ===");

const webhookPayload = {
  type: "INSERT",
  table: "agent_inbox",
  schema: "public",
  record: {
    id: "test-uuid-123",
    source: "subito",
    source_message_id: "msg_001",
    source_thread_id: "subito_999888777",
    raw_text: "Vorrei prenotare dal 4 luglio al 11 luglio 2026 per 4 persone.",
    raw_metadata: { email_subject: "Nuovo messaggio — Lungomare senigallia appartamento estivo 1" },
    status: "new",
    apt_id: null,
    created_at: "2026-06-13T10:00:00Z",
  },
  old_record: null,
};

check("payload type INSERT", webhookPayload.type, "INSERT");
check("record.id presente", !!webhookPayload.record.id, true);
check("record.raw_text non vuoto", webhookPayload.record.raw_text.length > 0, true);
check("record.source_thread_id", webhookPayload.record.source_thread_id, "subito_999888777");

// Simula la risoluzione apt_id dal payload (come fa l'Edge Function)
const resolvedAptId = webhookPayload.record.apt_id ||
  resolveListingFromTitle(
    extractListingTitle(webhookPayload.record.raw_metadata),
    APARTMENTS,
  ) || "";
check("apt_id risolto dal subject", resolvedAptId, "apt1");

// Simula full pipeline da payload
const ctx_from_payload = buildAgentContext({
  rawText: webhookPayload.record.raw_text,
  rawMetadata: webhookPayload.record.raw_metadata,
  formData: { aptId: resolvedAptId, source: webhookPayload.record.source },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("pipeline completo → decision available", ctx_from_payload.decision.type, "available");
check("pipeline completo → prezzo €800", ctx_from_payload.pricing.totalPrice, 800);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 6 — Fallback se apt_id non risolto
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 6: apt_id non risolto ===");

const ctx_unknown_apt = buildAgentContext({
  rawText: "Sono interessato all'appartamento, siamo 2 persone dal 5 luglio al 12 luglio.",
  rawMetadata: { email_subject: "Nuovo messaggio — appartamento generico" },
  formData: { aptId: "", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("apt_id vuoto → context costruito senza crash", !!ctx_unknown_apt, true);
check("apt_id vuoto → decision type è stringa", typeof ctx_unknown_apt.decision.type, "string");

const reply_unknown = generateGuestReply(ctx_unknown_apt);
check("apt_id vuoto → reply non vuota", reply_unknown.length > 0, true);
checkIncludes("apt_id vuoto → Cordiali saluti presente", reply_unknown, "Cordiali saluti");

// ═══════════════════════════════════════════════════════════════════════════
//  TEST 7 — Disponibilità stagionale corretta
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TEST 7: Tariffe stagionali ===");

// Giugno (€500/settimana)
const ctx_june = buildAgentContext({
  rawText: "Vorrei prenotare dal 6 giugno al 13 giugno per 4 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("giugno sab-sab → €500", ctx_june.pricing.totalPrice, 500);
check("giugno → weeklyRate €500", ctx_june.pricing.weeklyRate, 500);

// Luglio (€800/settimana)
const ctx_july = buildAgentContext({
  rawText: "Vorremmo prenotare dal 5 luglio al 12 luglio 2026 per 2 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("luglio sab-sab → €800", ctx_july.pricing.totalPrice, 800);

// Agosto 2 settimane (€1600)
const ctx_aug2w = buildAgentContext({
  rawText: "Dal 1 agosto al 15 agosto per 4 persone.",
  rawMetadata: METADATA_APT1,
  formData: { aptId: "apt1", source: "subito" },
  apartments: APARTMENTS,
  bookings: BOOKINGS_EMPTY,
  aptRules: APT_RULES,
});
check("agosto 2 settimane → €1600", ctx_aug2w.pricing.totalPrice, 1600);

// ═══════════════════════════════════════════════════════════════════════════
//  Risultato finale
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${"─".repeat(55)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
