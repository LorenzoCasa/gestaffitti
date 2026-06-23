/**
 * agenticBrainNormalizer.js — GestAffitti Agentic Brain Normalizer
 *
 * Pure utility: zero I/O, zero async, zero DB, zero side effects.
 *
 * Purpose: pre-process owner messages and extract signals (intent hints,
 * soft references, missing fields) to enrich the LLM context.
 * Results are HINTS — the LLM remains the final decision-maker.
 *
 * Exports:
 *   normalizeOwnerMessage(rawText)
 *   extractSoftReferences(text)
 *   classifyOwnerIntent(text)
 *   detectMissingFields(intent, resolved)
 *   buildClarificationQuestion(intent, missing_fields, { bookingCandidates, inboxCandidates })
 *   rankCandidateBookings(softRefs, bookings, { today, selectedBookingId })
 *   rankCandidateInboxRequests(softRefs, inbox, { selectedThreadId })
 */

// ── Synonym maps ──────────────────────────────────────────────────────────────

const DEPOSIT_SYNONYMS = [
  "caparra", "acconto", "anticipo", "deposito", "versamento",
  "ha pagato", "ha versato", "ha mandato", "ha fatto il bonifico",
  "pagato", "versato", "bonifico",
];

const CHECKIN_SYNONYMS = [
  "arrivato", "arriva", "arriverà", "è arrivato", "è entrato",
  "entrato", "entrata", "accesso", "check-in", "checkin",
  "è qui", "sono arrivati", "ha fatto il check",
  "è entrata", "è arrivata", "arrivata",
];

const CHECKOUT_SYNONYMS = [
  "partito", "partita", "andato", "andata", "andato via", "andata via",
  "è partito", "è partita", "ha lasciato", "lasciato",
  "check-out", "checkout", "è andato", "sono partiti",
  "ha fatto il check-out", "ha fatto checkout", "sono andati",
];

const CONFIRM_SYNONYMS = [
  "confermato", "conferma", "prende", "lo prende", "la prende",
  "ha detto ok", "ha detto si", "ha detto sì",
  "d'accordo", "va bene", "ci sta", "preso", "prenota",
  "vuole prenotare", "ha accettato", "interessato", "interessata",
];

const MARKET_SYNONYMS = [
  "sto vendendo", "vendo basso", "vendo caro",
  "concorrenza", "competitor", "mercato",
  "riempio", "riempirò", "occupazione",
  "quanto chiedono", "quanto guadagno",
  "revenue", "ricavi", "stagione",
];

const APT1_TOKENS = [
  "uno", "appartamento uno", "apt1", "appartamento 1",
  "primo appartamento", "appartamento grande", "il grande",
  "primo", "app uno", "app 1",
];

const APT2_TOKENS = [
  "due", "appartamento due", "apt2", "appartamento 2",
  "secondo appartamento", "altro appartamento", "l'altro",
  "secondo", "app due", "app 2",
];

const SOFT_REF_PATTERNS = [
  { re: /\b(quello|quella)\b/i,        type: "vague_person" },
  { re: /\b(lui|lei)\b/i,              type: "vague_person" },
  { re: /\bla\s+signora\b/i,           type: "person_female" },
  { re: /\bil\s+(cliente|tizio|tipo)\b/i, type: "person_male" },
  { re: /\bquello\s+di\s+subito\b/i,   type: "inbox_subito" },
  { re: /\bl['']ospite\b/i,            type: "vague_person" },
  { re: /\bla\s+famiglia\b/i,          type: "family_group" },
  { re: /\bi\s+ragazzi\b/i,            type: "group" },
  { re: /\bla\s+coppia\b/i,            type: "couple" },
  { re: /\bquelli\b/i,                 type: "vague_group" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(str) {
  return (str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function hasAny(text, list) {
  const n = norm(text);
  return list.some(s => n.includes(norm(s)));
}

function matchedFrom(text, list) {
  const n = norm(text);
  return list.filter(s => n.includes(norm(s)));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalize a raw owner message.
 * Strips accents, lowercases, removes common voice filler words.
 *
 * @param {string} rawText
 * @returns {{ normalized: string, original: string, is_voice: boolean }}
 */
export function normalizeOwnerMessage(rawText) {
  const original = (rawText ?? "").trim();
  const is_voice = original.length > 0 && !/[.!?]$/.test(original) && original.length < 120;
  const normalized = norm(original)
    .replace(/\beh\b|\bboh\b|\bmah\b|\bdai\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { normalized, original, is_voice };
}

/**
 * Extract soft references from natural text.
 * Returns recognized vague pronouns/references.
 *
 * @param {string} text
 * @returns {Array<{ type: string, raw: string, confidence: number }>}
 */
export function extractSoftReferences(text) {
  const refs = [];
  for (const { re, type } of SOFT_REF_PATTERNS) {
    const m = re.exec(text);
    if (m) refs.push({ type, raw: m[0], confidence: 0.7 });
  }
  return refs;
}

/**
 * Classify owner intent from natural language patterns.
 * This is a HINT for the LLM — not authoritative.
 * Precedence: market > checkout > checkin > deposit > confirm > summary > calendar.
 *
 * @param {string} text
 * @returns {{ intent: string, confidence: number, synonyms_matched: string[], apt_hint: string|null }}
 */
export function classifyOwnerIntent(text) {
  const n = norm(text);

  // Market questions — no action_plan ever
  if (hasAny(n, MARKET_SYNONYMS)) {
    return { intent: "market_analysis", confidence: 0.75,
      synonyms_matched: matchedFrom(n, MARKET_SYNONYMS), apt_hint: null };
  }

  // Checkout (must check before checkin — "partito" vs "arrivato")
  if (hasAny(n, CHECKOUT_SYNONYMS)) {
    return { intent: "mark_checkout_done", confidence: 0.80,
      synonyms_matched: matchedFrom(n, CHECKOUT_SYNONYMS), apt_hint: null };
  }

  // Checkin
  if (hasAny(n, CHECKIN_SYNONYMS)) {
    return { intent: "mark_checkin_done", confidence: 0.80,
      synonyms_matched: matchedFrom(n, CHECKIN_SYNONYMS), apt_hint: null };
  }

  // Deposit
  if (hasAny(n, DEPOSIT_SYNONYMS)) {
    return { intent: "mark_deposit_paid", confidence: 0.82,
      synonyms_matched: matchedFrom(n, DEPOSIT_SYNONYMS), apt_hint: null };
  }

  // Confirm / book
  if (hasAny(n, CONFIRM_SYNONYMS)) {
    const aptHint = hasAny(n, APT1_TOKENS) ? "apt1" : hasAny(n, APT2_TOKENS) ? "apt2" : null;
    return { intent: "confirm_request", confidence: 0.72,
      synonyms_matched: matchedFrom(n, CONFIRM_SYNONYMS), apt_hint: aptHint };
  }

  // Summary / today's tasks
  if (/\b(punto|riepilogo|situazione|cosa\s+ho|che\s+ho|aggiornami|fammi\s+il|priorit)\b/i.test(text)) {
    return { intent: "show_today_tasks", confidence: 0.85,
      synonyms_matched: ["riepilogo"], apt_hint: null };
  }

  // Calendar status
  if (/\b(libero|disponibile|occupato|calendario)\b/i.test(text)) {
    return { intent: "show_calendar_status", confidence: 0.70,
      synonyms_matched: [], apt_hint: null };
  }

  return { intent: "no_action", confidence: 0.30, synonyms_matched: [], apt_hint: null };
}

/**
 * Detect which fields are missing for a given intent.
 *
 * @param {string} intent
 * @param {{ bookingId?: string, inboxId?: string, aptId?: string,
 *           guest?: string, checkin?: string, checkout?: string }} resolved
 * @returns {{ missing_fields: string[], can_proceed: boolean }}
 */
export function detectMissingFields(intent, resolved = {}) {
  const missing = [];

  switch (intent) {
    case "mark_deposit_paid":
    case "mark_checkin_done":
    case "mark_checkout_done":
    case "cancel_booking":
      if (!resolved.bookingId) missing.push("bookingId");
      break;
    case "create_booking":
      if (!resolved.aptId)    missing.push("aptId");
      if (!resolved.guest)    missing.push("guest");
      if (!resolved.checkin)  missing.push("checkin");
      if (!resolved.checkout) missing.push("checkout");
      break;
    case "confirm_request":
      if (!resolved.bookingId && !resolved.inboxId) missing.push("request_id");
      break;
    default:
      break;
  }

  return { missing_fields: missing, can_proceed: missing.length === 0 };
}

/**
 * Build a natural Italian clarification question for missing data.
 *
 * @param {string} intent
 * @param {string[]} missing_fields
 * @param {{ bookingCandidates?: object[], inboxCandidates?: object[] }} candidates
 * @returns {string|null}
 */
export function buildClarificationQuestion(intent, missing_fields, { bookingCandidates = [], inboxCandidates = [] } = {}) {
  if (!missing_fields || missing_fields.length === 0) return null;

  const label = {
    mark_deposit_paid:  "segnare la caparra ricevuta",
    mark_checkin_done:  "registrare il check-in",
    mark_checkout_done: "registrare il check-out",
    cancel_booking:     "cancellare la prenotazione",
    create_booking:     "creare la prenotazione",
    confirm_request:    "confermare la richiesta",
  }[intent] ?? "procedere";

  if (missing_fields.includes("bookingId")) {
    if (bookingCandidates.length > 1) {
      const list = bookingCandidates.slice(0, 3)
        .map((c, i) => `${i + 1}. ${c.guest} (${c.checkin}→${c.checkout}, ${c.apt})`)
        .join("\n");
      return `Per ${label}, a quale prenotazione ti riferisci?\n${list}`;
    }
    if (bookingCandidates.length === 0) {
      return `Per ${label}, non trovo prenotazioni attive. Dimmi il nome dell'ospite o le date.`;
    }
    return `Per ${label}, di quale prenotazione si tratta? Dimmi il nome dell'ospite o le date.`;
  }

  if (missing_fields.includes("request_id")) {
    if (inboxCandidates.length > 1) {
      const list = inboxCandidates.slice(0, 3)
        .map((c, i) => `${i + 1}. ${c.guest ?? "?"} — ${(c.preview ?? "").slice(0, 60)}`)
        .join("\n");
      return `Quale richiesta vuoi confermare?\n${list}`;
    }
    return `Quale richiesta intendi confermare?`;
  }

  if (missing_fields.includes("aptId"))    return "Per quale appartamento? (Appartamento 1 o Appartamento 2)";
  if (missing_fields.includes("guest"))    return "Come si chiama l'ospite?";
  if (missing_fields.includes("checkin") && missing_fields.includes("checkout")) {
    return "Quali sono le date di arrivo e partenza?";
  }
  if (missing_fields.includes("checkin"))  return "Da quando arriva?";
  if (missing_fields.includes("checkout")) return "Fino a quando si ferma?";

  return `Per ${label}, mi servono ancora: ${missing_fields.join(", ")}.`;
}

/**
 * Rank candidate bookings by relevance to soft refs and intent.
 * Returns candidates sorted highest-score first.
 *
 * @param {Array<{ type: string, raw: string }>} softRefs
 * @param {object[]} bookings
 * @param {{ today?: string, selectedBookingId?: string }} options
 * @returns {Array<{ booking: object, score: number, reasons: string[] }>}
 */
export function rankCandidateBookings(softRefs = [], bookings = [], { today = null, selectedBookingId = null } = {}) {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const results = [];

  for (const b of bookings) {
    let score = 0;
    const reasons = [];

    if (selectedBookingId && b.id === selectedBookingId) {
      score += 100; reasons.push("selectedBookingId match");
    }

    // Currently checked in
    if (b.checkin <= todayStr && b.checkout > todayStr) {
      score += 30; reasons.push("currently checked in");
    }

    // Arriving soon (next 7 days)
    const msPerDay = 86400000;
    const daysToCheckin = Math.ceil((new Date(b.checkin) - new Date(todayStr)) / msPerDay);
    if (daysToCheckin >= 0 && daysToCheckin <= 7) {
      score += Math.max(0, 20 - daysToCheckin * 2);
      reasons.push(`arriving in ${daysToCheckin}d`);
    }

    // Soft ref matching
    for (const ref of softRefs) {
      if (ref.type === "family_group" && (b.guests ?? 0) > 3) {
        score += 15; reasons.push("family_group matches guests>3");
      }
      if (ref.type === "couple" && (b.guests ?? 0) === 2) {
        score += 15; reasons.push("couple matches guests=2");
      }
    }

    // Future bookings have slight advantage over expired
    if (b.checkin > todayStr) { score += 5; reasons.push("future booking"); }

    results.push({ booking: b, score, reasons });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Rank candidate inbox requests by relevance to soft refs.
 *
 * @param {Array<{ type: string, raw: string }>} softRefs
 * @param {object[]} inbox
 * @param {{ selectedThreadId?: string }} options
 * @returns {Array<{ item: object, score: number, reasons: string[] }>}
 */
export function rankCandidateInboxRequests(softRefs = [], inbox = [], { selectedThreadId = null } = {}) {
  const results = [];

  for (const item of inbox) {
    let score = 0;
    const reasons = [];

    if (selectedThreadId && item.id === selectedThreadId) {
      score += 100; reasons.push("selectedThreadId match");
    }
    if (item.status === "pending" || item.status === "new") {
      score += 20; reasons.push("pending");
    }
    for (const ref of softRefs) {
      if (ref.type === "inbox_subito" && item.source === "subito") {
        score += 25; reasons.push("subito source match");
      }
    }
    if (!item.decision) { score += 10; reasons.push("no decision yet"); }

    results.push({ item, score, reasons });
  }

  return results.sort((a, b) => b.score - a.score);
}
