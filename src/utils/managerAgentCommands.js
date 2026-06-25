/**
 * managerAgentCommands.js — GestAffitti Manager Agent Command Engine
 *
 * Pure functions: no I/O, no side effects, no async.
 * Three phases: parseOwnerCommand → validateCommand → planAction
 */

import { checkAvailability } from "./agentAvailability.js";
import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

// ── Italian month lookup ──────────────────────────────────────────────────────

const MONTHS_IT = {
  gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6,
  luglio:7,  agosto:8,  settembre:9, ottobre:10, novembre:11, dicembre:12,
  gen:1, feb:2, mar:3, apr:4, mag:5, giu:6,
  lug:7, ago:8, set:9, ott:10, nov:11, dic:12,
};
const MONTH_PAT = Object.keys(MONTHS_IT).sort((a,b) => b.length-a.length).join("|");

// ── Date helpers ──────────────────────────────────────────────────────────────

function inferYear(month) {
  const now = new Date();
  const cur = now.getMonth() + 1;
  return month < cur ? now.getFullYear() + 1 : now.getFullYear();
}

function iso(d, m, y) {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function extractDates(text) {
  const t = text.toLowerCase();

  // dd/mm - dd/mm  or  dd/mm/yyyy - dd/mm/yyyy
  const rNum = /(?:dal\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:-|–|—|al)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i;
  const mNum = t.match(rNum);
  if (mNum) {
    const yIn  = mNum[3] ? Number(mNum[3]) : inferYear(Number(mNum[2]));
    const yOut = mNum[6] ? Number(mNum[6]) : inferYear(Number(mNum[5]));
    if (Number(mNum[2])>=1 && Number(mNum[2])<=12 && Number(mNum[5])>=1 && Number(mNum[5])<=12) {
      return { checkin: iso(Number(mNum[1]),Number(mNum[2]),yIn), checkout: iso(Number(mNum[4]),Number(mNum[5]),yOut) };
    }
  }

  // "10-17 agosto"  or  "dal 10 al 17 agosto"
  const rSame = new RegExp("(\\d{1,2})\\s*(?:-|al)\\s*(\\d{1,2})\\s+(" + MONTH_PAT + ")(?:\\s+(\\d{4}))?","i");
  const mSame = t.match(rSame);
  if (mSame) {
    const month = MONTHS_IT[mSame[3].toLowerCase()];
    if (month) {
      const year = mSame[4] ? Number(mSame[4]) : inferYear(month);
      return { checkin: iso(Number(mSame[1]),month,year), checkout: iso(Number(mSame[2]),month,year) };
    }
  }

  // "dal 10 agosto al 17 agosto"
  const rTwo = new RegExp(
    "(\\d{1,2})\\s+(" + MONTH_PAT + ")(?:\\s+(\\d{4}))?\\s*(?:-|–|al)\\s*(\\d{1,2})\\s+(" + MONTH_PAT + ")(?:\\s+(\\d{4}))?","i"
  );
  const mTwo = t.match(rTwo);
  if (mTwo) {
    const mIn  = MONTHS_IT[mTwo[2].toLowerCase()];
    const mOut = MONTHS_IT[mTwo[5].toLowerCase()];
    if (mIn && mOut) {
      const yIn  = mTwo[3] ? Number(mTwo[3]) : inferYear(mIn);
      const yOut = mTwo[6] ? Number(mTwo[6]) : inferYear(mOut);
      return { checkin: iso(Number(mTwo[1]),mIn,yIn), checkout: iso(Number(mTwo[4]),mOut,yOut) };
    }
  }

  return { checkin: null, checkout: null };
}

// ── Apartment detection ───────────────────────────────────────────────────────

function detectApartment(text, apartments, hostConfig = DEFAULT_HOST_CONFIG) {
  const lower = text.toLowerCase();
  const real = (apartments ?? []).filter(a => a.id !== "all");
  // Match by id or label from runtime apartments array (id lowercased — text is already lowercase)
  for (const apt of real) {
    if (new RegExp("\\b" + apt.id.toLowerCase() + "\\b").test(lower)) return apt.id;
    if (apt.label && lower.includes(apt.label.toLowerCase())) return apt.id;
  }
  // Match by numericAlias from hostConfig — never position-based
  for (const apt of (hostConfig?.apartments ?? [])) {
    if (apt.numericAlias != null) {
      const n = apt.numericAlias;
      if (new RegExp(`appart\\.?\\s*${n}\\b|apt\\s*${n}\\b`, "i").test(lower)) return apt.id;
    }
  }
  return null;
}

// ── Number extractors ─────────────────────────────────────────────────────────

function extractPrice(text) {
  const m = text.match(/prezzo[:\s]+€?\s*(\d+(?:[.,]\d+)?)|(?<![a-zA-Z])€\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  return Number((m[1] ?? m[2]).replace(",","."));
}

function extractDeposit(text) {
  const m = text.match(/(?:caparra|deposito|acconto)[:\s]+€?\s*(\d+(?:[.,]\d+)?)/i);
  return m ? Number(m[1].replace(",",".")) : null;
}

function extractGuests(text) {
  const m = text.match(/(\d+)\s*(?:ospiti|persone|adulti|pers\.?|pax)/i);
  return m ? Number(m[1]) : null;
}

// ── Guest name extraction ─────────────────────────────────────────────────────

function extractGuestRef(text) {
  const mDi = text.match(/\bdi\s+([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2})/i);
  if (mDi) return mDi[1].trim();
  const mPer = text.match(/\bper\s+([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2})(?:\s|$)/i);
  if (mPer) {
    const c = mPer[1].trim();
    if (!/^apt/i.test(c) && !/appart/i.test(c.toLowerCase())) return c;
  }
  return null;
}

function extractGuestForCreate(text) {
  const m = text.match(/(?:prenotazione|prenota)\s+(?:per\s+)?([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2}?)\s+(?:in|dal|a\b|nel)/i);
  if (m) return m[1].trim();
  return extractGuestRef(text);
}

// ── Intent detection ──────────────────────────────────────────────────────────

const INTENT_PATTERNS = [
  ["create_booking",    /crea\s+prenotazione|nuova\s+prenotazione|aggiungi\s+prenotazione|prenota\s+(?:per|dal)/i],
  ["mark_deposit_paid", /caparra\s+(?:ricevuta|pagata|ok)|deposito\s+ricevuto|segna\s+caparra|(?:caparra|deposito)\s+di\s+\w/i],
  ["mark_checkin_done", /check.?in\s+(?:fatto|registrato|ok|confermato|done)|segna\s+arrivo|registra\s+(?:check.?in|arrivo)|ospite\s+arrivato/i],
  ["cancel_booking",    /cancella\s+prenotazione|annulla\s+prenotazione|elimina\s+prenotazione/i],
  ["show_today_tasks",  /cosa\s+ho\s+(?:da\s+fare\s+)?oggi|attivit[aà]\s+(?:di\s+)?oggi|cosa\s+devo\s+fare|riepilogo\s+oggi/i],
];

function detectIntent(text) {
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return "unknown_command";
}

// ── Booking lookup ────────────────────────────────────────────────────────────

function findBookingByGuest(guestRef, bookings) {
  if (!guestRef) return null;
  const lower = guestRef.toLowerCase().trim();
  const exact = bookings.find(b => (b.guest ?? "").toLowerCase() === lower);
  if (exact) return exact;
  const firstName = lower.split(" ")[0];
  return bookings.find(b => {
    const name = (b.guest ?? "").toLowerCase();
    return name.startsWith(firstName) || name.includes(" " + firstName);
  }) ?? null;
}

// ── Public: parseOwnerCommand ─────────────────────────────────────────────────

/**
 * Parse an Italian owner command into { intent, rawParams }.
 * Pure — no validation, no DB access.
 *
 * @param {string} text
 * @param {{ apartments?: Array }} opts
 * @returns {{ intent: string, rawParams: object }}
 */
export function parseOwnerCommand(text, { apartments = [], hostConfig = DEFAULT_HOST_CONFIG } = {}) {
  const intent = detectIntent(text);
  let rawParams = {};

  if (intent === "create_booking") {
    const { checkin, checkout } = extractDates(text);
    rawParams = {
      guest:   extractGuestForCreate(text),
      aptId:   detectApartment(text, apartments, hostConfig),
      checkin,
      checkout,
      guests:  extractGuests(text),
      price:   extractPrice(text),
      deposit: extractDeposit(text),
    };
  } else if (["mark_deposit_paid","mark_checkin_done","cancel_booking"].includes(intent)) {
    rawParams = { guestRef: extractGuestRef(text) };
  }

  return { intent, rawParams };
}

// ── Public: validateCommand ───────────────────────────────────────────────────

/**
 * Validate a parsed command against live data.
 * For create_booking: checks calendar via checkAvailability.
 * For others: finds the booking by guest name.
 *
 * @param {{ intent: string, rawParams: object }} parsed
 * @param {{ bookings?: Array, apartments?: Array, today?: string }} opts
 * @returns {{ valid: boolean, errors: string[], payload: object }}
 */
export function validateCommand(parsed, { bookings = [], apartments = [], today = "", hostConfig = DEFAULT_HOST_CONFIG } = {}) {
  const { intent, rawParams } = parsed;

  if (intent === "show_today_tasks") {
    return { valid: true, errors: [], payload: {} };
  }

  if (intent === "unknown_command") {
    return {
      valid: false,
      errors: [
        "Comando non riconosciuto.",
        "Esempi:",
        "  • crea prenotazione per Mario Rossi in apt1 dal 5/7 al 12/7 prezzo 800",
        "  • caparra ricevuta di Rossi",
        "  • check-in fatto di Bianchi",
        "  • cancella prenotazione di Verdi",
        "  • cosa ho oggi",
      ],
      payload: {},
    };
  }

  if (intent === "create_booking") {
    const errors = [];
    const { guest, aptId, checkin, checkout, price } = rawParams;
    if (!guest)    errors.push("Nome ospite non trovato nel comando");
    if (!aptId) { const hint=(apartments??[]).filter(a=>a.id!=="all").map(a=>'"'+a.id+'"').join(' o '); errors.push('Appartamento non riconosciuto — usa '+(hint||'"appartamento"')+' o il nome completo'); }
    if (!checkin)  errors.push("Data check-in non trovata");
    if (!checkout) errors.push("Data check-out non trovata");
    if (price == null) errors.push("Prezzo non trovato");
    if (aptId && checkin && checkout && errors.length === 0) {
      const avail = checkAvailability({ aptId, checkin, checkout }, bookings);
      if (!avail.available) {
        const who = avail.conflictingBooking?.guest ?? "prenotazione esistente";
        errors.push(`Conflitto calendario: periodo occupato da "${who}"`);
      }
    }
    return { valid: errors.length === 0, errors, payload: errors.length === 0 ? rawParams : {} };
  }

  // mark_deposit_paid | mark_checkin_done | cancel_booking
  const { guestRef } = rawParams;
  if (!guestRef) {
    return { valid: false, errors: ["Nome ospite non trovato nel comando"], payload: {} };
  }
  const booking = findBookingByGuest(guestRef, bookings);
  if (!booking) {
    return { valid: false, errors: [`Nessuna prenotazione trovata per "${guestRef}"`], payload: {} };
  }
  if (intent === "mark_deposit_paid" && !!(booking.deposit_paid ?? booking.depositPaid)) {
    return { valid: false, errors: [`Caparra già segnata come ricevuta per ${booking.guest}`], payload: {} };
  }
  if (intent === "mark_checkin_done" && !!(booking.checkin_done ?? booking.checkinDone)) {
    return { valid: false, errors: [`Check-in già registrato per ${booking.guest}`], payload: {} };
  }
  if (intent === "cancel_booking" && booking.status === "cancelled") {
    return { valid: false, errors: [`Prenotazione di ${booking.guest} già cancellata`], payload: {} };
  }

  return { valid: true, errors: [], payload: { booking } };
}

// ── Public: planAction ────────────────────────────────────────────────────────

/**
 * Produce an executable action plan from a validated command.
 *
 * @param {{ intent: string, rawParams: object }} parsed
 * @param {{ valid: boolean, errors: string[], payload: object }} validated
 * @returns {{ type: string, canExecute: boolean, payload: object|null, message: string, confirmRequired: boolean }}
 */
export function planAction(parsed, validated) {
  const { intent } = parsed;

  if (!validated.valid) {
    return {
      type: intent,
      canExecute: false,
      payload: null,
      message: validated.errors.join("\n"),
      confirmRequired: false,
    };
  }

  if (intent === "show_today_tasks") {
    return { type: "show_today_tasks", canExecute: true, payload: {}, message: "", confirmRequired: false };
  }

  const { payload } = validated;
  let message = "";

  if (intent === "create_booking") {
    const depLine = payload.deposit ? ` (caparra €${payload.deposit})` : "";
    message = `Creare prenotazione:\n• Ospite: ${payload.guest}\n• Apt: ${payload.aptId}\n• Dal ${payload.checkin} al ${payload.checkout}\n• €${payload.price}${depLine}`;
  } else if (intent === "mark_deposit_paid") {
    message = `Segnare caparra ricevuta per ${payload.booking.guest} (${payload.booking.apt}) — arrivo ${payload.booking.checkin}`;
  } else if (intent === "mark_checkin_done") {
    message = `Registrare check-in di ${payload.booking.guest} (${payload.booking.apt}) — ${payload.booking.checkin}`;
  } else if (intent === "cancel_booking") {
    message = `Cancellare prenotazione di ${payload.booking.guest} (${payload.booking.apt}) dal ${payload.booking.checkin} al ${payload.booking.checkout}`;
  }

  return { type: intent, canExecute: true, payload, message, confirmRequired: true };
}
