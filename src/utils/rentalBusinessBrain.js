/**
 * rentalBusinessBrain.js — GestAffitti Rental Business Brain v1
 *
 * Pure utility functions for rental business domain reasoning.
 * No I/O, no side effects, no async, no external dependencies.
 *
 * Exports:
 *   getRentalPricingRules()
 *   estimateStayPrice(period, pricingRules)
 *   analyzeFreeSlots(bookings, apartments, pricingRules, today)
 *   analyzeRevenueOpportunities(freeSlots, pricingRules)
 *   draftSubitoPromotion(slot, pricingRules, apartment)
 *   buildRevenueSummary(bookings, pricingRules, today)
 *   buildDerivedSignals(bookings, apartments, pricingRules, today)
 */

// ── Date helpers ──────────────────────────────────────────────────────────────

function nightsBetween(from, to) {
  return Math.round(
    (new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000,
  );
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function getSeasonWindow(today) {
  const year  = parseInt(today.slice(0, 4), 10);
  const month = parseInt(today.slice(5, 7), 10);
  const seasonYear = month > 9 ? year + 1 : year;
  return {
    start: `${seasonYear}-06-01`,
    end:   `${seasonYear}-09-30`,
    year:  seasonYear,
  };
}

const ACTIVE_STATUSES = new Set(["confirmed", "pending_payment"]);

const MONTH_NAMES = { 6: "giugno", 7: "luglio", 8: "agosto", 9: "settembre" };

// ── Pricing rules ─────────────────────────────────────────────────────────────

/**
 * Returns the canonical GestAffitti pricing rules.
 * Source of truth: CLAUDE.md section "Current Pricing Rules".
 */
export function getRentalPricingRules() {
  return {
    source:   "gestaffitti_internal",
    currency: "EUR",
    stay_rules: {
      preferred_pattern:      "saturday_to_saturday",
      valid_durations_nights: [7, 14, 21],
      full_month_eligible:    true,
      september_flexible:     true,
    },
    seasonal_rates: {
      6: { month: "giugno",    weekly: 500,  monthly: 1600, season: "shoulder" },
      7: { month: "luglio",    weekly: 800,  monthly: 2600, season: "peak"     },
      8: { month: "agosto",    weekly: 800,  monthly: 2600, season: "peak"     },
      9: { month: "settembre", weekly: 500,  monthly: 1500, season: "shoulder" },
    },
    non_standard_handling: {
      description: "Soggiorni non multipli di 7 notti: prezzo base da confermare",
      rule: "Usa tariffa settimanale del mese come base. Notti extra a tariffa giornaliera (weeklyRate/7). Proponi come 'Consiglio da confermare', non come dato ufficiale.",
      example_8_nights_august: "8 notti agosto: 800€/sett. + 1 notte (~114€) ≈ 900–950€ → proporre come stima da confermare",
    },
  };
}

// ── Price estimation ──────────────────────────────────────────────────────────

/**
 * Estimate stay price from dates and official pricing rules.
 *
 * @param {{ checkin?, checkout?, isFullMonth?, fullMonthNum? }} period
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 * @returns {{
 *   totalPrice: number|null,
 *   weeklyRate: number|null,
 *   monthlyRate?: number,
 *   nights: number|null,
 *   weeks: number|null,
 *   extraNights?: number,
 *   nightlyRateEstimate?: number,
 *   month?: number,
 *   season?: string,
 *   pricingType: string,
 *   isStandard: boolean,
 *   needsConfirmation: boolean,
 *   notes: string[],
 * }}
 */
export function estimateStayPrice(period, pricingRules) {
  const { checkin, checkout, isFullMonth = false, fullMonthNum = null } = period ?? {};
  const rates = pricingRules?.seasonal_rates ?? {};

  if (isFullMonth && fullMonthNum != null) {
    const r = rates[fullMonthNum];
    if (!r) {
      return { totalPrice: null, weeklyRate: null, nights: null, weeks: null, pricingType: "unknown", isStandard: false, needsConfirmation: true, notes: ["month_not_in_season"] };
    }
    return {
      totalPrice:   r.monthly,
      weeklyRate:   r.weekly,
      monthlyRate:  r.monthly,
      nights:       null,
      weeks:        null,
      month:        fullMonthNum,
      season:       r.season,
      pricingType:  "full_month",
      isStandard:   true,
      needsConfirmation: false,
      notes:        [],
    };
  }

  if (!checkin || !checkout) {
    return { totalPrice: null, weeklyRate: null, nights: null, weeks: null, pricingType: "unknown", isStandard: false, needsConfirmation: true, notes: ["dates_missing"] };
  }

  const nights = nightsBetween(checkin, checkout);
  if (nights <= 0) {
    return { totalPrice: null, weeklyRate: null, nights, weeks: null, pricingType: "unknown", isStandard: false, needsConfirmation: true, notes: ["invalid_dates"] };
  }

  const month = parseInt(checkin.slice(5, 7), 10);
  const r     = rates[month];
  if (!r) {
    return { totalPrice: null, weeklyRate: null, nights, weeks: 0, month, pricingType: "unknown", isStandard: false, needsConfirmation: true, notes: ["month_not_in_season"] };
  }

  const weeks      = Math.floor(nights / 7);
  const extraNights = nights % 7;
  const isStandard = extraNights === 0 && weeks >= 1 && weeks <= 3;

  if (isStandard) {
    return {
      totalPrice:        r.weekly * weeks,
      weeklyRate:        r.weekly,
      nights,
      weeks,
      month,
      season:            r.season,
      pricingType:       weeks === 1 ? "weekly" : "multi_week",
      isStandard:        true,
      needsConfirmation: false,
      notes:             [],
    };
  }

  // Non-standard (e.g. 8 nights = 1 week + 1 extra)
  const basePrice          = r.weekly * Math.max(weeks, 0);
  const nightlyRateEstimate = Math.round(r.weekly / 7);
  const estimatedExtra     = nightlyRateEstimate * extraNights;
  const estimatedTotal     = basePrice + estimatedExtra;

  const noteLabel = weeks > 0
    ? `${weeks}w_plus_${extraNights}_extra`
    : `${extraNights}_nights_only`;

  return {
    totalPrice:           estimatedTotal,
    weeklyRate:           r.weekly,
    nights,
    weeks,
    extraNights,
    nightlyRateEstimate,
    estimatedExtra,
    month,
    season:               r.season,
    pricingType:          "non_standard",
    isStandard:           false,
    needsConfirmation:    true,
    notes:                [`non_standard_${nights}_nights`, noteLabel],
  };
}

// ── Free slots ────────────────────────────────────────────────────────────────

function computeUrgency(slotStart, today) {
  const days = nightsBetween(today, slotStart);
  if (days < 0)  return "past";
  if (days <= 14) return "high";
  if (days <= 45) return "medium";
  return "low";
}

/**
 * Find all free periods (≥ 7 nights) within the current season for each apartment.
 *
 * @param {Array} bookings
 * @param {Array} apartments
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 * @param {string} today  "YYYY-MM-DD"
 * @returns {Array<{
 *   aptId, aptLabel, start, end, nights, weeks, standardWeeks,
 *   month, season, estimatedValue, weeklyRate, urgencyLevel, daysUntilStart
 * }>}
 */
export function analyzeFreeSlots(bookings, apartments, pricingRules, today) {
  const season = getSeasonWindow(today);
  const rates  = pricingRules?.seasonal_rates ?? {};
  const apts   = (apartments ?? []).filter(a => a.id !== "all");

  const result = [];

  for (const apt of apts) {
    const aptBookings = (bookings ?? [])
      .filter(b =>
        (b.apt === apt.id || b.apt_id === apt.id) &&
        ACTIVE_STATUSES.has(b.status ?? "confirmed") &&
        b.checkout > season.start &&
        b.checkin  < season.end,
      )
      .sort((a, b) => a.checkin.localeCompare(b.checkin));

    // Start cursor from today (if inside season) or from season start
    const cursorInit = season.start > today ? season.start : today;

    let cursor = cursorInit;

    for (const booking of aptBookings) {
      const bStart = booking.checkin  < cursorInit  ? cursorInit  : booking.checkin;
      const bEnd   = booking.checkout > season.end  ? season.end  : booking.checkout;

      if (bStart > cursor) {
        pushSlot(result, apt, cursor, bStart, rates, today);
      }
      if (bEnd > cursor) cursor = bEnd;
    }

    // Gap after all bookings
    if (cursor < season.end) {
      pushSlot(result, apt, cursor, season.end, rates, today);
    }
  }

  return result.sort((a, b) => a.daysUntilStart - b.daysUntilStart);
}

function pushSlot(result, apt, start, end, rates, today) {
  const nights = nightsBetween(start, end);
  if (nights < 7) return;

  const month = parseInt(start.slice(5, 7), 10);
  const r     = rates[month];
  const weeks = Math.floor(nights / 7);

  result.push({
    aptId:          apt.id,
    aptLabel:       apt.label ?? apt.id,
    start,
    end,
    nights,
    weeks,
    standardWeeks:  nights % 7 === 0,
    month,
    season:         r?.season ?? "unknown",
    estimatedValue: r != null ? r.weekly * weeks : null,
    weeklyRate:     r?.weekly ?? null,
    urgencyLevel:   computeUrgency(start, today),
    daysUntilStart: Math.max(0, nightsBetween(today, start)),
  });
}

// ── Revenue opportunities ─────────────────────────────────────────────────────

/**
 * Rank free slots by economic urgency.
 *
 * @param {ReturnType<analyzeFreeSlots>} freeSlots
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 */
export function analyzeRevenueOpportunities(freeSlots, pricingRules) {
  void pricingRules;
  if (!freeSlots?.length) return { total: 0, opportunities: [], maxRevenueLoss: 0 };

  const opportunities = freeSlots.map(slot => {
    const isPeak       = slot.season === "peak";
    const urgScore     = slot.urgencyLevel === "high" ? 3 : slot.urgencyLevel === "medium" ? 2 : 1;
    const priorityScore = (isPeak ? 2 : 1) * urgScore;
    const action       = slot.daysUntilStart <= 14
      ? "pubblica_annuncio_urgente"
      : slot.daysUntilStart <= 45
      ? "prepara_annuncio"
      : "pianifica_campagna";
    return { ...slot, isPeak, priorityScore, action };
  });

  opportunities.sort((a, b) => b.priorityScore - a.priorityScore);

  const maxRevenueLoss = freeSlots.reduce((s, sl) => s + (sl.estimatedValue ?? 0), 0);

  return { total: opportunities.length, opportunities, maxRevenueLoss };
}

// ── Subito promotion draft ────────────────────────────────────────────────────

/**
 * Generate a draft Subito promotion text for a free slot.
 * Pure function — no LLM call.
 *
 * @param {object|null} slot
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 * @param {{ label?: string }|null} apartment
 * @returns {{ title, body, fullText, slot, priceLabel, seasonLabel, dateRange }|null}
 */
export function draftSubitoPromotion(slot, pricingRules, apartment) {
  void pricingRules;
  if (!slot) return null;

  const aptLabel   = apartment?.label ?? slot.aptLabel ?? "Appartamento";
  const weeksLabel = slot.weeks === 1 ? "1 settimana" : `${slot.weeks} settimane`;
  const priceLabel = slot.estimatedValue != null ? `€${slot.estimatedValue}` : "prezzo da confermare";
  const seasonLabel = slot.season === "peak" ? "alta stagione" : "mezza stagione";

  const monthName   = MONTH_NAMES[slot.month] ?? "stagione";
  const endMonth    = parseInt(slot.end.slice(5, 7), 10);
  const startDay    = parseInt(slot.start.slice(8, 10), 10);
  const endDay      = parseInt(slot.end.slice(8, 10), 10);

  const dateRange = slot.month === endMonth
    ? `${startDay}–${endDay} ${monthName}`
    : `${startDay} ${monthName} – ${endDay} ${MONTH_NAMES[endMonth] ?? ""}`;

  const seasonEmoji = slot.season === "peak" ? "🌞" : "🌤";
  const title = `🏖 ${aptLabel} — ${dateRange} ${seasonEmoji} ${weeksLabel} disponibile`;

  const body = [
    `📅 Periodo: ${dateRange} (${slot.nights} notti / ${weeksLabel})`,
    `💶 Prezzo: ${priceLabel} — ${seasonLabel}`,
    `📍 Lungomare Senigallia, Spiaggia di Velluto`,
    ``,
    `Appartamento ${aptLabel} disponibile per ${weeksLabel} in ${monthName}.`,
    `Ideale per famiglie. Posizione vicino mare, zona lungomare.`,
    ``,
    `📩 Scrivi per info e disponibilità. Risposta rapida garantita.`,
  ].join("\n");

  return { title, body, fullText: `${title}\n\n${body}`, slot, priceLabel, seasonLabel, dateRange };
}

// ── Revenue summary ───────────────────────────────────────────────────────────

/**
 * Build a structured revenue summary from confirmed bookings.
 *
 * @param {Array} bookings
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 * @param {string} today  "YYYY-MM-DD"
 */
export function buildRevenueSummary(bookings, pricingRules, today) {
  const next30  = addDays(today, 30);
  const season  = getSeasonWindow(today);
  const yearStr = today.slice(0, 4);

  const activeBookings = (bookings ?? []).filter(b => ACTIVE_STATUSES.has(b.status ?? "confirmed"));
  const pastBookings   = (bookings ?? []).filter(b => b.checkout <= today && b.checkin >= `${yearStr}-01-01`);

  const earnedRevenue = pastBookings.reduce((s, b) => s + Number(b.price ?? 0), 0);

  const upcomingRevenue30 = activeBookings
    .filter(b => b.checkin >= today && b.checkin <= next30)
    .reduce((s, b) => s + Number(b.price ?? 0), 0);

  const seasonRevenue = activeBookings
    .filter(b => b.checkin >= season.start && b.checkin <= season.end)
    .reduce((s, b) => s + Number(b.price ?? 0), 0);

  const depositsPaid = activeBookings
    .filter(b => !!(b.deposit_paid ?? b.depositPaid))
    .reduce((s, b) => s + Number(b.deposit ?? 0), 0);

  const depositsPending = activeBookings
    .filter(b => !(b.deposit_paid ?? b.depositPaid) && b.checkin >= today)
    .reduce((s, b) => s + Number(b.deposit ?? 0), 0);

  const balancesPending = activeBookings
    .filter(b => !!(b.deposit_paid ?? b.depositPaid) && b.checkin >= today)
    .reduce((s, b) => s + Math.max(0, Number(b.price ?? 0) - Number(b.deposit ?? 0)), 0);

  const currentMonth  = parseInt(today.slice(5, 7), 10);
  const currentSeason = pricingRules?.seasonal_rates?.[currentMonth]?.season ?? "off_season";

  return {
    earnedRevenue,
    upcomingRevenue30,
    seasonRevenue,
    depositsPaid,
    depositsPending,
    balancesPending,
    activeBookingsCount: activeBookings.filter(b => b.checkout >= today).length,
    seasonYear:   season.year,
    seasonStart:  season.start,
    seasonEnd:    season.end,
    currentSeason,
    hasData:      (bookings ?? []).length > 0,
    _note: "Dato certo dal gestionale. Non include prenotazioni non confermate.",
  };
}

// ── Derived signals ───────────────────────────────────────────────────────────

/**
 * Assemble all derived signals for the LLM context.
 * All values are deterministic — Claude may reason on top but cannot override.
 *
 * @param {Array} bookings
 * @param {Array} apartments
 * @param {ReturnType<getRentalPricingRules>} pricingRules
 * @param {string} today
 */
export function buildDerivedSignals(bookings, apartments, pricingRules, today) {
  const freeSlots            = analyzeFreeSlots(bookings, apartments, pricingRules, today);
  const revenueOpportunities = analyzeRevenueOpportunities(freeSlots, pricingRules);
  const revenueSummary       = buildRevenueSummary(bookings, pricingRules, today);
  const season               = getSeasonWindow(today);
  const currentMonth         = parseInt(today.slice(5, 7), 10);
  const currentRate          = pricingRules?.seasonal_rates?.[currentMonth];

  const daysToSeasonStart = Math.max(0, nightsBetween(today, season.start));

  const seasonSignals = {
    currentMonth,
    seasonYear:         season.year,
    seasonStart:        season.start,
    seasonEnd:          season.end,
    isInSeason:         currentMonth >= 6 && currentMonth <= 9,
    currentSeason:      currentRate?.season ?? "off_season",
    isPeak:             currentRate?.season === "peak",
    weeklyRate:         currentRate?.weekly ?? null,
    daysToSeasonStart,
  };

  const priorityAlerts = revenueOpportunities.opportunities
    .filter(o => o.urgencyLevel === "high")
    .slice(0, 3)
    .map(opp => ({
      type:     "revenue_opportunity",
      severity: "high",
      message:  `Slot libero urgente: ${opp.aptLabel} ${opp.start}→${opp.end} (${opp.nights}n, stima €${opp.estimatedValue ?? "?"})`,
      value:    opp.estimatedValue ?? 0,
    }));

  // Occupancy per apartment for the season
  const apts   = (apartments ?? []).filter(a => a.id !== "all");
  const seasonNights = nightsBetween(season.start, season.end);

  const occupancyByApt = {};
  for (const apt of apts) {
    const bookedNights = (bookings ?? [])
      .filter(b =>
        (b.apt === apt.id || b.apt_id === apt.id) &&
        ACTIVE_STATUSES.has(b.status ?? "confirmed") &&
        b.checkout > season.start &&
        b.checkin  < season.end,
      )
      .reduce((s, b) => {
        const bStart = b.checkin  < season.start ? season.start : b.checkin;
        const bEnd   = b.checkout > season.end   ? season.end   : b.checkout;
        return s + Math.max(0, nightsBetween(bStart, bEnd));
      }, 0);

    occupancyByApt[apt.id] = {
      label:         apt.label ?? apt.id,
      bookedNights,
      seasonNights,
      occupancyRate: seasonNights > 0 ? Math.round((bookedNights / seasonNights) * 100) : 0,
    };
  }

  return {
    freeSlots,
    revenueSummary,
    openRevenueOpportunities: revenueOpportunities,
    occupancyByApt,
    seasonSignals,
    priorityAlerts,
  };
}
