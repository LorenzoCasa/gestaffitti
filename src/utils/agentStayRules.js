import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

function weekdayUTC(isoDate) {
  return new Date(isoDate + "T12:00:00Z").getUTCDay();
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(checkin, checkout) {
  const a = new Date(checkin  + "T00:00:00Z");
  const b = new Date(checkout + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

function nextSaturdayOnOrAfter(isoDate) {
  const wd = weekdayUTC(isoDate);
  const delta = wd === 6 ? 0 : (6 - wd + 7) % 7;
  return addDays(isoDate, delta);
}

function monthOf(isoDate) {
  return parseInt(isoDate.slice(5, 7), 10);
}

function fmtDate(isoDate) {
  const [, m, d] = isoDate.split("-");
  return d + "/" + m;
}

function buildSuggestions(anchorCheckin, validNights) {
  const satStart = nextSaturdayOnOrAfter(anchorCheckin);
  return validNights.map(n => {
    const co = addDays(satStart, n);
    return {
      checkin:  satStart,
      checkout: co,
      nights:   n,
      label:    fmtDate(satStart) + " -> " + fmtDate(co) + " (" + n + " notti)",
    };
  });
}

export function checkStayRules(
  checkin,
  checkout,
  { isFullMonth = false, fullMonthNum = null } = {},
  hostConfig = DEFAULT_HOST_CONFIG,
) {
  const { peakMonths, validNights, checkInDayOfWeek = 6 } = hostConfig.stayRules;
  const PEAK_MONTHS = new Set(peakMonths);

  if (isFullMonth) {
    return {
      needsRules:           true,
      valid:                true,
      reason:               "full_month_to_evaluate",
      nights:               null,
      isFullMonth:          true,
      suggestedValidRanges: [],
    };
  }

  if (!checkin || !checkout) {
    return {
      needsRules:           false,
      valid:                false,
      reason:               "dates_missing",
      nights:               null,
      isFullMonth:          false,
      suggestedValidRanges: [],
    };
  }

  const month  = monthOf(checkin);
  const nights = nightsBetween(checkin, checkout);

  if (!PEAK_MONTHS.has(month)) {
    return {
      needsRules:           false,
      valid:                true,
      reason:               null,
      nights,
      isFullMonth:          false,
      suggestedValidRanges: [],
    };
  }

  const ciSat = weekdayUTC(checkin)  === checkInDayOfWeek;
  const coSat = weekdayUTC(checkout) === checkInDayOfWeek;
  const okN   = validNights.includes(nights);

  if (ciSat && coSat && okN) {
    return {
      needsRules:           true,
      valid:                true,
      reason:               null,
      nights,
      isFullMonth:          false,
      suggestedValidRanges: [],
    };
  }

  const reasons = [];
  if (!ciSat) reasons.push("checkin_not_saturday");
  if (!coSat) reasons.push("checkout_not_saturday");
  if (!okN)   reasons.push("invalid_length");

  return {
    needsRules:           true,
    valid:                false,
    reason:               reasons.join("+"),
    nights,
    isFullMonth:          false,
    suggestedValidRanges: buildSuggestions(checkin, validNights),
  };
}
