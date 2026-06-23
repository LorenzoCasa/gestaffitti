/**
 * normalizeAgentResponse.test.js — Tests for response normalizer
 *
 * Verifica che la UI non scardi mai reasoning_summary, data_used, reply
 * anche quando la risposta raw dell'LLM arriva in formati diversi.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAgentResponse } from "../src/utils/normalizeAgentResponse.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RICH_RESPONSE = {
  reply:                 "📊 Dal gestionale: hai €4700 confermati per agosto. 📈 Analisi: prezzi in linea con il mercato. 💡 Consiglio: pubblica subito l'annuncio per lo slot libero di luglio.",
  intent:                "revenue_advice",
  confidence:            0.92,
  needs_clarification:   false,
  clarification_question: null,
  needs_confirmation:    false,
  action_plan:           null,
  options:               [],
  resolved_references:   ["booking:b1", "apt:apt1"],
  missing_fields:        [],
  data_used: {
    bookings:   ["b1", "b3"],
    inbox:      [],
    decisions:  [],
    apartments: ["apt1"],
    market:     ["kb-lun-agosto"],
  },
  reasoning_summary: "Ho usato SITUAZIONE_ECONOMICA per i numeri e SLOT_LIBERI per le opportunità.",
};

// ── Test normalizeAgentResponse ───────────────────────────────────────────────

test("normalizeAgentResponse — preserva tutti i campi di una risposta ricca", () => {
  const norm = normalizeAgentResponse(RICH_RESPONSE);
  assert.ok(norm != null, "non deve restituire null");
  assert.equal(norm.reply,              RICH_RESPONSE.reply);
  assert.equal(norm.intent,             RICH_RESPONSE.intent);
  assert.equal(norm.confidence,         RICH_RESPONSE.confidence);
  assert.equal(norm.needs_clarification, false);
  assert.equal(norm.needs_confirmation,  false);
  assert.equal(norm.action_plan,         null);
  assert.deepEqual(norm.options,            []);
  assert.deepEqual(norm.resolved_references, ["booking:b1", "apt:apt1"]);
  assert.deepEqual(norm.missing_fields,      []);
  assert.ok(typeof norm.data_used === "object");
  assert.deepEqual(norm.data_used.bookings, ["b1", "b3"]);
  assert.equal(norm.reasoning_summary, RICH_RESPONSE.reasoning_summary);
  assert.equal(norm.fallback, false);
});

test("normalizeAgentResponse — reasoning_summary NON viene scartato", () => {
  const data = { ...RICH_RESPONSE, reasoning_summary: "Ho ragionato così." };
  const norm = normalizeAgentResponse(data);
  assert.equal(norm.reasoning_summary, "Ho ragionato così.", "reasoning_summary deve essere preservato");
});

test("normalizeAgentResponse — data_used NON viene scartato", () => {
  const norm = normalizeAgentResponse(RICH_RESPONSE);
  assert.deepEqual(norm.data_used.bookings, ["b1", "b3"]);
  assert.deepEqual(norm.data_used.market,   ["kb-lun-agosto"]);
});

test("normalizeAgentResponse — null input → null", () => {
  assert.equal(normalizeAgentResponse(null), null);
  assert.equal(normalizeAgentResponse(undefined), null);
  assert.equal(normalizeAgentResponse("string"), null);
});

test("normalizeAgentResponse — reply vuota → null", () => {
  assert.equal(normalizeAgentResponse({ reply: "" }),  null);
  assert.equal(normalizeAgentResponse({ reply: "  " }), null);
});

test("normalizeAgentResponse — risposta wrapped in .result", () => {
  const data = { result: RICH_RESPONSE };
  const norm = normalizeAgentResponse(data);
  assert.ok(norm != null);
  assert.equal(norm.reply, RICH_RESPONSE.reply);
  assert.equal(norm.reasoning_summary, RICH_RESPONSE.reasoning_summary);
});

test("normalizeAgentResponse — risposta wrapped in .data", () => {
  const data = { data: RICH_RESPONSE };
  const norm = normalizeAgentResponse(data);
  assert.ok(norm != null);
  assert.equal(norm.reply, RICH_RESPONSE.reply);
});

test("normalizeAgentResponse — fallback via .message", () => {
  const data = { message: "Capito.", intent: "no_action" };
  const norm = normalizeAgentResponse(data);
  assert.ok(norm != null);
  assert.equal(norm.reply, "Capito.");
  assert.equal(norm.intent, "no_action");
});

test("normalizeAgentResponse — action_plan preservato con tutti i campi", () => {
  const data = {
    ...RICH_RESPONSE,
    needs_confirmation: true,
    action_plan: {
      type: "mark_deposit_paid",
      payload: { bookingId: "b1", guest: "Mario Rossi" },
    },
  };
  const norm = normalizeAgentResponse(data);
  assert.ok(norm.action_plan != null);
  assert.equal(norm.action_plan.type, "mark_deposit_paid");
  assert.equal(norm.action_plan.payload.bookingId, "b1");
  assert.equal(norm.needs_confirmation, true);
});

test("normalizeAgentResponse — options preservati", () => {
  const data = {
    ...RICH_RESPONSE,
    needs_clarification: true,
    options: [
      { label: "Mario Rossi · apt1 · 2026-08-01" },
      { label: "Anna Verdi · apt2 · 2026-08-08" },
    ],
  };
  const norm = normalizeAgentResponse(data);
  assert.equal(norm.options.length, 2);
  assert.equal(norm.options[0].label, "Mario Rossi · apt1 · 2026-08-01");
});

test("normalizeAgentResponse — missing_fields preservati", () => {
  const data = {
    ...RICH_RESPONSE,
    missing_fields: ["bookingId", "checkin"],
    needs_clarification: true,
  };
  const norm = normalizeAgentResponse(data);
  assert.deepEqual(norm.missing_fields, ["bookingId", "checkin"]);
});

test("normalizeAgentResponse — confidence default 0.5 se mancante", () => {
  const data = { reply: "Ciao.", intent: "no_action" };
  const norm = normalizeAgentResponse(data);
  assert.equal(norm.confidence, 0.5);
});

test("normalizeAgentResponse — intent default no_action se mancante", () => {
  const data = { reply: "Ciao." };
  const norm = normalizeAgentResponse(data);
  assert.equal(norm.intent, "no_action");
});

test("normalizeAgentResponse — fallback: true quando presente", () => {
  const data = { reply: "Non disponibile.", _fallback: true };
  const norm = normalizeAgentResponse(data);
  assert.equal(norm.fallback, true);
});

// ── Test sicurezza: normalizer non esegue azioni ──────────────────────────────

test("normalizeAgentResponse — sicurezza: non esegue azioni dal action_plan", () => {
  let executionCount = 0;
  const data = {
    reply: "Prenotazione creata.",
    intent: "create_booking",
    needs_confirmation: false,
    action_plan: {
      type: "create_booking",
      execute: () => { executionCount++; }, // NON deve essere chiamata
      payload: { aptId: "apt1", guest: "Mario", checkin: "2026-08-01", checkout: "2026-08-08" },
    },
  };
  normalizeAgentResponse(data);
  assert.equal(executionCount, 0, "normalizer non deve eseguire action_plan");
});
