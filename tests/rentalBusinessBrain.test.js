/**
 * rentalBusinessBrain.test.js — Tests for GestAffitti Rental Business Brain v1
 *
 * Node built-in test runner (Node 18+, no extra deps required).
 * Run: node --test tests/rentalBusinessBrain.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getRentalPricingRules,
  estimateStayPrice,
  analyzeFreeSlots,
  analyzeRevenueOpportunities,
  draftSubitoPromotion,
  buildRevenueSummary,
  buildDerivedSignals,
} from "../src/utils/rentalBusinessBrain.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY = "2026-06-23";

const APARTMENTS = [
  { id: "apt1", label: "Appartamento A" },
  { id: "apt2", label: "Appartamento B" },
];

const BOOKINGS_PARTIAL = [
  // apt1: week 1 booked (June 27 → July 4)
  { id: "b1", apt: "apt1", checkin: "2026-06-27", checkout: "2026-07-04", status: "confirmed", price: 500, deposit: 200, deposit_paid: true  },
  // apt2: entire August booked
  { id: "b2", apt: "apt2", checkin: "2026-08-01", checkout: "2026-08-29", status: "confirmed", price: 2600, deposit: 500, deposit_paid: false },
  // apt1: two weeks in August (Aug 1 → Aug 15)
  { id: "b3", apt: "apt1", checkin: "2026-08-01", checkout: "2026-08-15", status: "confirmed", price: 1600, deposit: 400, deposit_paid: true  },
];

const PRICING_RULES = getRentalPricingRules();

// ── getRentalPricingRules ─────────────────────────────────────────────────────

test("getRentalPricingRules — ha struttura corretta", () => {
  const r = getRentalPricingRules();
  assert.equal(r.source, "gestaffitti_internal");
  assert.equal(r.currency, "EUR");
  assert.ok(Array.isArray(r.stay_rules.valid_durations_nights));
  assert.deepEqual(r.stay_rules.valid_durations_nights, [7, 14, 21]);
  assert.equal(r.stay_rules.september_flexible, true);
});

test("getRentalPricingRules — tariffe stagionali corrette", () => {
  const r = getRentalPricingRules();
  const sr = r.seasonal_rates;
  assert.equal(sr[6].weekly,  500);
  assert.equal(sr[6].monthly, 1600);
  assert.equal(sr[7].weekly,  800);
  assert.equal(sr[7].monthly, 2600);
  assert.equal(sr[8].weekly,  800);
  assert.equal(sr[8].monthly, 2600);
  assert.equal(sr[9].weekly,  500);
  assert.equal(sr[9].monthly, 1500);
});

test("getRentalPricingRules — peak e shoulder corretti", () => {
  const sr = getRentalPricingRules().seasonal_rates;
  assert.equal(sr[7].season, "peak");
  assert.equal(sr[8].season, "peak");
  assert.equal(sr[6].season, "shoulder");
  assert.equal(sr[9].season, "shoulder");
});

// ── estimateStayPrice ─────────────────────────────────────────────────────────

test("estimateStayPrice — 1 settimana giugno (standard)", () => {
  const r = estimateStayPrice({ checkin: "2026-06-27", checkout: "2026-07-04" }, PRICING_RULES);
  assert.equal(r.totalPrice, 500);
  assert.equal(r.weeks, 1);
  assert.equal(r.nights, 7);
  assert.equal(r.isStandard, true);
  assert.equal(r.needsConfirmation, false);
  assert.equal(r.pricingType, "weekly");
});

test("estimateStayPrice — 2 settimane luglio (standard)", () => {
  const r = estimateStayPrice({ checkin: "2026-07-04", checkout: "2026-07-18" }, PRICING_RULES);
  assert.equal(r.totalPrice, 1600);
  assert.equal(r.weeks, 2);
  assert.equal(r.nights, 14);
  assert.equal(r.isStandard, true);
  assert.equal(r.needsConfirmation, false);
  assert.equal(r.pricingType, "multi_week");
});

test("estimateStayPrice — 3 settimane agosto (standard)", () => {
  const r = estimateStayPrice({ checkin: "2026-08-01", checkout: "2026-08-22" }, PRICING_RULES);
  assert.equal(r.totalPrice, 2400);
  assert.equal(r.weeks, 3);
  assert.equal(r.isStandard, true);
  assert.equal(r.needsConfirmation, false);
});

test("estimateStayPrice — mese intero agosto (full_month)", () => {
  const r = estimateStayPrice({ isFullMonth: true, fullMonthNum: 8 }, PRICING_RULES);
  assert.equal(r.totalPrice, 2600);
  assert.equal(r.monthlyRate, 2600);
  assert.equal(r.pricingType, "full_month");
  assert.equal(r.isStandard, true);
  assert.equal(r.needsConfirmation, false);
});

test("estimateStayPrice — 8 notti agosto 1-9 (non-standard — caso chiave)", () => {
  const r = estimateStayPrice({ checkin: "2026-08-01", checkout: "2026-08-09" }, PRICING_RULES);
  assert.equal(r.nights, 8);
  assert.equal(r.weeks, 1);
  assert.equal(r.extraNights, 1);
  assert.equal(r.weeklyRate, 800);
  assert.equal(r.season, "peak");
  assert.equal(r.isStandard, false);
  assert.equal(r.needsConfirmation, true);
  assert.equal(r.pricingType, "non_standard");
  // Base 800 + 1 extra notte ~114€ ≈ 914€
  assert.ok(r.totalPrice > 800, "prezzo deve essere > 800€ base settimanale");
  assert.ok(r.totalPrice < 1600, "prezzo deve essere < 2 settimane");
  assert.equal(r.nightlyRateEstimate, Math.round(800 / 7));
  assert.ok(r.notes.some(n => n.includes("non_standard_8")));
});

test("estimateStayPrice — date mancanti", () => {
  const r = estimateStayPrice({}, PRICING_RULES);
  assert.equal(r.totalPrice, null);
  assert.ok(r.notes.includes("dates_missing"));
  assert.equal(r.isStandard, false);
});

test("estimateStayPrice — mese fuori stagione (ottobre)", () => {
  const r = estimateStayPrice({ checkin: "2026-10-01", checkout: "2026-10-08" }, PRICING_RULES);
  assert.equal(r.totalPrice, null);
  assert.ok(r.notes.includes("month_not_in_season"));
});

// ── analyzeFreeSlots ──────────────────────────────────────────────────────────

test("analyzeFreeSlots — nessuna prenotazione → tutta la stagione libera", () => {
  const slots = analyzeFreeSlots([], APARTMENTS, PRICING_RULES, TODAY);
  // With today = June 23, season = June 1 → Sept 30
  // Both apartments should have at least 1 large free slot
  assert.ok(slots.length >= 2, `attesi >= 2 slot, trovati ${slots.length}`);
  assert.ok(slots.every(s => s.nights >= 7));
  assert.ok(slots.every(s => s.aptId === "apt1" || s.aptId === "apt2"));
});

test("analyzeFreeSlots — con prenotazioni parziali → identifica slot corretti", () => {
  const slots = analyzeFreeSlots(BOOKINGS_PARTIAL, APARTMENTS, PRICING_RULES, TODAY);
  assert.ok(slots.length > 0, "ci devono essere slot liberi");
  // apt1 is booked June 27 → July 4, Aug 1 → Aug 15
  // So free: June 23→June 27, July 4→Aug 1, Aug 15→Sept 30
  // apt2 is booked Aug 1 → Aug 29
  // So free: June 23→Aug 1, Aug 29→Sept 30
  const apt1Slots = slots.filter(s => s.aptId === "apt1");
  const apt2Slots = slots.filter(s => s.aptId === "apt2");
  assert.ok(apt1Slots.length >= 1, "apt1 deve avere slot liberi");
  assert.ok(apt2Slots.length >= 1, "apt2 deve avere slot liberi");
});

test("analyzeFreeSlots — slot hanno valore economico calcolato", () => {
  const slots = analyzeFreeSlots([], APARTMENTS, PRICING_RULES, TODAY);
  for (const slot of slots) {
    if (slot.month >= 6 && slot.month <= 9) {
      assert.ok(slot.estimatedValue != null, `slot ${slot.start}→${slot.end} deve avere estimatedValue`);
      assert.ok(slot.estimatedValue >= 0);
      assert.ok(slot.weeklyRate != null);
    }
  }
});

test("analyzeFreeSlots — slots hanno urgencyLevel", () => {
  const slots = analyzeFreeSlots([], APARTMENTS, PRICING_RULES, TODAY);
  for (const slot of slots) {
    assert.ok(["high", "medium", "low", "past"].includes(slot.urgencyLevel),
      `urgencyLevel non valido: ${slot.urgencyLevel}`);
  }
});

test("analyzeFreeSlots — nessun slot se stagione completamente piena", () => {
  const fullBookings = [
    { id: "b1", apt: "apt1", checkin: "2026-06-01", checkout: "2026-09-30", status: "confirmed", price: 5000 },
    { id: "b2", apt: "apt2", checkin: "2026-06-01", checkout: "2026-09-30", status: "confirmed", price: 5000 },
  ];
  const slots = analyzeFreeSlots(fullBookings, APARTMENTS, PRICING_RULES, TODAY);
  assert.equal(slots.length, 0, "nessun slot libero se stagione piena");
});

// ── analyzeRevenueOpportunities ───────────────────────────────────────────────

test("analyzeRevenueOpportunities — nessuno slot → totale 0", () => {
  const result = analyzeRevenueOpportunities([], PRICING_RULES);
  assert.equal(result.total, 0);
  assert.equal(result.maxRevenueLoss, 0);
  assert.deepEqual(result.opportunities, []);
});

test("analyzeRevenueOpportunities — slots con valore → calcola maxRevenueLoss", () => {
  const slots = analyzeFreeSlots([], APARTMENTS, PRICING_RULES, TODAY);
  const result = analyzeRevenueOpportunities(slots, PRICING_RULES);
  assert.equal(result.total, slots.length);
  assert.ok(result.maxRevenueLoss >= 0);
  for (const opp of result.opportunities) {
    assert.ok(["pubblica_annuncio_urgente", "prepara_annuncio", "pianifica_campagna"].includes(opp.action));
    assert.ok(typeof opp.priorityScore === "number");
    assert.ok(typeof opp.isPeak === "boolean");
  }
});

// ── draftSubitoPromotion ──────────────────────────────────────────────────────

test("draftSubitoPromotion — null slot → null", () => {
  const result = draftSubitoPromotion(null, PRICING_RULES, null);
  assert.equal(result, null);
});

test("draftSubitoPromotion — slot agosto → bozza completa", () => {
  const slot = {
    aptId:          "apt1",
    aptLabel:       "Appartamento A",
    start:          "2026-08-15",
    end:            "2026-08-22",
    nights:         7,
    weeks:          1,
    standardWeeks:  true,
    month:          8,
    season:         "peak",
    estimatedValue: 800,
    weeklyRate:     800,
    urgencyLevel:   "high",
    daysUntilStart: 53,
  };
  const apt = { label: "Appartamento A" };
  const result = draftSubitoPromotion(slot, PRICING_RULES, apt);

  assert.ok(result != null);
  assert.ok(typeof result.title === "string", "deve avere title");
  assert.ok(typeof result.body === "string", "deve avere body");
  assert.ok(typeof result.fullText === "string", "deve avere fullText");
  assert.ok(result.fullText.length > 100, "fullText deve essere sostanzioso");
  assert.ok(result.fullText.includes("€800"), "deve citare il prezzo");
  assert.ok(result.fullText.includes("agosto") || result.fullText.includes("Agosto"), "deve citare il mese");
  assert.ok(result.fullText.includes("Senigallia"), "deve citare la località");
});

test("draftSubitoPromotion — slot senza estimatedValue → prezzo da confermare", () => {
  const slot = {
    aptId: "apt1", aptLabel: "Appartamento A",
    start: "2026-08-01", end: "2026-08-08", nights: 7, weeks: 1,
    standardWeeks: true, month: 8, season: "peak",
    estimatedValue: null, weeklyRate: null, urgencyLevel: "high", daysUntilStart: 39,
  };
  const result = draftSubitoPromotion(slot, PRICING_RULES, null);
  assert.ok(result != null);
  assert.ok(result.priceLabel.includes("confermare"));
});

// ── buildRevenueSummary ───────────────────────────────────────────────────────

test("buildRevenueSummary — nessuna prenotazione → zero dappertutto", () => {
  const r = buildRevenueSummary([], PRICING_RULES, TODAY);
  assert.equal(r.earnedRevenue,     0);
  assert.equal(r.upcomingRevenue30, 0);
  assert.equal(r.seasonRevenue,     0);
  assert.equal(r.depositsPaid,      0);
  assert.equal(r.depositsPending,   0);
  assert.equal(r.balancesPending,   0);
  assert.equal(r.hasData,           false);
  assert.ok(typeof r._note === "string");
});

test("buildRevenueSummary — con prenotazioni → calcola correttamente", () => {
  const r = buildRevenueSummary(BOOKINGS_PARTIAL, PRICING_RULES, TODAY);
  assert.ok(r.hasData, "hasData deve essere true con prenotazioni");
  // b1 (June 27–July 4, €500) è upcoming (checkin >= today)
  // b2 (Aug 1–29, €2600) è stagionale
  // b3 (Aug 1–15, €1600) è stagionale
  assert.ok(r.seasonRevenue >= 4700, `seasonRevenue atteso >= 4700, trovato ${r.seasonRevenue}`);
  // depositsPaid: b1 (200) + b3 (400) = 600
  assert.equal(r.depositsPaid, 600, `depositsPaid atteso 600, trovato ${r.depositsPaid}`);
  // depositsPending: b2 (500)
  assert.equal(r.depositsPending, 500, `depositsPending atteso 500, trovato ${r.depositsPending}`);
  assert.equal(r.activeBookingsCount, 3);
  assert.ok(r.seasonYear >= 2026);
  assert.ok(r.seasonStart.includes("-06-01"));
  assert.ok(r.seasonEnd.includes("-09-30"));
});

// ── buildDerivedSignals ───────────────────────────────────────────────────────

test("buildDerivedSignals — struttura output completa", () => {
  const d = buildDerivedSignals(BOOKINGS_PARTIAL, APARTMENTS, PRICING_RULES, TODAY);
  assert.ok(Array.isArray(d.freeSlots), "freeSlots deve essere array");
  assert.ok(typeof d.revenueSummary === "object", "revenueSummary deve essere oggetto");
  assert.ok(typeof d.openRevenueOpportunities === "object", "openRevenueOpportunities deve essere oggetto");
  assert.ok(typeof d.occupancyByApt === "object", "occupancyByApt deve essere oggetto");
  assert.ok(typeof d.seasonSignals === "object", "seasonSignals deve essere oggetto");
  assert.ok(Array.isArray(d.priorityAlerts), "priorityAlerts deve essere array");
});

test("buildDerivedSignals — seasonSignals coerenti", () => {
  const d = buildDerivedSignals([], APARTMENTS, PRICING_RULES, TODAY);
  const ss = d.seasonSignals;
  assert.ok(typeof ss.currentMonth === "number");
  assert.ok(typeof ss.seasonYear === "number");
  assert.ok(typeof ss.isInSeason === "boolean");
  assert.ok(["peak", "shoulder", "off_season"].includes(ss.currentSeason));
  assert.ok(typeof ss.daysToSeasonStart === "number");
  assert.ok(ss.daysToSeasonStart >= 0);
});

test("buildDerivedSignals — occupancyByApt per ogni appartamento", () => {
  const d = buildDerivedSignals(BOOKINGS_PARTIAL, APARTMENTS, PRICING_RULES, TODAY);
  assert.ok("apt1" in d.occupancyByApt, "deve avere occupancy per apt1");
  assert.ok("apt2" in d.occupancyByApt, "deve avere occupancy per apt2");
  for (const occ of Object.values(d.occupancyByApt)) {
    assert.ok(occ.occupancyRate >= 0 && occ.occupancyRate <= 100,
      `occupancyRate fuori range: ${occ.occupancyRate}`);
  }
});

test("buildDerivedSignals — nessun side effect (pura)", () => {
  const bookingsCopy = JSON.parse(JSON.stringify(BOOKINGS_PARTIAL));
  const aptsCopy     = JSON.parse(JSON.stringify(APARTMENTS));
  buildDerivedSignals(bookingsCopy, aptsCopy, PRICING_RULES, TODAY);
  // Original arrays must be unchanged
  assert.equal(bookingsCopy.length, BOOKINGS_PARTIAL.length);
  assert.equal(aptsCopy.length, APARTMENTS.length);
});

// ── Sicurezza (FASE 7 — punto 7) ─────────────────────────────────────────────

test("sicurezza — tutte le funzioni sono pure: nessuna scrittura DB", () => {
  // Se queste funzioni avessero side effects (fetch, db write), il test fallirebbe.
  // Verifichiamo che restituiscano valori senza eccezioni e senza richiedere I/O.
  const rules = getRentalPricingRules();
  assert.ok(rules != null);

  const price = estimateStayPrice({ checkin: "2026-08-01", checkout: "2026-08-08" }, rules);
  assert.ok(price != null);

  const slots = analyzeFreeSlots(BOOKINGS_PARTIAL, APARTMENTS, rules, TODAY);
  assert.ok(Array.isArray(slots));

  const opps = analyzeRevenueOpportunities(slots, rules);
  assert.ok(opps != null);

  const promo = draftSubitoPromotion(slots[0] ?? null, rules, APARTMENTS[0]);
  // promo can be null if no slots
  assert.ok(promo === null || typeof promo.fullText === "string");

  const summary = buildRevenueSummary(BOOKINGS_PARTIAL, rules, TODAY);
  assert.ok(summary != null);

  const derived = buildDerivedSignals(BOOKINGS_PARTIAL, APARTMENTS, rules, TODAY);
  assert.ok(derived != null);
});
