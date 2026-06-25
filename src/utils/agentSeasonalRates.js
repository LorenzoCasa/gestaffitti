import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

function nightsBetween(checkin, checkout) {
  const a = new Date(checkin + "T00:00:00Z");
  const b = new Date(checkout + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

function monthOf(isoDate) {
  return parseInt(isoDate.slice(5, 7), 10);
}

export function getSubitoSeasonalPrice(
  { checkin, checkout, isFullMonth = false, fullMonthNum = null },
  hostConfig = DEFAULT_HOST_CONFIG,
) {
  const RATES = hostConfig.seasonalRates;

  if (isFullMonth && fullMonthNum) {
    const rates = RATES[fullMonthNum];

    if (!rates) {
      return {
        totalPrice: null,
        weeklyRate: null,
        monthRate: null,
        weeks: null,
        month: fullMonthNum,
        pricingType: "unknown",
        reason: "month_not_in_season",
      };
    }

    return {
      totalPrice: rates.monthly,
      weeklyRate: rates.weekly,
      monthRate: rates.monthly,
      weeks: null,
      month: fullMonthNum,
      pricingType: "full_month",
      reason: null,
    };
  }

  if (!checkin || !checkout) {
    return {
      totalPrice: null,
      weeklyRate: null,
      monthRate: null,
      weeks: null,
      month: null,
      pricingType: "unknown",
      reason: "dates_missing",
    };
  }

  const nights = nightsBetween(checkin, checkout);

  if (nights % 7 !== 0) {
    return {
      totalPrice: null,
      weeklyRate: null,
      monthRate: null,
      weeks: null,
      month: null,
      pricingType: "unknown",
      reason: "nights_not_multiple_of_7",
    };
  }

  const weeks = nights / 7;

  if (weeks < 1 || weeks > 3) {
    return {
      totalPrice: null,
      weeklyRate: null,
      monthRate: null,
      weeks,
      month: null,
      pricingType: "unknown",
      reason: "weeks_out_of_range",
    };
  }

  const month = monthOf(checkin);
  const rates = RATES[month];

  if (!rates) {
    return {
      totalPrice: null,
      weeklyRate: null,
      monthRate: null,
      weeks,
      month,
      pricingType: "unknown",
      reason: "month_not_in_season",
    };
  }

  return {
    totalPrice: rates.weekly * weeks,
    weeklyRate: rates.weekly,
    monthRate: rates.monthly,
    weeks,
    month,
    pricingType: weeks === 1 ? "weekly" : "multi_week",
    reason: null,
  };
}
