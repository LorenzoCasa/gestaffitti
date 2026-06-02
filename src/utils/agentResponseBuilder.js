const MONTH_NAMES = ["","gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre"];

function itDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  return parseInt(parts[2]) + " " + MONTH_NAMES[parseInt(parts[1])];
}

// Case: period valid + calendar free
function buildAvailableText(parsed, seasonalPrice) {
  const ci = itDate(parsed.checkin);
  const co = itDate(parsed.checkout);
  let priceText = "";
  if (seasonalPrice && seasonalPrice.totalPrice) {
    const weeks  = seasonalPrice.weeks;
    const wLabel = weeks === 1 ? "la settimana" : weeks + " settimane";
    priceText = "\nIl costo per " + wLabel + " e di " + seasonalPrice.totalPrice + " euro.";
  }
  return "Buongiorno, si, per il periodo dal " + ci + " al " + co +
    " l'appartamento risulta disponibile." +
    priceText +
    "\nSe vuole, posso fornirle tutte le informazioni per procedere.";
}

// Case: calendar says occupied
function buildUnavailableText(parsed, alternatives, requestedAptLabel) {
  const ci      = itDate(parsed.checkin);
  const co      = itDate(parsed.checkout);
  const aptName = requestedAptLabel || "l'appartamento";
  const alts    = alternatives || [];

  // Separate alternatives on the same apt (different dates) vs other apartments
  const sameAptAlts  = alts.filter(a => !a.aptLabel || a.aptLabel === requestedAptLabel);
  const otherAptAlts = alts.filter(a => a.aptLabel && a.aptLabel !== requestedAptLabel);

  let altBlock = "";
  if (sameAptAlts.length > 0) {
    const lines = sameAptAlts.map(a => {
      const priceStr = a.pricing && a.pricing.totalPrice ? " - " + a.pricing.totalPrice + " euro" : "";
      return "- dal " + itDate(a.checkin) + " al " + itDate(a.checkout) + " (" + a.nights + " notti)" + priceStr;
    });
    altBlock += "\nPer lo stesso appartamento ho queste date disponibili:\n" + lines.join("\n");
  }
  if (otherAptAlts.length > 0) {
    const lines = otherAptAlts.map(a => {
      const priceStr = a.pricing && a.pricing.totalPrice ? " - " + a.pricing.totalPrice + " euro" : "";
      return "- " + a.aptLabel + ": dal " + itDate(a.checkin) + " al " + itDate(a.checkout) + " (" + a.nights + " notti)" + priceStr;
    });
    altBlock += "\nIn alternativa, posso proporle un altro appartamento:\n" + lines.join("\n");
  }
  if (sameAptAlts.length > 0 || otherAptAlts.length > 0) {
    altBlock += "\nMi faccia sapere.";
  } else {
    altBlock = "\nSe mi indica altre date o un periodo piu flessibile, verifico volentieri la disponibilita.";
  }

  return "Buongiorno, per il periodo dal " + ci + " al " + co +
    " purtroppo " + aptName + " non risulta disponibile." + altBlock;
}

// Case: dates don't follow sat-sat rule
function buildOutsideRulesText(parsed, stayRuleResult, seasonalPrice, alternatives) {
  // Prefer calendar-verified alternatives; fall back to mathematical sat-sat suggestions
  let displayRanges = [];
  if (alternatives && alternatives.length > 0) {
    displayRanges = alternatives.map(a => ({
      label:   a.label,
      pricing: a.pricing,
      nights:  a.nights,
    }));
  } else {
    displayRanges = (stayRuleResult && stayRuleResult.suggestedValidRanges) || [];
  }

  let altBlock = "";
  if (displayRanges.length > 0) {
    const lines = displayRanges.map(r => {
      const label = r.label ? r.label.replace("->", "to") : "";
      const price = r.pricing && r.pricing.totalPrice
        ? " - " + r.pricing.totalPrice + " euro"
        : (seasonalPrice && seasonalPrice.weeklyRate && r.nights)
          ? " - " + (r.nights / 7 * seasonalPrice.weeklyRate) + " euro"
          : "";
      return "- " + label + price;
    });
    altBlock = "\nPer le date richieste posso proporle queste soluzioni:\n" +
      lines.join("\n") +
      "\nMi dica quale periodo le puo andare meglio.";
  } else {
    altBlock = "\nMi dica pure quali date preferisce e verifico la disponibilita.";
  }
  return "Buongiorno, per il periodo estivo lavoriamo principalmente con soggiorni da sabato a sabato." + altBlock;
}

// Case: full month request
function buildFullMonthText(parsed, seasonalPrice) {
  const monthNum  = parsed.fullMonthNum;
  const monthName = monthNum && MONTH_NAMES[monthNum] ? MONTH_NAMES[monthNum] : "richiesto";
  let priceText = "";
  if (seasonalPrice && seasonalPrice.totalPrice) {
    priceText = "\nIl prezzo indicativo per tutto il mese e di " + seasonalPrice.totalPrice + " euro.";
  }
  const guestsText = parsed.guests
    ? " Vedo che siete in " + parsed.guests + " persone."
    : " Se mi conferma il numero di persone, le do tutti i dettagli.";
  return "Buongiorno, per il mese intero di " + monthName + " possiamo valutarlo." +
    priceText + guestsText;
}

// Case: missing dates or guests
function buildNeedsInfoText() {
  return "Buongiorno, grazie per il messaggio.\nPer verificare disponibilita e prezzo mi servirebbe sapere il periodo preciso e il numero di persone.";
}

/**
 * Build a suggested reply for a Subito inquiry.
 *
 * Decision priority:
 * 1. isFullMonth                          → full_month
 * 2. dates missing                        → needs_info
 * 3. calendar says unavailable            → unavailable   ← calendar always wins
 * 4. stay rules violated (not sat-sat)    → outside_rules (calendar is free)
 * 5. calendar free + rules valid          → available
 *
 * The calendar check (step 3) runs before stay-rules (step 4) so that an
 * occupied period is never shown as "outside_rules" with misleading alternatives.
 * All alternatives must be calendar-verified (from agentAlternatives.findAlternatives).
 *
 * @param {{
 *   parsed:             object,
 *   stayRuleResult:     object,
 *   seasonalPrice:      object|null,
 *   apartmentLabel:     string,
 *   availabilityResult: object|null,  — from checkAvailability / engineResult.payload.avail
 *   alternatives:       Array,        — from findAlternatives (calendar-verified)
 * }} params
 */
export function buildSubitoResponse({
  parsed,
  stayRuleResult,
  seasonalPrice,
  apartmentLabel,
  availabilityResult = null,
  alternatives       = [],
}) {
  const payload = { parsed, stayRuleResult, seasonalPrice, apartmentLabel, availabilityResult, alternatives };

  // 1. Mese intero
  if ((parsed && parsed.isFullMonth) || (stayRuleResult && stayRuleResult.isFullMonth)) {
    return { type: "full_month", responseText: buildFullMonthText(parsed, seasonalPrice),
      payload, requiresOwnerApproval: true, decision_score: 0.6 };
  }

  // 2. Dati insufficienti
  if (!parsed || !parsed.checkin || !parsed.checkout || !stayRuleResult) {
    return { type: "needs_info", responseText: buildNeedsInfoText(),
      payload, requiresOwnerApproval: true, decision_score: 0.1 };
  }

  // 3. Calendario: NON disponibile — il calendario vince sempre sulle regole
  if (availabilityResult && availabilityResult.available === false) {
    return { type: "unavailable",
      responseText: buildUnavailableText(parsed, alternatives, apartmentLabel),
      payload, requiresOwnerApproval: true, decision_score: 0.4 };
  }

  // 4. Fuori regola sabato-sabato (solo se il calendario è libero)
  if (!stayRuleResult.valid) {
    return { type: "outside_rules",
      responseText: buildOutsideRulesText(parsed, stayRuleResult, seasonalPrice, alternatives),
      payload, requiresOwnerApproval: true, decision_score: 0.5 };
  }

  // 5. Disponibile
  return { type: "available",
    responseText: buildAvailableText(parsed, seasonalPrice),
    payload, requiresOwnerApproval: true, decision_score: 0.9 };
}
