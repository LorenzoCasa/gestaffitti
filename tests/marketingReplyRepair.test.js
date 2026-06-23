/**
 * marketingReplyRepair.test.js
 *
 * Testa il layer di rilevamento intent marketing e repair della reply incompleta.
 * Scenari reali: "preparami un inserzione su Subito" / "mi devi scrivere il messaggio".
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectMarketingIntent,
  isReplyBodyMissing,
  buildFallbackPromoText,
  repairMarketingReply,
} from "../src/utils/marketingReplyRepair.js";

// ── Fixture slot ──────────────────────────────────────────────────────────────

const SLOT_APT_B_AGOSTO = {
  aptId:          "apt2",
  aptLabel:       "Appartamento B",
  start:          "2026-07-31",
  end:            "2026-08-09",
  nights:         9,
  weeks:          1,
  month:          7,
  season:         "peak",
  estimatedValue: 900,
  urgencyLevel:   "high",
  daysUntilStart: 37,
};

const APT_B = { id: "apt2", label: "Appartamento B" };

// ── detectMarketingIntent ─────────────────────────────────────────────────────

test("detectMarketingIntent — rileva 'inserzione da mettere su subito'", () => {
  assert.equal(
    detectMarketingIntent("preparami un inserzione da mettere su subito per promuovere la settimana di agosto rimasta libera"),
    true,
  );
});

test("detectMarketingIntent — rileva 'mi devi scrivere il messaggio'", () => {
  // Questo è il follow-up del bug reale: "mi devi scrivere il messaggio da mettere su subito"
  assert.equal(
    detectMarketingIntent("mi devi scrivere il messaggio da mettere su subito"),
    true,
  );
});

test("detectMarketingIntent — rileva varianti comuni", () => {
  const variants = [
    "creami un annuncio",
    "scrivimi un annuncio per subito",
    "promuovi lo slot di agosto",
    "metti su subito l'appartamento libero",
    "testo per subito",
  ];
  for (const msg of variants) {
    assert.equal(detectMarketingIntent(msg), true, `deve rilevare: "${msg}"`);
  }
});

test("detectMarketingIntent — non rileva domande operative", () => {
  const nonMarketing = [
    "chi arriva domani?",
    "ha pagato la caparra?",
    "segna il check-in di Mario",
    "quanto ho guadagnato ad agosto?",
    "che disponibilità ho?",
  ];
  for (const msg of nonMarketing) {
    assert.equal(detectMarketingIntent(msg), false, `NON deve rilevare: "${msg}"`);
  }
});

// ── isReplyBodyMissing ────────────────────────────────────────────────────────

test("isReplyBodyMissing — detecta reply 'Eccolo' senza corpo", () => {
  assert.equal(isReplyBodyMissing("Eccolo, copia e incolla direttamente su Subito."), true);
});

test("isReplyBodyMissing — detecta reply corte senza corpo annuncio", () => {
  assert.equal(isReplyBodyMissing("Annuncio pronto per Apt B."), true);
  assert.equal(isReplyBodyMissing("Ecco il testo!"), true);
  assert.equal(isReplyBodyMissing(""), true);
  assert.equal(isReplyBodyMissing(null), true);
});

test("isReplyBodyMissing — NON detecta reply completa con titolo e testo", () => {
  const completeReply = `🏖 Appartamento B — 31 luglio–9 agosto disponibile\n\n📅 Periodo: 31 luglio–9 agosto (9 notti)\n💶 Prezzo consigliato: €900 (da confermare)\n📍 Lungomare Senigallia, Spiaggia di Velluto\n\nAppartamento disponibile per il periodo estivo. Ideale per famiglie.\n\n📩 Contattami per info.`;
  assert.equal(isReplyBodyMissing(completeReply), false);
});

// ── buildFallbackPromoText ────────────────────────────────────────────────────

test("buildFallbackPromoText — genera titolo e testo completo per Apt B 31 lug–9 ago", () => {
  const result = buildFallbackPromoText(SLOT_APT_B_AGOSTO, APT_B);

  assert.ok(result != null, "non deve restituire null con slot valido");
  assert.ok(typeof result.title === "string",    "title deve essere stringa");
  assert.ok(typeof result.body === "string",     "body deve essere stringa");
  assert.ok(typeof result.fullText === "string", "fullText deve essere stringa");

  // Titolo deve contenere appartamento e date
  assert.ok(result.title.includes("Appartamento B"), `title deve contenere 'Appartamento B', trovato: "${result.title}"`);
  assert.ok(result.title.includes("31"), "title deve contenere giorno inizio 31");
  assert.ok(result.title.includes("9"),  "title deve contenere giorno fine 9");

  // Body deve contenere tutti gli elementi richiesti
  assert.ok(result.body.includes("📅"),     "body deve contenere il periodo");
  assert.ok(result.body.includes("💶"),     "body deve contenere il prezzo");
  assert.ok(result.body.includes("📍"),     "body deve contenere la location");
  assert.ok(result.body.includes("€900"),   "body deve contenere il prezzo stimato");
  assert.ok(result.body.includes("📩"),     "body deve contenere call to action");
  assert.ok(result.body.includes("Senigallia"), "body deve contenere Senigallia");

  // fullText deve unire titolo e body
  assert.ok(result.fullText.includes(result.title), "fullText deve contenere il title");
  assert.ok(result.fullText.includes("📩"),          "fullText deve contenere call to action");
});

test("buildFallbackPromoText — null slot → null", () => {
  assert.equal(buildFallbackPromoText(null, APT_B), null);
});

test("buildFallbackPromoText — slot senza estimatedValue → 'prezzo da confermare'", () => {
  const slotNoPrice = { ...SLOT_APT_B_AGOSTO, estimatedValue: null };
  const result = buildFallbackPromoText(slotNoPrice, APT_B);
  assert.ok(result != null);
  assert.ok(result.body.includes("prezzo da confermare"), `atteso 'prezzo da confermare', trovato: "${result.body}"`);
});

test("buildFallbackPromoText — slot multi-mese usa dateRange corretto", () => {
  const slotMultiMese = {
    ...SLOT_APT_B_AGOSTO,
    start: "2026-08-25",
    end:   "2026-09-05",
    nights: 11,
    weeks:  1,
    month:  8,
    estimatedValue: null,
  };
  const result = buildFallbackPromoText(slotMultiMese, APT_B);
  assert.ok(result != null);
  // Slot attraversa agosto–settembre: dateRange deve includere entrambi i mesi
  assert.ok(result.dateRange.includes("agosto") || result.dateRange.includes("25"), `dateRange: "${result.dateRange}"`);
});

// ── repairMarketingReply ──────────────────────────────────────────────────────

test("repairMarketingReply — scenario 1: prima richiesta inserzione → risposta contiene testo completo", () => {
  const hollowResponse = {
    reply:  "Annuncio pronto per Apt B 31 lug–9 ago. Prezzo consigliato €900 (stima da confermare).",
    intent: "revenue_advice",
  };
  const message = "preparami un inserzione da mettere su subito per promuovere la settimana di agosto rimasta libera";

  const repaired = repairMarketingReply(hollowResponse, message, SLOT_APT_B_AGOSTO, APT_B);

  assert.ok(repaired._marketing_repair === true,        "deve segnare il repair");
  assert.ok(repaired.reply.includes("TITOLO:"),         "reply riparata deve contenere TITOLO:");
  assert.ok(repaired.reply.includes("TESTO:"),          "reply riparata deve contenere TESTO:");
  assert.ok(repaired.reply.includes("Appartamento B"),  "reply deve contenere nome appartamento");
  assert.ok(repaired.reply.includes("📩"),              "reply deve contenere call to action");
  assert.ok(repaired.reply.length > 200,                `reply riparata deve essere lunga, trovato ${repaired.reply.length} chars`);
});

test("repairMarketingReply — scenario 2: follow-up 'mi devi scrivere il messaggio' → non solo 'Eccolo'", () => {
  const hollowFollowUp = {
    reply:  "Eccolo, copia e incolla direttamente su Subito.",
    intent: "revenue_advice",
  };
  const message = "mi devi scrivere il messaggio da mettere su subito";

  const repaired = repairMarketingReply(hollowFollowUp, message, SLOT_APT_B_AGOSTO, APT_B);

  assert.ok(repaired._marketing_repair === true);
  // La reply originale "Eccolo..." deve essere preservata come intro
  assert.ok(repaired.reply.includes("Eccolo"), "intro originale deve essere preservata");
  // E poi il testo completo
  assert.ok(repaired.reply.includes("TITOLO:"),  "reply riparata deve contenere TITOLO:");
  assert.ok(repaired.reply.includes("€900"),     "reply riparata deve contenere il prezzo");
  assert.ok(repaired.reply.length > 200,         `reply riparata deve essere lunga, trovato ${repaired.reply.length} chars`);
});

test("repairMarketingReply — scenario 3: risposta LLM incompleta senza slot → nessun repair", () => {
  const hollowResponse = { reply: "Eccolo.", intent: "revenue_advice" };
  const message = "preparami un annuncio per subito";

  // Nessuno slot disponibile → il repair non può costruire la bozza
  const result = repairMarketingReply(hollowResponse, message, null, null);
  assert.equal(result._marketing_repair, undefined, "senza slot non deve segnare repair");
  assert.equal(result.reply, "Eccolo.", "reply non deve cambiare senza slot");
});

test("repairMarketingReply — scenario 4: sicurezza — nessuna pubblicazione automatica", () => {
  const response = { reply: "Eccolo, copia su Subito.", intent: "revenue_advice", action_plan: null };
  const message  = "preparami un annuncio subito";

  const repaired = repairMarketingReply(response, message, SLOT_APT_B_AGOSTO, APT_B);

  // Il repair NON deve aggiungere action_plan di pubblicazione
  assert.equal(repaired.action_plan, null, "action_plan deve restare null — nessuna pubblicazione automatica");
  // NON deve contenere endpoint di publish o chiamate esterne
  assert.ok(!repaired.reply.includes("publish("),     "non deve contenere chiamate publish");
  assert.ok(!repaired.reply.includes("POST /"),       "non deve contenere richieste HTTP");
  assert.ok(!repaired.reply.includes("api.subito"),   "non deve contenere API Subito");
});

test("repairMarketingReply — non tocca reply già completa", () => {
  const completeReply = `🏖 Appartamento B — 31 luglio–9 agosto disponibile\n\n📅 Periodo: 31 luglio–9 agosto (9 notti)\n💶 Prezzo consigliato: €900 (da confermare)\n📍 Lungomare Senigallia, Spiaggia di Velluto\n\nAppartamento disponibile per il periodo estivo.\n\n📩 Contattami per info e disponibilità.`;
  const response = { reply: completeReply, intent: "revenue_advice" };
  const message  = "preparami un annuncio per subito";

  const result = repairMarketingReply(response, message, SLOT_APT_B_AGOSTO, APT_B);
  assert.equal(result._marketing_repair, undefined, "non deve toccare reply già completa");
  assert.equal(result.reply, completeReply, "reply non deve cambiare se già completa");
});
