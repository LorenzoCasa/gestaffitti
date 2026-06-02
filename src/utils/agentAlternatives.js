import { checkAvailability } from './agentAvailability.js';
import { getSubitoSeasonalPrice } from './agentSeasonalRates.js';

const PEAK_MONTHS  = new Set([6, 7, 8]);
const VALID_NIGHTS = [7, 14, 21];
const MAX_OFFSET   = 30; // days

function weekdayUTC(iso) {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nts(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function monthOf(iso) { return parseInt(iso.slice(5, 7), 10); }

function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  return d + '/' + m;
}

function nextSatOnOrAfter(iso) {
  const wd = weekdayUTC(iso);
  return addDays(iso, wd === 6 ? 0 : (6 - wd + 7) % 7);
}

function prevSatOnOrBefore(iso) {
  let d = iso;
  for (let i = 0; i < 7; i++) {
    if (weekdayUTC(d) === 6) return d;
    d = addDays(d, -1);
  }
  return d;
}

// Saturday-to-Saturday candidate windows near requestedCheckin, sorted by proximity
function satCandidates(requestedCheckin, reqNights) {
  const anchors = [
    nextSatOnOrAfter(requestedCheckin),
    prevSatOnOrBefore(requestedCheckin),
    nextSatOnOrAfter(addDays(requestedCheckin, 7)),
    prevSatOnOrBefore(addDays(requestedCheckin, -7)),
  ];
  const seen = new Set();
  const all  = [];
  for (const anchor of anchors) {
    const offset = Math.abs(nts(anchor, requestedCheckin));
    if (offset > MAX_OFFSET) continue;
    const durations = [...VALID_NIGHTS].sort(
      (a, b) => Math.abs(a - reqNights) - Math.abs(b - reqNights)
    );
    for (const n of durations) {
      const co  = addDays(anchor, n);
      const key = anchor + '|' + co;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ checkin: anchor, checkout: co, nights: n, offset });
    }
  }
  all.sort((a, b) =>
    (a.offset + Math.abs(a.nights - reqNights) * 3) -
    (b.offset + Math.abs(b.nights - reqNights) * 3)
  );
  return all;
}

// Build one alternative — returns null if not available on calendar
function makeAlt(aptId, aptLabel, checkin, checkout, nights, bookings) {
  const avail = checkAvailability({ aptId, checkin, checkout }, bookings, { minNights: 7 });
  if (!avail.available) return null;
  const pricing = getSubitoSeasonalPrice({ checkin, checkout, isFullMonth: false, fullMonthNum: null });
  return {
    checkin, checkout, nights, aptId, aptLabel,
    pricing,
    label: fmtDate(checkin) + ' -> ' + fmtDate(checkout) + ' (' + nights + ' notti)',
  };
}

/**
 * Find up to maxTotal calendar-verified alternatives.
 *
 * Search order:
 * 1. Same apt — nearby sat-sat windows (before and after, within 30 days)
 * 2. Other apts — same requested period
 * 3. Other apts — nearby sat-sat windows
 *
 * Every alternative is verified via checkAvailability before being returned.
 *
 * @param {{
 *   aptId: string,
 *   requestedCheckin: string,
 *   requestedCheckout: string,
 *   isFullMonth?: boolean,
 *   apartments?: Array<{id:string, label:string}>,
 *   bookings?: Array,
 *   maxTotal?: number,
 * }} options
 * @returns {Array<{checkin, checkout, nights, aptId, aptLabel, pricing, label}>}
 */
export function findAlternatives({
  aptId,
  requestedCheckin,
  requestedCheckout,
  isFullMonth  = false,
  apartments   = [],
  bookings     = [],
  maxTotal     = 3,
}) {
  if (!requestedCheckin || !requestedCheckout || isFullMonth) return [];

  const results   = [];
  const reqNights = nts(requestedCheckin, requestedCheckout);
  const isPeak    = PEAK_MONTHS.has(monthOf(requestedCheckin));

  const mainApt   = apartments.find(a => a.id === aptId);
  const otherApts = apartments.filter(a => a.id !== aptId && a.id !== 'all');

  // 1. Other apts, same period (highest priority: same dates on a different apt)
  for (const apt of otherApts) {
    if (results.length >= maxTotal) break;
    const avail = checkAvailability(
      { aptId: apt.id, checkin: requestedCheckin, checkout: requestedCheckout },
      bookings, { minNights: 1 }
    );
    if (avail.available) {
      const pricing = getSubitoSeasonalPrice({
        checkin: requestedCheckin, checkout: requestedCheckout,
        isFullMonth: false, fullMonthNum: null,
      });
      results.push({
        checkin: requestedCheckin, checkout: requestedCheckout,
        nights: reqNights, aptId: apt.id, aptLabel: apt.label,
        pricing,
        label: fmtDate(requestedCheckin) + ' -> ' + fmtDate(requestedCheckout) +
          ' (' + reqNights + ' notti)',
      });
    }
  }

  // 2. Same apt, sat-sat windows (different dates, same apt)
  if (isPeak && results.length < maxTotal) {
    for (const c of satCandidates(requestedCheckin, reqNights)) {
      if (results.length >= maxTotal) break;
      const alt = makeAlt(aptId, mainApt?.label ?? '', c.checkin, c.checkout, c.nights, bookings);
      if (alt) results.push(alt);
    }
  }

  // 3. Other apts, sat-sat windows
  if (isPeak && results.length < maxTotal) {
    const cands = satCandidates(requestedCheckin, reqNights);
    for (const apt of otherApts) {
      for (const c of cands) {
        if (results.length >= maxTotal) break;
        const alt = makeAlt(apt.id, apt.label, c.checkin, c.checkout, c.nights, bookings);
        if (alt) results.push(alt);
      }
      if (results.length >= maxTotal) break;
    }
  }

  return results.slice(0, maxTotal);
}
