import { parseAgentInquiry }      from './agentParser.js';
import { checkAvailability }       from './agentAvailability.js';
import { checkStayRules }          from './agentStayRules.js';
import { getSubitoSeasonalPrice }  from './agentSeasonalRates.js';
import { findAlternatives, findWindowsInMonth } from './agentAlternatives.js';
import { DEFAULT_HOST_CONFIG }     from '../config/hostConfig.js';

function inferYearForMonth(month) {
  const now = new Date();
  const cur = now.getMonth() + 1;
  return month < cur ? now.getFullYear() + 1 : now.getFullYear();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAptRules(aptId, source, aptRules) {
  return (
    aptRules.find(r => r.apt_id === aptId && r.source === source) ??
    aptRules.find(r => r.apt_id === aptId && r.source === 'default') ??
    {}
  );
}

function decideType({ inquiry, availability, stayRules, pricing, alternatives, fullMonthAvailability }) {
  // Apartment not recognized — cannot produce a valid reply
  if (!inquiry.aptId) return 'manual_review';
  // Full-month request: price + calendar check required
  if (inquiry.isFullMonth) {
    if (pricing.totalPrice == null) return 'needs_info';
    return 'full_month';
  }
  // Dates missing — cannot proceed
  if (!inquiry.checkin || !inquiry.checkout) {
    return 'needs_info';
  }
  // Outside stay rules (non sab-sab): report this regardless of guest count —
  // providing guests won't fix invalid dates, so asking for them first is unhelpful.
  if (stayRules.needsRules && !stayRules.valid) {
    return 'outside_rules';
  }
  // Calendar unavailable
  if (!availability.isAvailable) {
    return alternatives.count > 0 ? 'has_alternatives' : 'unavailable';
  }
  // Dates valid + available: NOW require guest count before showing price (#4)
  if (!inquiry.guests) {
    return 'needs_info';
  }
  if (pricing.totalPrice === null) {
    // Dates present but non-standard duration → propose sat-sat alternatives instead of asking again
    if (inquiry.checkin && inquiry.checkout && pricing.reason === 'nights_not_multiple_of_7') {
      return 'outside_rules';
    }
    return 'needs_info';
  }
  if (inquiry.offeredPrice !== null && inquiry.offeredPrice < pricing.totalPrice) {
    return 'price_negotiation';
  }
  return 'available';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a structured AgentContext from raw inputs.
 * Pure function — no side effects, no async, no DB calls.
 *
 * @param {{
 *   rawText?:    string,
 *   rawMetadata?: object,
 *   formData?:   object,      – form fields (win over parser)
 *   apartments?: Array,
 *   bookings?:   Array,
 *   aptRules?:   Array,
 *   decisions?:  Array,
 *   inbox?:      Array,
 * }} input
 *
 * @returns {AgentContext}
 */
export function buildAgentContext({
  rawText    = '',
  rawMetadata = {},
  formData   = {},
  apartments  = [],
  bookings    = [],
  aptRules    = [],
  decisions   = [],
  inbox       = [],
  hostConfig  = DEFAULT_HOST_CONFIG,
} = {}) {
  const realApts = apartments.filter(a => a.id !== 'all');

  // 1. Parse raw text
  const parsed = parseAgentInquiry(rawText, rawMetadata);

  // 2. Merge: formData fields win, parser fills gaps
  const aptId        = formData.aptId       || '';
  const source       = formData.source      || rawMetadata?.source || 'subito';
  const checkin      = formData.checkin     || parsed.checkin    || null;
  const checkout     = formData.checkout    || parsed.checkout   || null;
  const guests       = Number(formData.guests) || parsed.guests  || null;
  // Treat "" same as null so an empty price field never triggers price_negotiation
  const rawOffered   = formData.offeredPrice;
  const offeredPrice = (rawOffered !== '' && rawOffered != null) ? rawOffered : (parsed.offeredPrice ?? null);
  const isFullMonth  = formData.isFullMonth  || parsed.isFullMonth  || false;
  const fullMonthNum = formData.fullMonthNum || parsed.fullMonthNum || null;

  // Flexible period fields from parser (only populated when no specific dates found)
  const requestedMonth        = parsed.requestedMonth        ?? null;
  const requestedNights       = parsed.requestedNights       ?? null;
  const requestedWeekPosition = parsed.requestedWeekPosition ?? null;
  const isFlexibleDatesRequest = parsed.isFlexibleDatesRequest ?? false;

  // Missing fields: dates not required for full-month requests
  const effectiveMissingFields = [
    ...(!checkin  && !isFullMonth ? ['checkin']  : []),
    ...(!checkout && !isFullMonth ? ['checkout'] : []),
    ...(!guests                   ? ['guests']   : []),
  ];

  // Calendar-verified windows in the requested month (null = not searched)
  const VALID_NIGHTS_SET = new Set([7, 14, 21]);
  let monthWindows = null;
  if (isFlexibleDatesRequest && aptId && requestedMonth && requestedNights && VALID_NIGHTS_SET.has(requestedNights)) {
    const apt = realApts.find(a => a.id === aptId);
    monthWindows = findWindowsInMonth({
      aptId,
      aptLabel:  apt?.label ?? '',
      month:     requestedMonth,
      nights:    requestedNights,
      bookings,
      year:      inferYearForMonth(requestedMonth),
      position:  requestedWeekPosition,
      maxTotal:  3,
    }, hostConfig);
  }

  const inquiry = {
    rawText,
    aptId,
    source,
    checkin,
    checkout,
    guests,
    offeredPrice,
    isFullMonth,
    fullMonthNum,
    missingFields: effectiveMissingFields,
    warnings:      parsed.warnings ?? [],
    // Flexible period (new, non-breaking)
    requestedMonth,
    requestedNights,
    requestedWeekPosition,
    isFlexibleDatesRequest,
    monthWindows,
  };

  // 3. Apartment info
  const apt = realApts.find(a => a.id === aptId);
  const apartment = {
    id:    apt?.id    ?? aptId,
    name:  apt?.name  ?? apt?.label ?? aptId,
    label: apt?.label ?? apt?.name  ?? aptId,
    color: apt?.color ?? null,
  };

  // 4. Availability — calendar is source of truth
  const rules = resolveAptRules(aptId, source, aptRules);
  let availability = {
    isAvailable:        false,
    conflictingBooking: null,
    nights:             null,
    reason:             'dates_missing',
  };
  if (checkin && checkout) {
    const avail = checkAvailability(
      { aptId, checkin, checkout },
      bookings,
      {
        minNights:        rules.min_nights         ?? 1,
        bufferBeforeDays: rules.buffer_before_days ?? 0,
        bufferAfterDays:  rules.buffer_after_days  ?? 0,
      },
    );
    availability = {
      isAvailable:        avail.available,
      conflictingBooking: avail.conflictingBooking ?? null,
      nights:             avail.nights,
      reason:             avail.reason,
    };
  }

  // 4b. Full-month calendar check — "tutto agosto" must verify the calendar too.
  // Uses a virtual range [first day of month, first day of next month) to detect
  // any booking that would block the entire month.
  let fullMonthAvailability = null;
  let fullMonthWeekWindows  = null;
  if (isFullMonth && fullMonthNum && aptId) {
    const fmYear  = inferYearForMonth(fullMonthNum);
    const mm      = String(fullMonthNum).padStart(2, '0');
    const fmStart = `${fmYear}-${mm}-01`;
    const nextNum  = fullMonthNum === 12 ? 1 : fullMonthNum + 1;
    const nextYear = fullMonthNum === 12 ? fmYear + 1 : fmYear;
    const fmEnd   = `${nextYear}-${String(nextNum).padStart(2, '0')}-01`;
    const fmAvail = checkAvailability(
      { aptId, checkin: fmStart, checkout: fmEnd },
      bookings,
      { minNights: 1, bufferBeforeDays: 0, bufferAfterDays: 0 },
    );
    fullMonthAvailability = {
      isAvailable:        fmAvail.available,
      conflictingBooking: fmAvail.conflictingBooking ?? null,
      checkin:            fmStart,
      checkout:           fmEnd,
    };
    // If month is occupied, pre-compute available week-windows as fallback
    if (!fmAvail.available) {
      const fmApt = realApts.find(a => a.id === aptId);
      fullMonthWeekWindows = findWindowsInMonth({
        aptId,
        aptLabel: fmApt?.label ?? '',
        month:    fullMonthNum,
        nights:   7,
        bookings,
        year:     fmYear,
        maxTotal: 4,
      }, hostConfig);
    }
  }

  // 5. Stay rules
  const sr = checkStayRules(checkin, checkout, { isFullMonth, fullMonthNum }, hostConfig);
  const stayRules = {
    valid:                sr.valid,
    needsRules:           sr.needsRules,
    reason:               sr.reason,
    nights:               sr.nights,
    isFullMonth:          sr.isFullMonth,
    suggestedValidRanges: sr.suggestedValidRanges ?? [],
  };

  // 6. Seasonal pricing
  const sp = getSubitoSeasonalPrice({ checkin, checkout, isFullMonth, fullMonthNum }, hostConfig);
  const pricing = {
    totalPrice:  sp.totalPrice,
    weeklyRate:  sp.weeklyRate,
    monthRate:   sp.monthRate,
    weeks:       sp.weeks,
    pricingType: sp.pricingType,
    reason:      sp.reason,
  };

  // 7. Alternatives (calendar-verified)
  const altList = findAlternatives({
    aptId,
    requestedCheckin:  checkin,
    requestedCheckout: checkout,
    isFullMonth,
    apartments: realApts,
    bookings,
  }, hostConfig);
  const alternatives = { items: altList, count: altList.length };

  // 8. Message history from inbox (same apartment)
  const previousMessages = inbox
    .filter(m => m.apt_id === aptId)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 5);
  const messageHistory = {
    previousMessages,
    isRepeatContact: previousMessages.length > 0,
  };

  // 9. Decision type (deterministic — never LLM)
  const decision = {
    type: decideType({ inquiry, availability, stayRules, pricing, alternatives, fullMonthAvailability }),
  };

  // 10. Aggregate warnings
  const warnings = [
    ...(inquiry.warnings ?? []),
    ...(stayRules.needsRules && !stayRules.valid ? [`stay_rules: ${stayRules.reason}`] : []),
    ...(pricing.reason ? [`pricing: ${pricing.reason}`] : []),
    ...(fullMonthAvailability && !fullMonthAvailability.isAvailable ? ['full_month_occupied'] : []),
  ];

  return {
    inquiry,
    apartment,
    availability,
    fullMonthAvailability,
    fullMonthWeekWindows,
    pricing,
    stayRules,
    alternatives,
    messageHistory,
    decision,
    warnings,
    sources: {
      calendar:     true,
      pricing:      true,
      stayRules:    true,
      alternatives: true,
    },
  };
}
