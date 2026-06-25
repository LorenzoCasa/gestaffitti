// ═══════════════════════════════════════════════════════════════════════════
//  llm-reply-generator — Sprint D1.1
//
//  Riceve un payload da Supabase Database Webhook (INSERT su agent_inbox),
//  costruisce il contesto dell'inquiry, chiama Claude Sonnet per generare
//  una risposta suggerita in italiano, e la salva in agent_decisions.
//
//  Se l'API Anthropic fallisce (timeout, errore, API key mancante),
//  genera la risposta tramite i template deterministici (fallback).
//
//  Sicurezza: Bearer token statico (WEBHOOK_SECRET), stesso pattern
//  usato da agent-webhook.
//
//  Secrets richiesti (supabase secrets set):
//    ANTHROPIC_API_KEY   — chiave Anthropic API
//    WEBHOOK_SECRET      — già configurato per agent-webhook
//    LLM_MODEL           — env var (default: claude-sonnet-4-6)
//
//  Deploy (CRITICO — includere sempre --no-verify-jwt):
//    supabase functions deploy llm-reply-generator \
//      --no-verify-jwt \
//      --project-ref rkhxbjrfjwavwhehtavg
//
//  NOTA ARCHITETTURALE:
//  Il Supabase Database Webhook usa pg_net con timeout di 5s.
//  L'elaborazione (Supabase queries + Anthropic API) può richiedere 10-25s.
//  Soluzione: la funzione risponde 202 Accepted immediatamente, poi
//  continua l'elaborazione pesante in un task asincrono in background.
//  In Deno Edge Runtime, i task avviati prima del return continuano
//  dopo che la risposta HTTP è stata inviata al chiamante.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EDGE_SEASONAL_RATES, EDGE_PEAK_MONTHS, EDGE_VALID_NIGHTS, EDGE_SUBITO_TITLE_MAP, EDGE_HOST_IDENTITY } from "../_shared/hostConfig.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: AgentInboxRecord | null;
  old_record: AgentInboxRecord | null;
}

interface AgentInboxRecord {
  id: string;
  source: string;
  source_message_id: string;
  source_thread_id: string | null;
  raw_text: string;
  raw_metadata: Record<string, unknown> | null;
  status: string;
  apt_id: string | null;
  created_at: string;
}

interface Apartment {
  id: string;
  label: string;
  color?: string;
}

interface Booking {
  id: string;
  apt: string;
  checkin: string;
  checkout: string;
  status: string;
}

interface AptRule {
  apt_id: string;
  source: string;
  min_nights?: number;
  buffer_before_days?: number;
  buffer_after_days?: number;
  [key: string]: unknown;
}

interface AgentContext {
  inquiry: Record<string, unknown>;
  apartment: { id: string; label: string };
  availability: Record<string, unknown>;
  fullMonthAvailability: Record<string, unknown> | null;
  fullMonthWeekWindows: unknown[] | null;
  pricing: Record<string, unknown>;
  stayRules: Record<string, unknown>;
  alternatives: { items: unknown[]; count: number };
  messageHistory: Record<string, unknown>;
  decision: { type: string };
  warnings: string[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  INLINED UTILITIES — ported from src/utils/ for Deno runtime
//  Pure functions: no side-effects, no I/O
// ═══════════════════════════════════════════════════════════════════════════

// ── agentListingResolver ──────────────────────────────────────────────────────

const SUBITO_TITLE_MAP = EDGE_SUBITO_TITLE_MAP;

const GENERIC_WORDS = new Set([
  "appartamento", "casa", "mare", "affitto", "stanza", "camera",
  "alloggio", "locale", "bilocale", "trilocale", "villa", "monolocale",
  "il", "la", "lo", "le", "gli", "i", "un", "una", "di", "da", "in", "a", "e", "con",
]);

function distinctiveWords(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[\s\-_/,.()+]+/)
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

function extractListingTitle(rawMetadata: Record<string, unknown> | null): string | null {
  if (!rawMetadata) return null;
  return (
    (rawMetadata.listing_title as string) ||
    (rawMetadata.email_subject as string) ||
    (rawMetadata.subject as string) ||
    null
  ) || null;
}

function resolveListingFromTitle(
  listingTitle: string | null,
  apartments: Apartment[],
): string | null {
  if (!listingTitle) return null;
  const title = listingTitle.toLowerCase().trim();

  for (const [key, aptId] of Object.entries(SUBITO_TITLE_MAP)) {
    if (title === key || title.includes(key)) return aptId;
  }

  if (!apartments?.length) return null;

  for (const apt of apartments) {
    if (title.includes(apt.label.toLowerCase())) return apt.id;
  }

  const matches: string[] = [];
  for (const apt of apartments) {
    const words = distinctiveWords(apt.label);
    if (words.length === 0) continue;
    const found = words.filter((w) => title.includes(w));
    if (found.length === words.length) matches.push(apt.id);
  }
  if (matches.length === 1) return matches[0];

  return null;
}

// ── agentParser ───────────────────────────────────────────────────────────────

const MONTHS_IT: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6,
  lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
};
const MONTH_NAMES_IT = Object.keys(MONTHS_IT).sort((a, b) => b.length - a.length).join("|");

function inferYear(month: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return month < currentMonth ? currentYear + 1 : currentYear;
}

function isoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractNumericDates(text: string) {
  const re =
    /(?:dal\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:-|–|—|al)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i;
  const match = text.match(re);
  if (!match) return { checkin: null, checkout: null };
  const dayIn = Number(match[1]), monthIn = Number(match[2]);
  const yearIn = match[3] ? Number(match[3]) : inferYear(monthIn);
  const dayOut = Number(match[4]), monthOut = Number(match[5]);
  const yearOut = match[6] ? Number(match[6]) : inferYear(monthOut);
  if (monthIn < 1 || monthIn > 12 || monthOut < 1 || monthOut > 12) {
    return { checkin: null, checkout: null };
  }
  return {
    checkin: isoDate(dayIn, monthIn, yearIn),
    checkout: isoDate(dayOut, monthOut, yearOut),
  };
}

function extractTextualDates(text: string) {
  const t = text.toLowerCase();
  const rSame = new RegExp(
    `(\\d{1,2})\\s*(?:-|al)\\s*(\\d{1,2})\\s+(${MONTH_NAMES_IT})(?:\\s+(\\d{4}))?`, "i",
  );
  const mSame = t.match(rSame);
  if (mSame) {
    const month = MONTHS_IT[mSame[3].toLowerCase()];
    if (month) {
      const year = mSame[4] ? Number(mSame[4]) : inferYear(month);
      return {
        checkin: isoDate(Number(mSame[1]), month, year),
        checkout: isoDate(Number(mSame[2]), month, year),
      };
    }
  }
  const rTwo = new RegExp(
    `(\\d{1,2})\\s+(${MONTH_NAMES_IT})(?:\\s+(\\d{4}))?\\s*(?:-|al)\\s*(\\d{1,2})\\s+(${MONTH_NAMES_IT})(?:\\s+(\\d{4}))?`,
    "i",
  );
  const mTwo = t.match(rTwo);
  if (mTwo) {
    const m1 = MONTHS_IT[mTwo[2].toLowerCase()], m2 = MONTHS_IT[mTwo[5].toLowerCase()];
    if (m1 && m2) {
      return {
        checkin: isoDate(Number(mTwo[1]), m1, mTwo[3] ? Number(mTwo[3]) : inferYear(m1)),
        checkout: isoDate(Number(mTwo[4]), m2, mTwo[6] ? Number(mTwo[6]) : inferYear(m2)),
      };
    }
  }
  return { checkin: null as string | null, checkout: null as string | null };
}

function detectFullMonth(text: string) {
  const t = text.toLowerCase();
  const rTutto = new RegExp(`\\btutto\\s+(${MONTH_NAMES_IT})\\b`, "i");
  const mTutto = t.match(rTutto);
  if (mTutto) {
    const num = MONTHS_IT[mTutto[1].toLowerCase()];
    if (num) return { isFullMonth: true, fullMonthNum: num };
  }
  const rMese = new RegExp(
    `(?:mese\\s+intero|tutto\\s+il\\s+mese)(?:\\s+di\\s+(${MONTH_NAMES_IT}))?`, "i",
  );
  const mMese = t.match(rMese);
  if (mMese) {
    const num = mMese[1] ? (MONTHS_IT[mMese[1].toLowerCase()] ?? null) : null;
    return { isFullMonth: true, fullMonthNum: num };
  }
  return null;
}

function extractGuests(text: string): number | null {
  const t = text.toLowerCase();
  const adultM = t.match(/(\d+)\s+adulti?/);
  const childM = t.match(/(\d+)\s+bambin[io]/);
  if (adultM && childM) return Number(adultM[1]) + Number(childM[1]);
  const patterns = [
    /siamo\s+in\s+(\d+)/, /siamo\s+(\d+)/, /per\s+(\d+)\s+person[ae]/,
    /(\d+)\s+person[ae]/, /(\d+)\s+adulti?/, /(\d+)\s+ospiti?/, /famiglia\s+di\s+(\d+)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 20) return n;
    }
  }
  return null;
}

function parseAgentInquiry(rawText: string, rawMetadata: Record<string, unknown> = {}) {
  const text = rawText || "";
  const _fm = detectFullMonth(text);
  let checkin: string | null = null, checkout: string | null = null;
  if (!_fm) {
    const _nd = extractNumericDates(text);
    const _dates = _nd.checkin ? _nd : extractTextualDates(text);
    checkin = _dates.checkin;
    checkout = _dates.checkout;
  }
  const guests = extractGuests(text);
  const questions = text.split(/[.!]/).map((s) => s.trim()).filter((s) => s.includes("?"));
  const missingFields: string[] = [];
  if (!checkin && !_fm) missingFields.push("checkin");
  if (!checkout && !_fm) missingFields.push("checkout");
  if (!guests) missingFields.push("guests");
  return {
    checkin, checkout, guests, offeredPrice: null, questions,
    intent: (checkin && checkout) || _fm ? "availability_check" : "general_inquiry",
    confidence: (checkin && checkout) || _fm ? "medium" : "low",
    missingFields, warnings: [],
    isFullMonth: _fm?.isFullMonth ?? false,
    fullMonthNum: _fm?.fullMonthNum ?? null,
    isPriceQuery: /quanto\s+costa|prezz[oi]/i.test(text) && !checkin && !checkout && !_fm,
    rawMetadata,
  };
}

// ── agentAvailability ─────────────────────────────────────────────────────────

const BOOKING_BLOCKING_STATUSES = new Set(["confirmed", "pending_payment", "manual_block"]);

function toDateUTC(isoDate: string): Date {
  return new Date(isoDate + "T00:00:00Z");
}

function nightsBetweenDates(a: string, b: string): number {
  return Math.round((toDateUTC(b).getTime() - toDateUTC(a).getTime()) / 86400000);
}

function rangesOverlap(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 < b2 && a2 > b1;
}

function checkAvailability(
  request: { aptId: string; checkin: string; checkout: string },
  bookings: Booking[],
  rules: { minNights?: number; bufferBeforeDays?: number; bufferAfterDays?: number } = {},
) {
  const { aptId, checkin, checkout } = request;
  const { minNights = 1, bufferBeforeDays = 0, bufferAfterDays = 0 } = rules;
  if (!aptId || !checkin || !checkout) {
    return { available: false, reason: "missing_fields", conflictingBooking: null, nights: 0, isAvailable: false };
  }
  const dIn = toDateUTC(checkin), dOut = toDateUTC(checkout);
  if (dOut <= dIn) {
    return { available: false, reason: "invalid_dates", conflictingBooking: null, nights: 0, isAvailable: false };
  }
  const nights = Math.round((dOut.getTime() - dIn.getTime()) / 86400000);
  if (nights < minNights) {
    return { available: false, reason: `min_nights_${minNights}`, conflictingBooking: null, nights, isAvailable: false };
  }
  const blocking = bookings.filter(
    (b) => b.apt === aptId && BOOKING_BLOCKING_STATUSES.has(b.status),
  );
  for (const b of blocking) {
    const bIn = bufferBeforeDays > 0
      ? (() => { const d = toDateUTC(b.checkin); d.setUTCDate(d.getUTCDate() - bufferBeforeDays); return d.toISOString().slice(0, 10); })()
      : b.checkin;
    const bOut = bufferAfterDays > 0
      ? (() => { const d = toDateUTC(b.checkout); d.setUTCDate(d.getUTCDate() + bufferAfterDays); return d.toISOString().slice(0, 10); })()
      : b.checkout;
    if (rangesOverlap(checkin, checkout, bIn, bOut)) {
      return { available: false, reason: "conflict", conflictingBooking: b, nights, isAvailable: false };
    }
  }
  return { available: true, reason: null, conflictingBooking: null, nights, isAvailable: true };
}

// ── agentStayRules ────────────────────────────────────────────────────────────

const PEAK_MONTHS_SET = new Set(EDGE_PEAK_MONTHS);
const VALID_NIGHTS_LIST = EDGE_VALID_NIGHTS;

function weekdayUTC(isoDate: string): number {
  return new Date(isoDate + "T12:00:00Z").getUTCDay();
}

function addDaysTo(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthOfDate(isoDate: string): number {
  return parseInt(isoDate.slice(5, 7), 10);
}

function checkStayRules(
  checkin: string | null,
  checkout: string | null,
  opts: { isFullMonth?: boolean; fullMonthNum?: number | null } = {},
) {
  const { isFullMonth = false } = opts;
  if (isFullMonth) {
    return { needsRules: true, valid: true, reason: "full_month_to_evaluate", nights: null, isFullMonth: true, suggestedValidRanges: [] };
  }
  if (!checkin || !checkout) {
    return { needsRules: false, valid: false, reason: "dates_missing", nights: null, isFullMonth: false, suggestedValidRanges: [] };
  }
  const month = monthOfDate(checkin);
  const nights = nightsBetweenDates(checkin, checkout);
  if (!PEAK_MONTHS_SET.has(month)) {
    return { needsRules: false, valid: true, reason: null, nights, isFullMonth: false, suggestedValidRanges: [] };
  }
  const ciSat = weekdayUTC(checkin) === 6;
  const coSat = weekdayUTC(checkout) === 6;
  const okN = VALID_NIGHTS_LIST.includes(nights);
  if (ciSat && coSat && okN) {
    return { needsRules: true, valid: true, reason: null, nights, isFullMonth: false, suggestedValidRanges: [] };
  }
  const reasons: string[] = [];
  if (!ciSat) reasons.push("checkin_not_saturday");
  if (!coSat) reasons.push("checkout_not_saturday");
  if (!okN) reasons.push("invalid_length");
  return { needsRules: true, valid: false, reason: reasons.join("+"), nights, isFullMonth: false, suggestedValidRanges: [] };
}

// ── agentSeasonalRates ────────────────────────────────────────────────────────

const SEASONAL_RATES = EDGE_SEASONAL_RATES;

function getSubitoSeasonalPrice(opts: {
  checkin: string | null;
  checkout: string | null;
  isFullMonth?: boolean;
  fullMonthNum?: number | null;
}) {
  const { checkin, checkout, isFullMonth = false, fullMonthNum = null } = opts;
  if (isFullMonth && fullMonthNum) {
    const rates = SEASONAL_RATES[fullMonthNum];
    if (!rates) return { totalPrice: null, weeklyRate: null, monthRate: null, weeks: null, pricingType: "unknown", reason: "month_not_in_season" };
    return { totalPrice: rates.monthly, weeklyRate: rates.weekly, monthRate: rates.monthly, weeks: null, pricingType: "full_month", reason: null };
  }
  if (!checkin || !checkout) {
    return { totalPrice: null, weeklyRate: null, monthRate: null, weeks: null, pricingType: "unknown", reason: "dates_missing" };
  }
  const nights = nightsBetweenDates(checkin, checkout);
  if (nights % 7 !== 0) return { totalPrice: null, weeklyRate: null, monthRate: null, weeks: null, pricingType: "unknown", reason: "nights_not_multiple_of_7" };
  const weeks = nights / 7;
  if (weeks < 1 || weeks > 3) return { totalPrice: null, weeklyRate: null, monthRate: null, weeks, pricingType: "unknown", reason: "weeks_out_of_range" };
  const month = monthOfDate(checkin);
  const rates = SEASONAL_RATES[month];
  if (!rates) return { totalPrice: null, weeklyRate: null, monthRate: null, weeks, pricingType: "unknown", reason: "month_not_in_season" };
  return {
    totalPrice: rates.weekly * weeks,
    weeklyRate: rates.weekly,
    monthRate: rates.monthly,
    weeks,
    pricingType: weeks === 1 ? "weekly" : "multi_week",
    reason: null,
  };
}

// ── agentAlternatives (simplified) ───────────────────────────────────────────

function nextSatOnOrAfter(isoDate: string): string {
  const wd = weekdayUTC(isoDate);
  return addDaysTo(isoDate, wd === 6 ? 0 : (6 - wd + 7) % 7);
}

function makeAlt(
  aptId: string, aptLabel: string, checkin: string, checkout: string, nights: number, bookings: Booking[],
) {
  const avail = checkAvailability({ aptId, checkin, checkout }, bookings, { minNights: 7 });
  if (!avail.available) return null;
  const pricing = getSubitoSeasonalPrice({ checkin, checkout });
  return { checkin, checkout, nights, aptId, aptLabel, pricing };
}

function findWindowsInMonth(opts: {
  aptId: string; aptLabel: string; month: number; nights: number;
  bookings: Booking[]; year: number; position?: string | null; maxTotal?: number;
}) {
  const { aptId, aptLabel, month, nights, bookings = [], year, position = null, maxTotal = 3 } = opts;
  if (!aptId || !month || !VALID_NIGHTS_LIST.includes(nights)) return [];
  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  let d = nextSatOnOrAfter(monthStart);
  const candidates: string[] = [];
  while (monthOfDate(d) === month) { candidates.push(d); d = addDaysTo(d, 7); }
  if (candidates.length === 0) return [];
  let ordered = candidates;
  if (position === "last" || position === "last_two") ordered = [...candidates].reverse();
  else if (position === "second") ordered = candidates.slice(1);
  else if (position === "third") ordered = candidates.slice(2);
  const results: ReturnType<typeof makeAlt>[] = [];
  for (const sat of ordered) {
    if (results.length >= maxTotal) break;
    const checkout = addDaysTo(sat, nights);
    const alt = makeAlt(aptId, aptLabel, sat, checkout, nights, bookings);
    if (alt) results.push(alt);
  }
  return results;
}

function findAlternatives(opts: {
  aptId: string; requestedCheckin: string | null; requestedCheckout: string | null;
  isFullMonth?: boolean; apartments?: Apartment[]; bookings?: Booking[]; maxTotal?: number;
}) {
  const { aptId, requestedCheckin, requestedCheckout, isFullMonth = false, apartments = [], bookings = [], maxTotal = 3 } = opts;
  if (!aptId || !requestedCheckin || !requestedCheckout || isFullMonth) return [];
  const results: ReturnType<typeof makeAlt>[] = [];
  const reqNights = nightsBetweenDates(requestedCheckin, requestedCheckout);
  const isPeak = PEAK_MONTHS_SET.has(monthOfDate(requestedCheckin));
  const mainApt = apartments.find((a) => a.id === aptId);
  const otherApts = apartments.filter((a) => a.id !== aptId && a.id !== "all");
  const isNonStandard = reqNights % 7 !== 0;

  // Other apts, same period — only for standard durations AND sat-sat aligned in peak months.
  // Proposing the same non-sat-sat dates on another apt violates stay rules on both apts.
  const checkinIsSat = weekdayUTC(requestedCheckin) === 6;
  if (!isNonStandard && (!isPeak || checkinIsSat)) {
    for (const apt of otherApts) {
      if (results.length >= maxTotal) break;
      const avail = checkAvailability({ aptId: apt.id, checkin: requestedCheckin, checkout: requestedCheckout }, bookings, { minNights: 1 });
      if (avail.available) {
        const pricing = getSubitoSeasonalPrice({ checkin: requestedCheckin, checkout: requestedCheckout });
        results.push({ checkin: requestedCheckin, checkout: requestedCheckout, nights: reqNights, aptId: apt.id, aptLabel: apt.label, pricing });
      }
    }
  }

  // Same apt, sat-sat nearby windows (peak or non-standard)
  const searchNights = isNonStandard ? 7 : reqNights;
  if ((isPeak || isNonStandard) && results.length < maxTotal) {
    const sat = nextSatOnOrAfter(requestedCheckin);
    for (const nights of VALID_NIGHTS_LIST) {
      if (results.length >= maxTotal) break;
      const alt = makeAlt(aptId, mainApt?.label ?? "", sat, addDaysTo(sat, nights), nights, bookings);
      if (alt) results.push(alt);
    }
    // Try next Saturday too
    const sat2 = addDaysTo(sat, 7);
    for (const nights of [searchNights]) {
      if (results.length >= maxTotal) break;
      const alt = makeAlt(aptId, mainApt?.label ?? "", sat2, addDaysTo(sat2, nights), nights, bookings);
      if (alt) results.push(alt);
    }
  }
  return results.slice(0, maxTotal);
}

// ── buildAgentContext (adapted for Edge Function — no formData, no UI state) ──

function inferYearForMonth(month: number): number {
  const now = new Date();
  const cur = now.getMonth() + 1;
  return month < cur ? now.getFullYear() + 1 : now.getFullYear();
}

function resolveAptRules(aptId: string, source: string, aptRules: AptRule[]) {
  return (
    aptRules.find((r) => r.apt_id === aptId && r.source === source) ??
    aptRules.find((r) => r.apt_id === aptId && r.source === "default") ??
    {}
  ) as AptRule;
}

function decideType(ctx: {
  inquiry: ReturnType<typeof parseAgentInquiry>;
  availability: ReturnType<typeof checkAvailability>;
  stayRules: ReturnType<typeof checkStayRules>;
  pricing: ReturnType<typeof getSubitoSeasonalPrice>;
  alternatives: { count: number };
  fullMonthAvailability: ReturnType<typeof checkAvailability> | null;
}): string {
  const { inquiry, availability, stayRules, pricing, alternatives, fullMonthAvailability } = ctx;
  if (inquiry.isFullMonth) return pricing.totalPrice == null ? "needs_info" : "full_month";
  if (!inquiry.checkin || !inquiry.checkout) return "needs_info";
  if (stayRules.needsRules && !stayRules.valid) return "outside_rules";
  if (!availability.available) return alternatives.count > 0 ? "has_alternatives" : "unavailable";
  if (!inquiry.guests) return "needs_info";
  if (pricing.totalPrice === null) {
    if (inquiry.checkin && inquiry.checkout && pricing.reason === "nights_not_multiple_of_7") return "outside_rules";
    return "needs_info";
  }
  if (inquiry.offeredPrice !== null && typeof inquiry.offeredPrice === "number" && inquiry.offeredPrice < (pricing.totalPrice as number)) {
    return "price_negotiation";
  }
  return "available";
}

function buildAgentContext(opts: {
  aptId: string;
  source: string;
  rawText: string;
  rawMetadata: Record<string, unknown>;
  apartments: Apartment[];
  bookings: Booking[];
  aptRules: AptRule[];
}): AgentContext {
  const { aptId, source, rawText, rawMetadata, apartments, bookings, aptRules } = opts;
  const parsed = parseAgentInquiry(rawText, rawMetadata);

  const checkin = parsed.checkin;
  const checkout = parsed.checkout;
  const guests = parsed.guests;
  const isFullMonth = parsed.isFullMonth;
  const fullMonthNum = parsed.fullMonthNum;

  const effectiveMissingFields = [
    ...(!checkin && !isFullMonth ? ["checkin"] : []),
    ...(!checkout && !isFullMonth ? ["checkout"] : []),
    ...(!guests ? ["guests"] : []),
  ];

  const VALID_NIGHTS_SET = new Set(EDGE_VALID_NIGHTS);
  let monthWindows = null;
  if (!isFullMonth && !checkin && !checkout && parsed.requestedMonth && parsed.requestedNights && VALID_NIGHTS_SET.has(parsed.requestedNights)) {
    const apt = apartments.find((a) => a.id === aptId);
    monthWindows = findWindowsInMonth({
      aptId, aptLabel: apt?.label ?? "", month: parsed.requestedMonth,
      nights: parsed.requestedNights, bookings, year: inferYearForMonth(parsed.requestedMonth),
      position: parsed.requestedWeekPosition ?? null, maxTotal: 3,
    });
  }

  const inquiry = {
    rawText, aptId, source, checkin, checkout, guests,
    offeredPrice: parsed.offeredPrice, isFullMonth, fullMonthNum,
    missingFields: effectiveMissingFields, warnings: parsed.warnings,
    requestedMonth: parsed.requestedMonth, requestedNights: parsed.requestedNights,
    isFlexibleDatesRequest: parsed.isFlexibleDatesRequest, monthWindows,
    isPriceQuery: parsed.isPriceQuery, questions: parsed.questions,
  };

  const apt = apartments.find((a) => a.id === aptId);
  const apartment = { id: apt?.id ?? aptId, label: apt?.label ?? aptId };

  const rules = resolveAptRules(aptId, source, aptRules);
  let availability = { available: false, isAvailable: false, reason: "dates_missing", conflictingBooking: null, nights: null as number | null };

  if (checkin && checkout) {
    const avail = checkAvailability({ aptId, checkin, checkout }, bookings, {
      minNights: rules.min_nights ?? 1,
      bufferBeforeDays: rules.buffer_before_days ?? 0,
      bufferAfterDays: rules.buffer_after_days ?? 0,
    });
    availability = { ...avail, isAvailable: avail.available };
  }

  let fullMonthAvailability = null;
  let fullMonthWeekWindows = null;
  if (isFullMonth && fullMonthNum && aptId) {
    const fmYear = inferYearForMonth(fullMonthNum);
    const mm = String(fullMonthNum).padStart(2, "0");
    const fmStart = `${fmYear}-${mm}-01`;
    const nextNum = fullMonthNum === 12 ? 1 : fullMonthNum + 1;
    const nextYear = fullMonthNum === 12 ? fmYear + 1 : fmYear;
    const fmEnd = `${nextYear}-${String(nextNum).padStart(2, "0")}-01`;
    const fmAvail = checkAvailability({ aptId, checkin: fmStart, checkout: fmEnd }, bookings, { minNights: 1 });
    fullMonthAvailability = { isAvailable: fmAvail.available, conflictingBooking: fmAvail.conflictingBooking, checkin: fmStart, checkout: fmEnd };
    if (!fmAvail.available) {
      const fmApt = apartments.find((a) => a.id === aptId);
      fullMonthWeekWindows = findWindowsInMonth({ aptId, aptLabel: fmApt?.label ?? "", month: fullMonthNum, nights: 7, bookings, year: fmYear, maxTotal: 4 });
    }
  }

  const sr = checkStayRules(checkin, checkout, { isFullMonth, fullMonthNum });
  const stayRules = { valid: sr.valid, needsRules: sr.needsRules, reason: sr.reason, nights: sr.nights, isFullMonth: sr.isFullMonth, suggestedValidRanges: sr.suggestedValidRanges };

  const sp = getSubitoSeasonalPrice({ checkin, checkout, isFullMonth, fullMonthNum });
  const pricing = { totalPrice: sp.totalPrice, weeklyRate: sp.weeklyRate, monthRate: sp.monthRate, weeks: sp.weeks, pricingType: sp.pricingType, reason: sp.reason };

  const altList = findAlternatives({ aptId, requestedCheckin: checkin, requestedCheckout: checkout, isFullMonth, apartments, bookings });
  const alternatives = { items: altList, count: altList.length };

  // aptId not resolved → cannot produce a valid reply; bypass decideType entirely
  const decision = { type: !aptId ? "manual_review" : decideType({ inquiry: parsed, availability, stayRules, pricing, alternatives, fullMonthAvailability }) };

  const warnings = [
    ...(parsed.warnings ?? []),
    ...(stayRules.needsRules && !stayRules.valid ? [`stay_rules: ${stayRules.reason}`] : []),
    ...(pricing.reason ? [`pricing: ${pricing.reason}`] : []),
  ];

  return { inquiry, apartment, availability, fullMonthAvailability, fullMonthWeekWindows, pricing, stayRules, alternatives, messageHistory: { previousMessages: [], isRepeatContact: false }, decision, warnings };
}

// ── generateGuestReply (fallback deterministico) ──────────────────────────────

const MONTH_NAMES_ARRAY = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function itDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${MONTH_NAMES_ARRAY[parseInt(m, 10) - 1]} ${y}`;
}

function itMonth(num: number): string {
  return num >= 1 && num <= 12 ? MONTH_NAMES_ARRAY[num - 1] : "—";
}

function generateGuestReply(context: AgentContext): string {
  const { inquiry, apartment, pricing, availability, alternatives, stayRules } = context;
  const type = context.decision.type;
  const checkin = inquiry.checkin as string | null;
  const checkout = inquiry.checkout as string | null;
  const nights = availability.nights;
  const aptLabel = apartment.label;

  if (type === "available") {
    const total = pricing.totalPrice != null ? `€${pricing.totalPrice}` : "(prezzo da confermare)";
    const weekly = pricing.weeklyRate != null ? ` (€${pricing.weeklyRate}/settimana)` : "";
    return `Salve,\ngrazie per la sua richiesta per ${aptLabel}!\n\nL'appartamento è disponibile dal ${itDate(checkin)} al ${itDate(checkout)} (${nights} notti).\n\n💶 Totale: ${total}${weekly}\n\nPer confermare la prenotazione le chiediamo di:\n– fornire i dati dei soggiornanti\n– versare un acconto\n\nRestiamo a disposizione.\nCordiali saluti`;
  }

  if (type === "unavailable") {
    return `Salve,\nla ringraziamo per l'interesse per ${aptLabel}.\nPurtroppo il periodo ${itDate(checkin)} – ${itDate(checkout)} non è disponibile.\n\nRestiamo a disposizione per altri periodi.\nCordiali saluti`;
  }

  if (type === "has_alternatives") {
    const alts = (alternatives.items as Array<{ checkin: string; checkout: string; nights: number; aptLabel?: string; pricing?: { totalPrice?: number } }>).slice(0, 3);
    const lines = alts.map((a) => {
      const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : "";
      const apt = a.aptLabel && a.aptLabel !== aptLabel ? ` — ${a.aptLabel}` : "";
      return `  📅 ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${apt}${price})`;
    });
    return `Salve,\nla ringraziamo per la sua richiesta.\nIl periodo ${itDate(checkin)} – ${itDate(checkout)} per ${aptLabel} purtroppo non è libero.\n\nAlternative disponibili:\n${lines.join("\n")}\n\nLe interessa una di queste soluzioni?\nCordiali saluti`;
  }

  if (type === "outside_rules") {
    return `Salve,\ngrazie per la sua richiesta.\nPer i mesi di giugno, luglio e agosto ospitiamo soggiorni da sabato a sabato, con durate di 7, 14 o 21 notti.\n\nPossiamo valutare insieme una soluzione adatta alle sue esigenze.\nCordiali saluti`;
  }

  if (type === "full_month") {
    const monthNum = inquiry.fullMonthNum as number | null;
    const monthName = monthNum ? itMonth(monthNum) : "il mese richiesto";
    const price = pricing.totalPrice != null ? `€${pricing.totalPrice}` : "(prezzo da definire)";
    return `Salve,\ngrazie per la sua richiesta per ${aptLabel}!\n\nIl mese intero di ${monthName} è disponibile. Il prezzo è ${price}.\n\nSe desidera procedere, scriveteci per definire insieme le date precise.\n\nRestiamo a disposizione.\nCordiali saluti`;
  }

  if (type === "price_query") {
    const monthly = pricing.monthRate != null ? `€${pricing.monthRate} mese intero` : null;
    const weekly = pricing.weeklyRate != null ? `€${pricing.weeklyRate}/settimana` : null;
    const priceLines = [weekly, monthly].filter(Boolean).join(" — ");
    return `Salve,\ni prezzi per ${aptLabel} sono: ${priceLines || "(da confermare)"}.\n\nPuò indicarci il periodo che preferisce e il numero di ospiti?\nVerificheremo subito la disponibilità sul calendario.\nCordiali saluti`;
  }

  if (type === "price_negotiation") {
    const total = pricing.totalPrice != null ? `€${pricing.totalPrice}` : "il prezzo di listino";
    return `Salve,\ngrazie per la sua proposta.\nPer il periodo ${itDate(checkin)} – ${itDate(checkout)} il prezzo è ${total}.\n\nPossiamo valutare la sua offerta: mi faccia sapere se vuole procedere.\nCordiali saluti`;
  }

  // needs_info / manual_review / default
  return `Salve,\ngrazie per averci contattato!\nPer verificare la disponibilità le chiediamo gentilmente di indicare:\n– data di arrivo\n– data di partenza\n– numero di ospiti\n\nRisponderemo al più presto.\nCordiali saluti`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(context: AgentContext, rawText: string): string {
  const { inquiry, apartment, availability, pricing, stayRules, alternatives, decision, fullMonthAvailability } = context;

  const checkin = inquiry.checkin as string | null;
  const checkout = inquiry.checkout as string | null;
  const nights = availability.nights;
  const guests = inquiry.guests;
  const isFullMonth = inquiry.isFullMonth as boolean;
  const fullMonthNum = inquiry.fullMonthNum as number | null;
  const monthWindows = inquiry.monthWindows as unknown[] | null;
  const isPriceQuery = inquiry.isPriceQuery as boolean;

  // Availability status line
  let availabilityStatus: string;
  if (isFullMonth && fullMonthAvailability) {
    availabilityStatus = fullMonthAvailability.isAvailable ? "DISPONIBILE (mese intero)" : "NON DISPONIBILE (mese intero — ci sono prenotazioni)";
  } else {
    availabilityStatus = availability.isAvailable ? "DISPONIBILE" : `NON DISPONIBILE${availability.reason ? ` (motivo: ${availability.reason})` : ""}`;
  }

  // Price block
  const priceLines: string[] = [];
  if (pricing.totalPrice != null) priceLines.push(`- Prezzo totale soggiorno: €${pricing.totalPrice}`);
  if (pricing.weeklyRate != null) priceLines.push(`- Tariffa settimanale: €${pricing.weeklyRate}`);
  if (pricing.monthRate != null) priceLines.push(`- Tariffa mensile: €${pricing.monthRate}`);
  if (priceLines.length === 0) priceLines.push("- Prezzo non calcolabile (informazioni insufficienti o periodo fuori stagione)");
  const priceBlock = priceLines.join("\n");

  // Alternatives block
  const altItems = alternatives.items as Array<{ checkin: string; checkout: string; nights: number; aptLabel?: string; pricing?: { totalPrice?: number } }>;
  let alternativesBlock = "";
  if (altItems.length > 0) {
    const lines = altItems.slice(0, 3).map((a) => {
      const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : "";
      const aptNote = a.aptLabel && a.aptLabel !== apartment.label ? ` (${a.aptLabel})` : "";
      return `  • ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${aptNote}${price})`;
    });
    alternativesBlock = `\nAlternative disponibili (calendario verificato — usa solo queste):\n${lines.join("\n")}`;
  }

  // Month windows block (for flexible requests like "una settimana di agosto")
  let monthWindowsBlock = "";
  if (monthWindows && (monthWindows as unknown[]).length > 0) {
    const items = monthWindows as Array<{ checkin: string; checkout: string; nights: number; pricing?: { totalPrice?: number } }>;
    const lines = items.slice(0, 3).map((w) => {
      const price = w.pricing?.totalPrice != null ? `, €${w.pricing.totalPrice}` : "";
      return `  • ${itDate(w.checkin)} – ${itDate(w.checkout)} (${w.nights} notti${price})`;
    });
    const monthName = (inquiry.requestedMonth as number | null) ? itMonth(inquiry.requestedMonth as number) : "il mese richiesto";
    monthWindowsBlock = `\nFinestre disponibili nel mese di ${monthName} (calendario verificato):\n${lines.join("\n")}`;
  }

  // Questions block
  const questions = inquiry.questions as string[];
  let questionsBlock = "";
  if (questions?.length > 0) {
    questionsBlock = `\nDomande specifiche dell'ospite a cui rispondere:\n${questions.map((q) => `  - ${q}`).join("\n")}`;
  }

  // Stay rules note
  let stayRulesNote = "";
  if (stayRules.needsRules && !stayRules.valid) {
    stayRulesNote = "\nNOTA REGOLE SOGGIORNO: il periodo richiesto non rispetta le regole (giu-ago: arrivo e partenza sabato, durate 7/14/21 notti). Spiegalo con cortesia e proponi le alternative.";
  }

  const DECISION_INSTRUCTIONS: Record<string, string> = {
    available: "Conferma la disponibilità e il prezzo. Chiedi i dati soggiornanti e l'acconto per confermare.",
    unavailable: "Comunica con dispiacere che il periodo non è disponibile. Se ci sono alternative, proponile.",
    has_alternatives: "Comunica che il periodo richiesto non è libero. Proponi le alternative disponibili elencate nei fatti verificati.",
    needs_info: "Chiedi le informazioni mancanti in modo cortese (date, ospiti). Non proporre prezzi se non hai le date.",
    outside_rules: "Spiega le regole del soggiorno (sab-sab, 7/14/21 notti in giu-ago). Proponi le date alternative disponibili.",
    full_month: "Rispondi alla richiesta di mese intero con disponibilità e prezzo mensile forniti.",
    price_query: "Fornisci i prezzi indicati nei fatti verificati. Invita a specificare le date per confermare la disponibilità.",
    price_negotiation: "Rispondi alla trattativa sul prezzo usando il prezzo totale calcolato. Il proprietario valuterà l'offerta.",
    manual_review: "Rispondi in modo cordiale che il proprietario risponderà entro 24 ore.",
  };

  const instruction = DECISION_INSTRUCTIONS[decision.type] ?? DECISION_INSTRUCTIONS.manual_review;

  void isPriceQuery; // declared for future conditional logic, not used in template yet

  return `Sei l'assistente virtuale di GestAffitti per gli appartamenti vacanza "Lungomare Senigallia" a Senigallia (AN).
Il tuo compito è scrivere una risposta professionale e cordiale in italiano per un potenziale ospite che ha contattato il proprietario su Subito.it.

## REGOLE FONDAMENTALI

1. Rispondi SEMPRE in italiano formale e cordiale.
2. NON inventare MAI prezzi, date, disponibilità, caparre o alternative.
   Usa ESCLUSIVAMENTE i valori forniti nella sezione "FATTI VERIFICATI".
3. Se un dato non è nei FATTI VERIFICATI, non menzionarlo.
4. Tono: professionale, caldo, orientato all'ospitalità. Non burocratico.
5. Lunghezza: massimo 150 parole. Rispondi in modo conciso e diretto.
6. Chiudi SEMPRE con "Restiamo a disposizione.\nCordiali saluti"
7. NON includere firma con nome, numero di telefono o email.
8. Non aggiungere emoji a meno che non siano già nel template.
9. Scrivi SOLO la risposta da inviare all'ospite — nessuna nota al proprietario.

## FATTI VERIFICATI

Tipo risposta richiesta: ${decision.type}
Istruzione specifica: ${instruction}

Appartamento: ${apartment.label || "non specificato"}
Nome ospite: ${inquiry.guestName || "non fornito"}

Date richieste:
- Check-in: ${checkin ? itDate(checkin) : "non specificato"}
- Check-out: ${checkout ? itDate(checkout) : "non specificato"}
- Notti: ${nights ?? "non applicabile"}
- Ospiti: ${guests ?? "non specificato"}
${isFullMonth && fullMonthNum ? `- Mese intero richiesto: ${itMonth(fullMonthNum)}` : ""}

Disponibilità (fonte: calendario reale): ${availabilityStatus}

Prezzi (USA SOLO QUESTI VALORI — non inventare altri):
${priceBlock}
${stayRulesNote}${alternativesBlock}${monthWindowsBlock}${questionsBlock}

## MESSAGGIO ORIGINALE DELL'OSPITE

"${rawText}"

## ISTRUZIONE FINALE

Scrivi SOLO la risposta da inviare all'ospite, pronta per essere copiata su Subito.it.`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANTHROPIC API CALL
// ═══════════════════════════════════════════════════════════════════════════

interface AnthropicResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAnthropicAPI(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<AnthropicResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 350,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text) throw new Error("Anthropic returned empty content");

    return {
      text: text.trim(),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKGROUND LLM UPGRADE
//  Eseguito DOPO che agent_decisions è già stato creato con la risposta
//  deterministica (fase sincrona). Tenta di aggiornare il testo con Claude.
//  Se EdgeRuntime.waitUntil non è disponibile o il processo viene killato,
//  la risposta deterministica rimane intatta — la pipeline non si rompe.
// ═══════════════════════════════════════════════════════════════════════════

async function upgradeTolLMReply(opts: {
  decisionId: string;
  context: AgentContext;
  rawText: string;
  anthropicApiKey: string;
  llmModel: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  inboxId: string;
  rawDecisionType: string;
  normalizedDecisionType: string;
}): Promise<void> {
  const { decisionId, context, rawText, anthropicApiKey, llmModel, supabaseUrl, serviceRoleKey, inboxId, rawDecisionType, normalizedDecisionType } = opts;

  console.log(`[llm-reply-generator] LLM upgrade started for decision ${decisionId}`);

  // Client fresco — non dipende dallo scope del main handler
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let llmText: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const systemPrompt = buildSystemPrompt(context, rawText);
    const userMessage = `Messaggio dell'ospite ricevuto su Subito.it:\n\n"${rawText}"\n\nGenera la risposta appropriata in italiano.`;
    const result = await callAnthropicAPI(systemPrompt, userMessage, anthropicApiKey, llmModel);
    llmText = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    console.log(`[llm-reply-generator] LLM OK for ${inboxId} — tokens: ${inputTokens}/${outputTokens}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[llm-reply-generator] LLM call failed for ${inboxId}: ${errMsg}`);
    // Risposta deterministica già salvata — nessun aggiornamento necessario
    return;
  }

  // UPDATE agent_decisions con testo Claude
  const { error: updateError } = await supabase
    .from("agent_decisions")
    .update({
      suggested_text: llmText,
      payload: {
        llm_failed: false,
        llm_model: llmModel,
        llm_prompt_tokens: inputTokens,
        llm_completion_tokens: outputTokens,
        stage: "llm_generated",
        raw_decision_type: rawDecisionType,
        normalized_decision_type: normalizedDecisionType,
        apt_id_resolved: context.apartment.id || null,
        context_snapshot: {
          decision_type: rawDecisionType,
          availability_status: context.availability.isAvailable,
          pricing_total: context.pricing.totalPrice,
          alternatives_count: context.alternatives.count,
        },
      },
    })
    .eq("id", decisionId);

  if (updateError) {
    console.error(`[llm-reply-generator] UPDATE error for decision ${decisionId}: ${updateError.message}`);
    return;
  }

  console.log(`[llm-reply-generator] LLM upgrade completed for decision ${decisionId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN HANDLER
//
//  Flusso in due fasi:
//  1. SINCRONA (prima del return 202):
//     auth → parse → fetch DB → buildContext → INSERT deterministico
//     Garantisce che agent_decisions esista SEMPRE, indipendentemente da
//     EdgeRuntime.waitUntil e dal piano Supabase.
//  2. BACKGROUND (dopo il return 202, opzionale):
//     chiama Anthropic → UPDATE suggested_text se risponde
//     Se il processo viene killato, la risposta deterministica rimane.
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Health check
  if (req.method === "GET") return json({ status: "ok", function: "llm-reply-generator" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Auth ────────────────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[llm-reply-generator] WEBHOOK_SECRET non configurato");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ── Env vars ────────────────────────────────────────────────────────────
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const llmModel = Deno.env.get("LLM_MODEL") ?? "claude-sonnet-4-6";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[llm-reply-generator] Supabase env vars mancanti");
    return json({ error: "Server misconfiguration" }, 500);
  }

  // ── Parse webhook payload ────────────────────────────────────────────────
  let payload: DatabaseWebhookPayload;
  try {
    const raw = await req.text();
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (payload.type !== "INSERT" || !payload.record) {
    return json({ result: "skipped", reason: "not_an_insert" }, 200);
  }

  const record = payload.record;
  const inboxId = record.id;
  const rawText = record.raw_text ?? "";
  const rawMetadata = record.raw_metadata ?? {};
  const source = record.source ?? "subito";

  if (!inboxId || !rawText) {
    return json({ error: "Missing inbox record fields" }, 400);
  }

  console.log(`[llm-reply-generator] Accepted inbox_id: ${inboxId}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ════════════════════════════════════════════════════════════════════════
  //  FASE SINCRONA — tutto avviene PRIMA del return 202.
  //  Stima tempi: 3 query DB parallele (~0.5-1s) + compute (~1ms) +
  //  INSERT (~0.2s) = ~1-1.5s totali, dentro il timeout pg_net di 5s.
  // ════════════════════════════════════════════════════════════════════════

  // 1. Idempotency guard
  const { data: existing } = await supabase
    .from("agent_decisions")
    .select("id")
    .eq("inbox_id", inboxId)
    .maybeSingle();

  if (existing) {
    console.log(`[llm-reply-generator] Skipped INSERT — decision already exists: ${existing.id}`);
    return json({ result: "accepted", inbox_id: inboxId }, 202);
  }

  // 2. Fetch dati dal DB (in parallelo)
  const [{ data: bookingsData }, { data: apartmentsData }, { data: aptRulesData }] =
    await Promise.all([
      supabase.from("bookings").select("id,apt,checkin,checkout,status"),
      supabase.from("apartments").select("id,label,color").eq("active", true).order("label"),
      supabase.from("agent_apt_rules").select("*"),
    ]);

  const bookings: Booking[] = (bookingsData ?? []).map((b) => ({
    id: b.id,
    apt: b.apt,
    checkin: b.checkin,
    checkout: b.checkout,
    status: b.status ?? "confirmed",
  }));
  const apartments: Apartment[] = (apartmentsData ?? []).filter((a) => a.id !== "all");
  const aptRules: AptRule[] = aptRulesData ?? [];

  // 3. Resolve apt_id
  const aptId = record.apt_id ||
    resolveListingFromTitle(extractListingTitle(rawMetadata), apartments) ||
    "";

  console.log(`[llm-reply-generator] apt_id resolved: ${aptId || "(unknown)"}`);

  // 4. Build context + risposta deterministica
  const context = buildAgentContext({ aptId, source, rawText, rawMetadata, apartments, bookings, aptRules });
  const rawDecisionType = context.decision.type;
  const deterministicText = generateGuestReply(context);

  // Il motore può produrre tipi logici non ammessi dal CHECK constraint DB
  // (es. "outside_rules", "full_month"). Si normalizzano verso "manual_review"
  // solo per il campo DB; il valore originale è conservato in payload.
  const ALLOWED_DECISION_TYPES = new Set([
    "available", "unavailable", "partially_available",
    "needs_info", "price_negotiation", "manual_review",
  ]);
  const normalizedDecisionType: string = ALLOWED_DECISION_TYPES.has(rawDecisionType)
    ? rawDecisionType
    : "manual_review";

  console.log(`[llm-reply-generator] decision_type: ${rawDecisionType} → DB: ${normalizedDecisionType} — inserting deterministic reply`);

  // 5. INSERT agent_decisions con risposta deterministica
  const { data: insertedDecision, error: insertError } = await supabase
    .from("agent_decisions")
    .insert({
      inbox_id: inboxId,
      decision_type: normalizedDecisionType,
      suggested_text: deterministicText,
      was_modified: false,
      response_text: null,
      decision_score: null,
      payload: {
        llm_failed: true,
        llm_model: null,
        llm_prompt_tokens: null,
        llm_completion_tokens: null,
        stage: "deterministic_created",
        raw_decision_type: rawDecisionType,
        normalized_decision_type: normalizedDecisionType,
        apt_id_resolved: aptId || null,
        context_snapshot: {
          decision_type: rawDecisionType,
          availability_status: context.availability.isAvailable,
          pricing_total: context.pricing.totalPrice,
          alternatives_count: context.alternatives.count,
        },
      },
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Race condition: altra invocazione ha già inserito
      console.log(`[llm-reply-generator] Race condition — decision already inserted for ${inboxId}`);
      return json({ result: "accepted", inbox_id: inboxId }, 202);
    }
    console.error(`[llm-reply-generator] INSERT error for ${inboxId}: ${insertError.message}`);
    return json({ result: "accepted", inbox_id: inboxId, warning: "decision_insert_failed" }, 202);
  }

  const decisionId: string | undefined = insertedDecision?.id;
  if (!decisionId) {
    console.error(`[llm-reply-generator] INSERT returned no id for ${inboxId}`);
    return json({ result: "accepted", inbox_id: inboxId }, 202);
  }
  console.log(`[llm-reply-generator] Deterministic decision saved: ${decisionId}`);

  // ════════════════════════════════════════════════════════════════════════
  //  FASE BACKGROUND — tenta upgrade LLM dopo il return 202.
  //  Se EdgeRuntime.waitUntil funziona, il testo Claude aggiorna il record.
  //  Se il processo viene killato, la risposta deterministica è già salvata.
  // ════════════════════════════════════════════════════════════════════════

  if (anthropicApiKey) {
    const bgPromise = upgradeTolLMReply({
      decisionId,
      context,
      rawText,
      anthropicApiKey,
      llmModel,
      supabaseUrl,
      serviceRoleKey,
      inboxId,
      rawDecisionType,
      normalizedDecisionType,
    }).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[llm-reply-generator] LLM upgrade failed for ${inboxId}: ${errMsg}`);
    });

    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(bgPromise);
  } else {
    console.warn("[llm-reply-generator] ANTHROPIC_API_KEY non configurata — LLM upgrade saltato");
  }

  return json({ result: "accepted", inbox_id: inboxId }, 202);
});
