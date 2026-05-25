/**
 * agentAvailability.js — Pure availability checker for the Agent Decision Engine
 *
 * All functions are pure (no side-effects, no I/O).
 * Receives pre-loaded bookings array from the caller.
 *
 * Date format: "YYYY-MM-DD" strings throughout (ISO 8601).
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Blocking statuses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Booking statuses that block availability.
 *
 * Kept as a named constant so future statuses (imported, …) can be added
 * here without touching any availability logic.
 *
 * Blocking:
 *   confirmed       – active booking
 *   pending_payment – hold while awaiting payment (calendar occupied)
 *   manual_block    – owner-created block (maintenance, personal use, etc.)
 *
 * NOT blocking:
 *   draft     – inquiry in progress, not confirmed
 *   cancelled – cancelled booking
 */
export const BOOKING_BLOCKING_STATUSES = new Set([
  "confirmed",
  "pending_payment",
  "manual_block",
]);

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an ISO date string to a Date object at midnight UTC.
 * @param {string} isoDate  "YYYY-MM-DD"
 * @returns {Date}
 */
function toDate(isoDate) {
  return new Date(isoDate + "T00:00:00Z");
}

/**
 * Add (or subtract) N days to an ISO date string.
 * @param {string} isoDate
 * @param {number} days  – may be negative
 * @returns {string}  "YYYY-MM-DD"
 */
function shiftDate(isoDate, days) {
  const d = toDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * True if two date ranges [a1, a2) and [b1, b2) overlap.
 * Uses checkout-exclusive convention: a guest checking out on day D
 * does NOT conflict with a guest checking in on day D.
 *
 * @param {string} a1  checkin  A
 * @param {string} a2  checkout A
 * @param {string} b1  checkin  B
 * @param {string} b2  checkout B
 * @returns {boolean}
 */
function rangesOverlap(a1, a2, b1, b2) {
  return a1 < b2 && a2 > b1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether an apartment is available for the requested period.
 *
 * @param {{
 *   aptId:    string,   – apartment ID to check
 *   checkin:  string,   – requested checkin  "YYYY-MM-DD"
 *   checkout: string,   – requested checkout "YYYY-MM-DD"
 * }} request
 *
 * @param {Array} bookings – full bookings array (from useSupabaseData)
 *   Each booking: { id, apt, checkin, checkout, status, guest, … }
 *
 * @param {{
 *   minNights?:         number,   – minimum stay (default 1)
 *   bufferBeforeDays?:  number,   – days to block BEFORE each existing booking (default 0)
 *   bufferAfterDays?:   number,   – days to block AFTER  each existing booking (default 0)
 * }} rules
 *
 * @returns {{
 *   available:              boolean,
 *   reason:                 string | null,   – null when available
 *   conflictingBooking:     object | null,   – first conflicting booking, if any
 *   nights:                 number,
 *   requestedCheckin:       string,
 *   requestedCheckout:      string,
 *   aptId:                  string,
 *   alternativeSuggestions: Array,           – populated by findFreeWindows when unavailable
 * }}
 */
export function checkAvailability(request, bookings, rules = {}) {
  const { aptId, checkin, checkout } = request;
  const { minNights = 1, bufferBeforeDays = 0, bufferAfterDays = 0 } = rules;

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!aptId || !checkin || !checkout) {
    return _result(false, "missing_fields", null, 0, request);
  }

  const dIn  = toDate(checkin);
  const dOut = toDate(checkout);

  if (dOut <= dIn) {
    return _result(false, "invalid_dates", null, 0, request);
  }

  const nights = Math.round((dOut - dIn) / (1000 * 60 * 60 * 24));

  if (nights < minNights) {
    return _result(false, `min_nights_${minNights}`, null, nights, request);
  }

  // ── Conflict check ─────────────────────────────────────────────────────────
  // Only bookings with a BLOCKING status occupy the calendar.
  const blockingBookings = bookings.filter(
    b => b.apt === aptId && BOOKING_BLOCKING_STATUSES.has(b.status)
  );

  for (const b of blockingBookings) {
    // Expand the blocked window by the configured buffer on each side
    const bufferedIn  = bufferBeforeDays > 0 ? shiftDate(b.checkin,  -bufferBeforeDays) : b.checkin;
    const bufferedOut = bufferAfterDays  > 0 ? shiftDate(b.checkout,  bufferAfterDays)  : b.checkout;

    if (rangesOverlap(checkin, checkout, bufferedIn, bufferedOut)) {
      return _result(false, "conflict", b, nights, request);
    }
  }

  return _result(true, null, null, nights, request);
}

/**
 * Return all free windows for an apartment between two dates.
 * Useful for suggesting alternative periods when the requested dates are busy.
 *
 * @param {string} aptId
 * @param {string} fromDate   "YYYY-MM-DD" – search window start
 * @param {string} untilDate  "YYYY-MM-DD" – search window end
 * @param {Array}  bookings
 * @param {{ minNights?: number }} rules
 * @returns {Array<{ checkin: string, checkout: string, nights: number }>}
 */
export function findFreeWindows(aptId, fromDate, untilDate, bookings, rules = {}) {
  const { minNights = 1 } = rules;

  const blockingInWindow = bookings
    .filter(b => b.apt === aptId && BOOKING_BLOCKING_STATUSES.has(b.status))
    .filter(b => b.checkout > fromDate && b.checkin < untilDate)
    .sort((a, b) => a.checkin.localeCompare(b.checkin));

  const windows = [];
  let cursor = fromDate;

  for (const b of blockingInWindow) {
    if (cursor < b.checkin) {
      const nights = Math.round(
        (toDate(b.checkin) - toDate(cursor)) / (1000 * 60 * 60 * 24)
      );
      if (nights >= minNights) {
        windows.push({ checkin: cursor, checkout: b.checkin, nights });
      }
    }
    // Advance cursor past this booking
    if (b.checkout > cursor) cursor = b.checkout;
  }

  // Trailing free window after the last blocking booking
  if (cursor < untilDate) {
    const nights = Math.round(
      (toDate(untilDate) - toDate(cursor)) / (1000 * 60 * 60 * 24)
    );
    if (nights >= minNights) {
      windows.push({ checkin: cursor, checkout: untilDate, nights });
    }
  }

  return windows;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Private result builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {boolean}      available
 * @param {string|null}  reason
 * @param {object|null}  conflictingBooking
 * @param {number}       nights
 * @param {object}       request
 * @returns {object}
 */
function _result(available, reason, conflictingBooking, nights, request) {
  return {
    available,
    reason,
    conflictingBooking,
    nights,
    requestedCheckin:       request.checkin  || null,
    requestedCheckout:      request.checkout || null,
    aptId:                  request.aptId    || null,
    alternativeSuggestions: [],   // populated by caller via findFreeWindows when !available
  };
}
