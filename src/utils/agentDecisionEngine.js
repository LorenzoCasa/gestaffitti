/**
 * agentDecisionEngine.js — Orchestrator for the Agent Decision Engine
 *
 * Combines availability + pricing into a structured Decision object
 * and selects the correct Italian response template.
 *
 * Pure function: no side-effects, no I/O, no API calls.
 * All NLP/AI parsing happens upstream (agentParser.js — Sprint A1.1d).
 *
 * Decision flow:
 *   1. Validate that checkin + checkout are present            → NEEDS_INFO
 *   2. Check availability via checkAvailability()              → UNAVAILABLE / PARTIALLY_AVAILABLE
 *   3. Compute price via calculatePrice()                      → AVAILABLE
 *   4. If discount offered → run evaluateDiscount()            → PRICE_NEGOTIATION
 *   5. If engine confidence below threshold → MANUAL_REVIEW
 *   6. Generate Italian response text for the chosen decision
 */

import { checkAvailability, findFreeWindows } from "./agentAvailability.js";
import { calculatePrice, evaluateDiscount }   from "./agentPricing.js";
import { AGENT_DECISION_TYPES }               from "../constants.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Response templates (Italian)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill a template string with a values map.
 * Placeholders: {{key}}
 *
 * @param {string} template
 * @param {Object} values
 * @returns {string}
 */
function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `{{${k}}}`);
}

/**
 * Italian date formatter: "2025-07-14" → "14 luglio 2025"
 * @param {string} isoDate
 * @returns {string}
 */
function itDate(isoDate) {
  if (!isoDate) return "—";
  const months = [
    "gennaio","febbraio","marzo","aprile","maggio","giugno",
    "luglio","agosto","settembre","ottobre","novembre","dicembre",
  ];
  const [y, m, d] = isoDate.split("-");
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// ── Core templates ────────────────────────────────────────────────────────────

const TEMPLATES = {

  available: fill(`Salve {{guestName}},
grazie per la sua richiesta!
L'appartamento è disponibile dal {{checkin}} al {{checkout}} ({{nights}} notti).

💶 Totale: €{{totalGuestPrice}}{{cleaningLine}}
(€{{pricePerNight}}/notte · stagione {{season}})

Per confermare la prenotazione le chiediamo di:
– fornire i dati dei soggiornanti
– versare un acconto di €{{deposit}}

Siamo a disposizione per qualsiasi informazione.
Cordiali saluti`, {}),

  unavailable: fill(`Salve {{guestName}},
la ringraziamo per l'interesse.
Purtroppo l'appartamento non è disponibile nel periodo richiesto ({{checkin}} – {{checkout}}).
{{alternativesBlock}}
Restiamo a disposizione per altri periodi.
Cordiali saluti`, {}),

  partially_available: fill(`Salve {{guestName}},
grazie per la sua richiesta.
Il periodo completo ({{checkin}} – {{checkout}}) non è disponibile,
tuttavia abbiamo libero il seguente periodo alternativo:

📅 {{altCheckin}} – {{altCheckout}} ({{altNights}} notti)

💶 Totale stimato: €{{altTotal}}

Le interessa questa soluzione?
Cordiali saluti`, {}),

  needs_info: fill(`Salve {{guestName}},
grazie per averci contattato!
Per verificare la disponibilità le chiediamo gentilmente di indicare:
– data di arrivo
– data di partenza
– numero di ospiti

Risponderemo al più presto.
Cordiali saluti`, {}),

  price_negotiation_accept: fill(`Salve {{guestName}},
siamo lieti di accettare la sua proposta di €{{offeredTotal}} per il soggiorno
dal {{checkin}} al {{checkout}} ({{nights}} notti).

Per completare la prenotazione le chiediamo di:
– fornire i dati dei soggiornanti
– versare un acconto di €{{deposit}}

Cordiali saluti`, {}),

  price_negotiation_counter: fill(`Salve {{guestName}},
grazie per la sua proposta.
La migliore offerta che possiamo fare per il periodo {{checkin}} – {{checkout}} è €{{counterOffer}}
(rispetto al prezzo di listino di €{{listPrice}}).

Rimaniamo in attesa di una sua risposta.
Cordiali saluti`, {}),

  manual_review: fill(`Salve {{guestName}},
grazie per il suo messaggio.
Stiamo verificando la disponibilità e le risponderemo entro 24 ore.
Cordiali saluti`, {}),
};

// ─────────────────────────────────────────────────────────────────────────────
//  Decision builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDecision(type, responseText, payload = {}, score = null) {
  return {
    type,                 // one of AGENT_DECISION_TYPES
    responseText,         // ready-to-send Italian reply
    payload,              // structured data (pricing, availability, alternatives…)
    decision_score: score, // null until confidence model is trained (Sprint A1.1d+)
    requiresOwnerApproval: type === "manual_review" || type === "price_negotiation",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full decision pipeline for an incoming inquiry.
 *
 * @param {{
 *   aptId:          string,
 *   guestName?:     string,
 *   checkin:        string | null,   – "YYYY-MM-DD" or null if not parsed
 *   checkout:       string | null,
 *   guests?:        number,
 *   offeredPrice?:  number | null,   – guest's counter-offer, if any
 *   source:         string,          – one of AGENT_SOURCES
 * }} inquiry  – parsed inquiry (output of agentParser or manual input)
 *
 * @param {Array}  bookings    – full bookings array from useSupabaseData
 *
 * @param {{
 *   baseNightlyRate:   number,
 *   cleaningFee?:      number,
 *   extraGuestFee?:    number,
 *   guestThreshold?:   number,
 *   minNights?:        number,
 *   bufferBeforeDays?: number,
 *   bufferAfterDays?:  number,
 *   maxDiscountPct?:   number,
 *   minNetTarget?:     number,
 *   deposit?:          number,   – acconto richiesto per conferma (EUR)
 * }} aptRules
 *
 * @param {number} commissionPct  – from AGENT_PLATFORM_PROFILES[source].commissionPct
 *
 * @param {{
 *   occupancyRate?:    number,
 *   daysUntilCheckin?: number,
 * }} marketContext  – optional; reserved for occupancy intelligence
 *
 * @returns {ReturnType<buildDecision>}
 */
export function runDecisionEngine(
  inquiry,
  bookings,
  aptRules,
  commissionPct = 0,
  marketContext = {},
) {
  const {
    aptId,
    guestName    = "ospite",
    checkin      = null,
    checkout     = null,
    guests       = 2,
    offeredPrice = null,
    source       = "altro",
  } = inquiry;

  const deposit = aptRules.deposit ?? 0;

  // ── Step 1: Missing dates → ask for them ───────────────────────────────────
  if (!checkin || !checkout) {
    const text = fill(TEMPLATES.needs_info, { guestName });
    return buildDecision("needs_info", text, { source }, null);
  }

  // ── Step 2: Availability check ────────────────────────────────────────────
  const avail = checkAvailability(
    { aptId, checkin, checkout },
    bookings,
    {
      minNights:        aptRules.minNights        ?? 1,
      bufferBeforeDays: aptRules.bufferBeforeDays ?? 0,
      bufferAfterDays:  aptRules.bufferAfterDays  ?? 0,
    },
  );

  if (!avail.available) {
    // Look for alternatives in the next 90 days from the requested checkin
    const searchUntil = (() => {
      const d = new Date(checkin + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 90);
      return d.toISOString().slice(0, 10);
    })();

    const windows = findFreeWindows(
      aptId, checkin, searchUntil, bookings,
      { minNights: avail.nights || aptRules.minNights || 1 },
    );

    avail.alternativeSuggestions = windows.slice(0, 3); // top 3

    // If there's a good alternative that fits the same number of nights → partially_available
    const exactAlt = windows.find(w => w.nights >= avail.nights);
    if (exactAlt) {
      const altPricing = calculatePrice(
        { checkin: exactAlt.checkin, checkout: exactAlt.checkout, nights: exactAlt.nights, guests },
        aptRules, commissionPct, marketContext,
      );
      const text = fill(TEMPLATES.partially_available, {
        guestName,
        checkin:    itDate(checkin),
        checkout:   itDate(checkout),
        altCheckin:  itDate(exactAlt.checkin),
        altCheckout: itDate(exactAlt.checkout),
        altNights:   exactAlt.nights,
        altTotal:    altPricing.totalGuestPrice,
      });
      return buildDecision("partially_available", text, { avail, altPricing, windows }, null);
    }

    // No suitable alternative → fully unavailable
    const alternativesBlock = windows.length > 0
      ? "\nPeriodi alternativi disponibili:\n" +
        windows.map(w => `  📅 ${itDate(w.checkin)} – ${itDate(w.checkout)} (${w.nights} notti)`).join("\n") +
        "\n"
      : "";

    const text = fill(TEMPLATES.unavailable, {
      guestName,
      checkin:  itDate(checkin),
      checkout: itDate(checkout),
      alternativesBlock,
    });
    return buildDecision("unavailable", text, { avail, windows }, null);
  }

  // ── Step 3: Price calculation ─────────────────────────────────────────────
  const pricing = calculatePrice(
    { checkin, checkout, nights: avail.nights, guests },
    aptRules, commissionPct, marketContext,
  );

  const cleaningLine = pricing.cleaningFee > 0
    ? ` + €${pricing.cleaningFee} pulizie`
    : "";

  // ── Step 4: Discount / negotiation ────────────────────────────────────────
  if (offeredPrice !== null && offeredPrice < pricing.totalGuestPrice) {
    const nego = evaluateDiscount(offeredPrice, pricing, {
      maxDiscountPct: aptRules.maxDiscountPct ?? 10,
      minNetTarget:   aptRules.minNetTarget   ?? 0,
    });

    if (nego.recommendation === "accept") {
      const text = fill(TEMPLATES.price_negotiation_accept, {
        guestName,
        offeredTotal: offeredPrice,
        checkin:  itDate(checkin),
        checkout: itDate(checkout),
        nights:   avail.nights,
        deposit,
      });
      return buildDecision("price_negotiation", text, { avail, pricing, nego }, null);
    } else {
      const text = fill(TEMPLATES.price_negotiation_counter, {
        guestName,
        checkin:     itDate(checkin),
        checkout:    itDate(checkout),
        counterOffer: nego.counterOffer ?? pricing.totalGuestPrice,
        listPrice:   pricing.totalGuestPrice,
      });
      return buildDecision("price_negotiation", text, { avail, pricing, nego }, null);
    }
  }

  // ── Step 5: Standard available response ───────────────────────────────────
  const text = fill(TEMPLATES.available, {
    guestName,
    checkin:        itDate(checkin),
    checkout:       itDate(checkout),
    nights:         avail.nights,
    totalGuestPrice: pricing.totalGuestPrice,
    cleaningLine,
    pricePerNight:  pricing.pricePerNight,
    season:         pricing.season,
    deposit,
  });

  return buildDecision("available", text, { avail, pricing }, null);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Escalation helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Force a manual_review decision (e.g. when AI confidence is too low,
 * or the inquiry contains an edge case the engine cannot handle).
 *
 * @param {string} guestName
 * @param {string} reason  – internal reason code (not shown to guest)
 * @returns {ReturnType<buildDecision>}
 */
export function escalateToOwner(guestName = "ospite", reason = "low_confidence") {
  const text = fill(TEMPLATES.manual_review, { guestName });
  return buildDecision("manual_review", text, { reason }, null);
}
