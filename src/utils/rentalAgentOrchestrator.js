import { parseAgentInquiry }      from './agentParser.js';
import { runDecisionEngine }       from './agentDecisionEngine.js';
import { checkStayRules }          from './agentStayRules.js';
import { getSubitoSeasonalPrice }  from './agentSeasonalRates.js';
import { findAlternatives }        from './agentAlternatives.js';
import { buildSubitoResponse }     from './agentResponseBuilder.js';
import { AGENT_PLATFORM_PROFILES } from '../constants.js';
import { DEFAULT_HOST_CONFIG }     from '../config/hostConfig.js';

// ── Engine rules ───────────────────────────────────────────────────────────────

const FALLBACK_RULES = {
  baseNightlyRate:  80, cleaningFee: 0, extraGuestFee: 0, guestThreshold: 2,
  deposit: 0, minNights: 1, bufferBeforeDays: 0, bufferAfterDays: 0,
  maxDiscountPct: 10, minNetTarget: 0,
};

function agentRuleToEngineRules(rule) {
  return {
    baseNightlyRate:  rule.base_nightly_rate,
    cleaningFee:      rule.cleaning_fee       ?? 0,
    extraGuestFee:    rule.extra_guest_fee     ?? 0,
    guestThreshold:   rule.guest_threshold     ?? 2,
    deposit:          rule.deposit_amount      ?? 0,
    minNights:        rule.min_nights          ?? 1,
    bufferBeforeDays: rule.buffer_before_days  ?? 0,
    bufferAfterDays:  rule.buffer_after_days   ?? 0,
    maxDiscountPct:   rule.max_discount_pct    ?? 10,
    minNetTarget:     rule.min_net_target      ?? 0,
  };
}

function resolveAptRules(aptId, source, aptRules) {
  const specific = aptRules.find(r => r.apt_id === aptId && r.source === source);
  if (specific) return agentRuleToEngineRules(specific);
  const dflt = aptRules.find(r => r.apt_id === aptId && r.source === 'default');
  if (dflt) return agentRuleToEngineRules(dflt);
  return { ...FALLBACK_RULES };
}

// ── Main orchestrator ──────────────────────────────────────────────────────────

/**
 * Run the full rental agent pipeline.
 * Pure function: no side effects, no async, no DB calls.
 *
 * @param {{
 *   rawText:    string,
 *   rawMetadata: object,
 *   formData:   object,
 *   apartments: Array<{id:string, label:string}>,
 *   bookings:   Array,
 *   aptRules:   Array,
 * }} input
 *
 * @returns {{
 *   normalizedFormData,
 *   parsedFromRaw,
 *   parsedForResponse,
 *   engineResult,
 *   stayRuleResult,
 *   seasonalPrice,
 *   availabilityResult,
 *   alternatives,
 *   subitoResponse,
 *   finalDecision,
 * }}
 */
export function runRentalAgent({ rawText, rawMetadata, formData, apartments, bookings, aptRules, hostConfig = DEFAULT_HOST_CONFIG }) {
  // 1. Parse raw text
  const parsedFromRaw = parseAgentInquiry(rawText ?? '', rawMetadata ?? {});

  // 2. Normalize: form fields win, parser fills gaps
  const normalizedFormData = {
    ...formData,
    checkin:      formData.checkin      || parsedFromRaw.checkin      || '',
    checkout:     formData.checkout     || parsedFromRaw.checkout     || '',
    guests:       Number(formData.guests) || parsedFromRaw.guests     || null,
    offeredPrice: formData.offeredPrice  ?? parsedFromRaw.offeredPrice ?? null,
    isFullMonth:  formData.isFullMonth   || parsedFromRaw.isFullMonth  || false,
    fullMonthNum: formData.fullMonthNum  || parsedFromRaw.fullMonthNum || null,
  };

  // 3. Engine rules + commission
  const engineRules   = resolveAptRules(normalizedFormData.aptId, normalizedFormData.source, aptRules);
  const profile       = AGENT_PLATFORM_PROFILES[normalizedFormData.source] ?? AGENT_PLATFORM_PROFILES.altro;
  const commissionPct = profile.commissionPct ?? 0;

  // 4. Decision engine (availability + pricing from calendar)
  const inquiry = {
    aptId:        normalizedFormData.aptId,
    guestName:    'ospite',
    checkin:      normalizedFormData.checkin      || null,
    checkout:     normalizedFormData.checkout     || null,
    guests:       normalizedFormData.guests,
    offeredPrice: normalizedFormData.offeredPrice,
    source:       normalizedFormData.source,
  };
  const engineResult = runDecisionEngine(inquiry, bookings, engineRules, commissionPct);

  // 5. Structured parsed data for response builder
  const parsedForResponse = {
    checkin:       normalizedFormData.checkin      || null,
    checkout:      normalizedFormData.checkout     || null,
    guests:        normalizedFormData.guests       || null,
    offeredPrice:  normalizedFormData.offeredPrice ?? null,
    isFullMonth:   normalizedFormData.isFullMonth  ?? false,
    fullMonthNum:  normalizedFormData.fullMonthNum ?? null,
    missingFields: parsedFromRaw.missingFields ?? [],
    warnings:      parsedFromRaw.warnings     ?? [],
  };

  // 6. Stay rules (sabato-sabato, peak season)
  const stayRuleResult = checkStayRules(
    parsedForResponse.checkin,
    parsedForResponse.checkout,
    { isFullMonth: parsedForResponse.isFullMonth, fullMonthNum: parsedForResponse.fullMonthNum },
    hostConfig,
  );

  // 7. Seasonal pricing
  const seasonalPrice = getSubitoSeasonalPrice({
    checkin:      parsedForResponse.checkin,
    checkout:     parsedForResponse.checkout,
    isFullMonth:  parsedForResponse.isFullMonth,
    fullMonthNum: parsedForResponse.fullMonthNum,
  }, hostConfig);

  // 8. Enrich sat-sat suggestions with pricing
  const enrichedStayRuleResult = {
    ...stayRuleResult,
    suggestedValidRanges: stayRuleResult.suggestedValidRanges.map(r => ({
      ...r,
      pricing: getSubitoSeasonalPrice({ checkin: r.checkin, checkout: r.checkout, isFullMonth: false, fullMonthNum: null }, hostConfig),
    })),
  };

  // 9. Calendar availability
  const availabilityResult = engineResult.payload?.avail ?? null;

  // 10. Calendar-verified alternatives
  const alternatives = findAlternatives({
    aptId:             normalizedFormData.aptId,
    requestedCheckin:  parsedForResponse.checkin,
    requestedCheckout: parsedForResponse.checkout,
    isFullMonth:       parsedForResponse.isFullMonth,
    apartments,
    bookings,
  }, hostConfig);

  // 11. Subito response (text + type)
  const apartmentLabel = apartments.find(a => a.id === normalizedFormData.aptId)?.label ?? '';
  const subitoResponse = buildSubitoResponse({
    parsed:             parsedForResponse,
    stayRuleResult:     enrichedStayRuleResult,
    seasonalPrice,
    apartmentLabel,
    availabilityResult,
    alternatives,
  });

  // 12. Final decision merges engine result with Subito response
  const finalDecision = {
    ...engineResult,
    responseText: subitoResponse.responseText || engineResult.responseText,
    payload: {
      ...engineResult.payload,
      parsed:         parsedForResponse,
      stayRuleResult: enrichedStayRuleResult,
      seasonalPrice,
      subitoResponse,
      alternatives,
    },
    requiresOwnerApproval: true,
  };

  return {
    normalizedFormData,
    parsedFromRaw,
    parsedForResponse,
    engineResult,
    stayRuleResult:     enrichedStayRuleResult,
    seasonalPrice,
    availabilityResult,
    alternatives,
    subitoResponse,
    finalDecision,
  };
}
