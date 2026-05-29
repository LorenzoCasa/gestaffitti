const MONTH_NAMES = ["","gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre"];

function itDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  return parseInt(parts[2]) + " " + MONTH_NAMES[parseInt(parts[1])];
}

function buildAvailableText(parsed, stayRuleResult, seasonalPrice) {
  const ci = itDate(parsed.checkin);
  const co = itDate(parsed.checkout);

  let priceText = "";
  if (seasonalPrice && seasonalPrice.totalPrice) {
    const weeks  = seasonalPrice.weeks;
    const wLabel = weeks === 1 ? "la settimana" : weeks + " settimane";
    priceText = "\nIl costo per " + wLabel + " è di " + seasonalPrice.totalPrice + " €.";
  }

  return "Buongiorno, sì, per il periodo dal " + ci + " al " + co +
    " l'appartamento risulta disponibile." +
    priceText +
    "\nSe vuole, posso fornirle tutte le informazioni per procedere.";
}

function buildOutsideRulesText(parsed, stayRuleResult, seasonalPrice) {
  const ranges = (stayRuleResult && stayRuleResult.suggestedValidRanges) || [];
  let altBlock = "";

  if (ranges.length > 0) {
    const lines = ranges.map(r => {
      const label = r.label.replace("->", "→");
      const price = (seasonalPrice && seasonalPrice.weeklyRate)
        ? " — " + (r.nights / 7 * seasonalPrice.weeklyRate) + " €"
        : "";
      return "- " + label + price;
    });
    altBlock = "\nPer le date richieste posso proporle queste soluzioni:\n" +
      lines.join("\n") +
      "\nMi dica quale periodo le può andare meglio.";
  } else {
    altBlock = "\nMi dica pure quali date preferisce e verifico la disponibilità.";
  }

  return "Buongiorno, per il periodo estivo lavoriamo principalmente con soggiorni da sabato a sabato." +
    altBlock;
}

function buildFullMonthText(parsed, seasonalPrice) {
  const monthNum  = parsed.fullMonthNum;
  const monthName = (monthNum && MONTH_NAMES[monthNum]) ? MONTH_NAMES[monthNum] : "richiesto";

  let priceText = "";
  if (seasonalPrice && seasonalPrice.totalPrice) {
    priceText = "\nIl prezzo indicativo per tutto il mese è di " + seasonalPrice.totalPrice + " €.";
  }

  const guestsText = parsed.guests
    ? " Vedo che siete in " + parsed.guests + " persone."
    : " Se mi conferma il numero di persone, le do tutti i dettagli.";

  return "Buongiorno, per il mese intero di " + monthName + " possiamo valutarlo." +
    priceText + guestsText;
}

function buildNeedsInfoText() {
  return "Buongiorno, grazie per il messaggio.\nPer verificare disponibilità e prezzo mi servirebbe sapere il periodo preciso e il numero di persone.";
}

export function buildSubitoResponse({ parsed, stayRuleResult, seasonalPrice, apartmentLabel }) {
  const payload = { parsed, stayRuleResult, seasonalPrice, apartmentLabel };

  // Mese intero — ha priorità sulle date mancanti
  if ((parsed && parsed.isFullMonth) || (stayRuleResult && stayRuleResult.isFullMonth)) {
    return {
      type:                  "full_month",
      responseText:          buildFullMonthText(parsed, seasonalPrice),
      payload,
      requiresOwnerApproval: true,
      decision_score:        0.6,
    };
  }

  // Dati insufficienti
  if (!parsed || !parsed.checkin || !parsed.checkout || !stayRuleResult) {
    return {
      type:                  "needs_info",
      responseText:          buildNeedsInfoText(),
      payload,
      requiresOwnerApproval: true,
      decision_score:        0.1,
    };
  }

  // Fuori regola sabato-sabato
  if (!stayRuleResult.valid) {
    return {
      type:                  "outside_rules",
      responseText:          buildOutsideRulesText(parsed, stayRuleResult, seasonalPrice),
      payload,
      requiresOwnerApproval: true,
      decision_score:        0.5,
    };
  }

  // Periodo valido
  return {
    type:                  "available",
    responseText:          buildAvailableText(parsed, stayRuleResult, seasonalPrice),
    payload,
    requiresOwnerApproval: true,
    decision_score:        0.9,
  };
}
