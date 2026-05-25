/**
 * agentPricing.js — Pure pricing calculator for the Agent Decision Engine
 *
 * All functions are pure (no side-effects, no I/O).
 * Platform commission comes in as a parameter (from AGENT_PLATFORM_PROFILES)
 * so this module stays decoupled from constants.
 *
 * Currency: EUR, always rounded to 2 decimal places.
 *
 * ── Future: Occupancy Intelligence ──────────────────────────────────────────
 * The optional `marketContext` parameter is the entry point for dynamic,
 * occupancy-aware pricing. When implemented it will allow the engine to:
 *   • raise rates automatically during high-occupancy / scarce-availability periods
 *   • accept wider discounts when occupancy pressure is low
 *   • reason strategically about margin vs. booking conversion
 *
 * occupancyMultiplier is already present in the return object (currently 1.0)
 * so callers can display it and future logic can override it without breaking
 * any consumer of this function's output shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places. */
function eur(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Return the seasonal multiplier for a given checkin date.
 *
 * Season windows (inclusive):
 *   high    June 01 – August 31  → 1.0  (base = high season)
 *   medium  April–May, September → 0.80
 *   low     October – March      → 0.65
 *
 * @param {string} checkinDate  "YYYY-MM-DD"
 * @returns {{ season: string, multiplier: number }}
 */
function seasonMultiplier(checkinDate) {
  const month = parseInt(checkinDate.slice(5, 7), 10); // 1–12
  if (month >= 6 && month <= 8) return { season: "high",   multiplier: 1.00 };
  if (month >= 4 && month <= 5) return { season: "medium", multiplier: 0.80 };
  if (month === 9)               return { season: "medium", multiplier: 0.80 };
  return                                { season: "low",    multiplier: 0.65 };
}

/**
 * Derive an occupancy multiplier from marketContext.
 *
 * Currently returns 1.0 (no-op) for all inputs.
 * Future implementation will inspect:
 *   • marketContext.occupancyRate     – 0–1, fraction of apt-days already booked
 *   • marketContext.daysUntilCheckin  – urgency of the request
 *   • marketContext.competitorRate    – optional external market signal
 *
 * @param {object} marketContext
 * @returns {number}  multiplier (1.0 = no adjustment)
 */
function resolveOccupancyMultiplier(marketContext = {}) {
  // TODO (occupancy intelligence):
  //   if (marketContext.occupancyRate > 0.8) return 1.15;  // high demand → +15%
  //   if (marketContext.occupancyRate < 0.3) return 0.90;  // low demand  → -10%
  //   …
  void marketContext; // acknowledged, not yet used
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the full price breakdown for an inquiry.
 *
 * Price components:
 *   baseNightlyRate   – from apt rules (or a global default)
 *   seasonalRate      – baseNightlyRate × seasonMultiplier
 *   occupancyRate     – seasonalRate × occupancyMultiplier  (currently = seasonalRate)
 *   effectiveRate     – occupancyRate + extraGuestSurcharge
 *   grossRevenue      – effectiveRate × nights
 *   platformFee       – grossRevenue × (commissionPct / 100)
 *   netRevenue        – grossRevenue − platformFee    (owner receives this)
 *   cleaningFee       – fixed per-stay (from rules, default 0)
 *   totalGuestPrice   – grossRevenue + cleaningFee    (what the guest pays)
 *
 * @param {{
 *   checkin:        string,   – "YYYY-MM-DD"
 *   checkout:       string,   – "YYYY-MM-DD"
 *   nights:         number,   – pre-computed by checkAvailability
 *   guests?:        number,   – number of guests (default 2)
 * }} request
 *
 * @param {{
 *   baseNightlyRate:   number,   – nightly rate for this apartment (EUR)
 *   cleaningFee?:      number,   – flat cleaning fee per stay (default 0)
 *   extraGuestFee?:    number,   – additional EUR/night per guest above threshold (default 0)
 *   guestThreshold?:   number,   – guests included in base rate (default 2)
 * }} aptRules
 *
 * @param {number} commissionPct  – platform commission % (from AGENT_PLATFORM_PROFILES)
 *
 * @param {{
 *   occupancyRate?:     number,   – 0–1, fraction of period already booked (future)
 *   daysUntilCheckin?:  number,   – booking lead time in days (future)
 *   competitorRate?:    number,   – external market signal EUR/night (future)
 * }} marketContext  – optional; reserved for occupancy intelligence (currently no-op)
 *
 * @returns {{
 *   baseNightlyRate:    number,
 *   season:             string,
 *   seasonMultiplier:   number,
 *   occupancyMultiplier: number,  – always 1.0 until occupancy intelligence is active
 *   seasonalRate:       number,
 *   nights:             number,
 *   grossRevenue:       number,
 *   commissionPct:      number,
 *   platformFee:        number,
 *   netRevenue:         number,
 *   cleaningFee:        number,
 *   extraGuestFee:      number,
 *   totalGuestPrice:    number,
 *   pricePerNight:      number,   – totalGuestPrice / nights (for display)
 * }}
 */
export function calculatePrice(request, aptRules, commissionPct = 0, marketContext = {}) {
  const { checkin, nights, guests = 2 } = request;
  const {
    baseNightlyRate,
    cleaningFee    = 0,
    extraGuestFee  = 0,
    guestThreshold = 2,
  } = aptRules;

  // ── Seasonal adjustment ────────────────────────────────────────────────────
  const { season, multiplier: sMultiplier } = seasonMultiplier(checkin);
  const seasonalRate = eur(baseNightlyRate * sMultiplier);

  // ── Occupancy adjustment (future: dynamic revenue management) ──────────────
  const occupancyMultiplier = resolveOccupancyMultiplier(marketContext);
  const occupancyAdjustedRate = eur(seasonalRate * occupancyMultiplier);

  // ── Extra guest surcharge ──────────────────────────────────────────────────
  const extraGuests   = Math.max(0, guests - guestThreshold);
  const extraPerNight = eur(extraGuestFee * extraGuests);
  const effectiveRate = eur(occupancyAdjustedRate + extraPerNight);

  // ── Revenue split ──────────────────────────────────────────────────────────
  const grossRevenue = eur(effectiveRate * nights);
  const platformFee  = eur(grossRevenue * commissionPct / 100);
  const netRevenue   = eur(grossRevenue - platformFee);

  // ── Guest-facing total ─────────────────────────────────────────────────────
  const totalGuestPrice = eur(grossRevenue + cleaningFee);
  const pricePerNight   = nights > 0 ? eur(totalGuestPrice / nights) : 0;

  return {
    baseNightlyRate,
    season,
    seasonMultiplier:   sMultiplier,
    occupancyMultiplier,            // 1.0 until occupancy intelligence is active
    seasonalRate,
    nights,
    grossRevenue,
    commissionPct,
    platformFee,
    netRevenue,
    cleaningFee,
    extraGuestFee:    eur(extraPerNight * nights),
    totalGuestPrice,
    pricePerNight,
  };
}

/**
 * Evaluate a discount request from a guest.
 *
 * Returns a recommendation: accept / counter / reject — with reasoning.
 *
 * Future occupancy integration:
 *   When occupancyMultiplier < 1.0 (low-demand period), the engine could
 *   automatically widen maxDiscountPct to improve conversion.
 *   Pass pricing.occupancyMultiplier into negotiationRules for this.
 *
 * @param {number} offeredTotal      – guest's offered total (EUR)
 * @param {ReturnType<calculatePrice>} pricing  – from calculatePrice()
 * @param {{
 *   maxDiscountPct?: number,   – max % discount owner accepts (default 10)
 *   minNetTarget?:  number,   – absolute floor for netRevenue (default 0)
 * }} negotiationRules
 *
 * @returns {{
 *   recommendation:  "accept" | "counter" | "reject",
 *   discountPct:     number,
 *   counterOffer:    number | null,
 *   reason:          string,
 * }}
 */
export function evaluateDiscount(offeredTotal, pricing, negotiationRules = {}) {
  const { maxDiscountPct = 10, minNetTarget = 0 } = negotiationRules;

  const discountAmt = pricing.totalGuestPrice - offeredTotal;
  const discountPct = pricing.totalGuestPrice > 0
    ? Math.round((discountAmt / pricing.totalGuestPrice) * 100 * 10) / 10
    : 0;

  // What the owner would net at the offered price (after platform fee)
  const offeredNet = eur(offeredTotal * (1 - pricing.commissionPct / 100));

  if (discountPct <= 0) {
    return { recommendation: "accept", discountPct: 0, counterOffer: null, reason: "above_list_price" };
  }

  if (discountPct <= maxDiscountPct && offeredNet >= minNetTarget) {
    return { recommendation: "accept", discountPct, counterOffer: null, reason: "within_policy" };
  }

  if (offeredNet < minNetTarget) {
    // Counter-offer that exactly meets minNetTarget after platform fee
    const minGross = eur(minNetTarget / (1 - pricing.commissionPct / 100));
    const counter  = eur(minGross + pricing.cleaningFee);
    return { recommendation: "counter", discountPct, counterOffer: counter, reason: "below_min_net" };
  }

  // Discount is too large but net is acceptable → counter at max allowed discount
  const maxDiscountAmt = eur(pricing.totalGuestPrice * maxDiscountPct / 100);
  const counter = eur(pricing.totalGuestPrice - maxDiscountAmt);
  return { recommendation: "counter", discountPct, counterOffer: counter, reason: "exceeds_max_discount" };
}
