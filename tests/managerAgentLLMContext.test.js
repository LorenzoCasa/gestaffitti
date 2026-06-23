/**
 * managerAgentLLMContext.test.js — Tests for the LLM context builder
 *
 * Verifica che il context passato al brain contenga:
 * - pricingRules (regole prezzi ufficiali)
 * - financials (situazione economica)
 * - derived (slot liberi, revenue, occupancy, segnali stagione)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildManagerAgentLLMContext, validateLLMActionPlan } from "../src/utils/managerAgentLLMContext.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY = "2026-06-23";

const APARTMENTS = [
  { id: "apt1", label: "Appartamento A" },
  { id: "apt2", label: "Appartamento B" },
];

const BOOKINGS = [
  { id: "b1", apt: "apt1", checkin: "2026-07-04", checkout: "2026-07-11", status: "confirmed", price: 800, deposit: 200, deposit_paid: true,  checkin_done: false },
  { id: "b2", apt: "apt2", checkin: "2026-08-01", checkout: "2026-08-29", status: "confirmed", price: 2600, deposit: 500, deposit_paid: false, checkin_done: false },
];

// ── buildManagerAgentLLMContext ───────────────────────────────────────────────

test("buildManagerAgentLLMContext — context contiene pricingRules", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert.ok(ctx.pricingRules != null, "pricingRules deve essere nel context");
  assert.equal(ctx.pricingRules.source, "gestaffitti_internal");
  assert.ok(typeof ctx.pricingRules.seasonal_rates === "object");
  // Check official rates
  assert.equal(ctx.pricingRules.seasonal_rates[8].weekly, 800, "agosto deve essere €800/sett.");
  assert.equal(ctx.pricingRules.seasonal_rates[6].weekly, 500, "giugno deve essere €500/sett.");
});

test("buildManagerAgentLLMContext — context contiene financials", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert.ok(ctx.financials != null, "financials deve essere nel context");
  assert.ok(typeof ctx.financials.seasonRevenue === "number");
  assert.ok(typeof ctx.financials.depositsPaid === "number");
  assert.ok(typeof ctx.financials.depositsPending === "number");
  assert.ok(typeof ctx.financials.balancesPending === "number");
  assert.ok(typeof ctx.financials.hasData === "boolean");
  assert.ok(typeof ctx.financials._note === "string");
  // With 2 bookings: b1 (200 deposit paid) + b2 (500 not paid)
  assert.equal(ctx.financials.depositsPaid,    200);
  assert.equal(ctx.financials.depositsPending, 500);
});

test("buildManagerAgentLLMContext — context contiene derived", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert.ok(ctx.derived != null, "derived deve essere nel context");
  assert.ok(Array.isArray(ctx.derived.freeSlots), "derived.freeSlots deve essere array");
  assert.ok(typeof ctx.derived.revenueSummary === "object");
  assert.ok(typeof ctx.derived.openRevenueOpportunities === "object");
  assert.ok(typeof ctx.derived.occupancyByApt === "object");
  assert.ok(typeof ctx.derived.seasonSignals === "object");
  assert.ok(Array.isArray(ctx.derived.priorityAlerts));
});

test("buildManagerAgentLLMContext — derived.freeSlots calcolati dal calendario", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  // apt1 has booking July 4-11, so there should be free slots before/after
  // apt2 has booking Aug 1-29, so there should be free slots June-Jul and Sept
  assert.ok(ctx.derived.freeSlots.length > 0, "ci devono essere slot liberi");
  for (const slot of ctx.derived.freeSlots) {
    assert.ok(slot.aptId === "apt1" || slot.aptId === "apt2");
    assert.ok(slot.nights >= 7);
    assert.ok(slot.start < slot.end);
  }
});

test("buildManagerAgentLLMContext — derived.seasonSignals ha campi corretti", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: [], apartments: APARTMENTS, today: TODAY });
  const ss = ctx.derived.seasonSignals;
  assert.ok(typeof ss.currentMonth === "number");
  assert.ok(typeof ss.isInSeason === "boolean");
  assert.ok(typeof ss.isPeak === "boolean");
  assert.ok(typeof ss.daysToSeasonStart === "number");
  // June 23 is in season
  assert.equal(ss.isInSeason, true);
  // June is shoulder, not peak
  assert.equal(ss.isPeak, false);
  assert.equal(ss.currentSeason, "shoulder");
});

test("buildManagerAgentLLMContext — context ha ancora tutti i campi originali", () => {
  const ctx = buildManagerAgentLLMContext({ bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  // Original fields must still be present
  assert.ok(Array.isArray(ctx.apartments), "apartments");
  assert.ok(Array.isArray(ctx.bookings), "bookings");
  assert.ok(Array.isArray(ctx.inbox), "inbox");
  assert.ok(typeof ctx.today === "string", "today");
  // market context must still be present
  assert.ok(ctx.market_context != null, "market_context");
  assert.ok(ctx.market_pricing_context != null, "market_pricing_context");
});

test("buildManagerAgentLLMContext — pura: input non modificati", () => {
  const bookingsCopy = JSON.parse(JSON.stringify(BOOKINGS));
  const aptsCopy     = JSON.parse(JSON.stringify(APARTMENTS));
  buildManagerAgentLLMContext({ bookings: bookingsCopy, apartments: aptsCopy, today: TODAY });
  assert.equal(bookingsCopy.length, BOOKINGS.length, "bookings non devono essere modificati");
  assert.equal(aptsCopy.length,     APARTMENTS.length, "apartments non devono essere modificati");
});

// ── validateLLMActionPlan — sicurezza ────────────────────────────────────────

test("validateLLMActionPlan — blocca azioni su prenotazioni inesistenti", () => {
  const result = validateLLMActionPlan(
    { type: "mark_deposit_paid", payload: { bookingId: "NON_ESISTE" } },
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  assert.equal(result.valid, false);
  assert.ok(result.error.includes("non trovata") || result.error.includes("NON_ESISTE"));
});

test("validateLLMActionPlan — blocca caparra già pagata", () => {
  // b1 has deposit_paid: true
  const result = validateLLMActionPlan(
    { type: "mark_deposit_paid", payload: { bookingId: "b1" } },
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  assert.equal(result.valid, false);
  assert.ok(typeof result.error === "string");
});

test("validateLLMActionPlan — approva caparra non ancora pagata", () => {
  // b2 has deposit_paid: false
  const result = validateLLMActionPlan(
    { type: "mark_deposit_paid", payload: { bookingId: "b2" } },
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  assert.equal(result.valid, true);
  assert.ok(result.plan != null);
  assert.equal(result.plan.type, "mark_deposit_paid");
  assert.equal(result.plan.canExecute, true);
});

test("validateLLMActionPlan — blocca tipo azione non supportato", () => {
  const result = validateLLMActionPlan(
    { type: "send_whatsapp_message", payload: { to: "+39333", text: "Ciao" } },
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  assert.equal(result.valid, false);
  assert.ok(result.error.includes("non supportato"));
});

test("validateLLMActionPlan — blocca create_booking su appartamento non esistente", () => {
  const result = validateLLMActionPlan(
    { type: "create_booking", payload: { aptId: "apt99", guest: "Mario", checkin: "2026-09-05", checkout: "2026-09-12", price: 500 } },
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  assert.equal(result.valid, false);
});

test("validateLLMActionPlan — null action_plan → invalid", () => {
  const result = validateLLMActionPlan(null, { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY });
  assert.equal(result.valid, false);
});

// ── Test scenario: "ha pagato la caparra" senza cliente specificato ───────────

test("validateLLMActionPlan — mark_deposit_paid senza bookingId → invalid (chiede chiarimento)", () => {
  const result = validateLLMActionPlan(
    { type: "mark_deposit_paid", payload: { guest: "qualcuno" } }, // nessun bookingId
    { bookings: BOOKINGS, apartments: APARTMENTS, today: TODAY },
  );
  // Senza bookingId, il brain deve non trovare la prenotazione
  assert.equal(result.valid, false);
  assert.ok(typeof result.error === "string");
});
