/**
 * marketIntelligenceLayer.js — GestAffitti Market Intelligence Layer
 *
 * Pure functions: no I/O, no side effects, no async, no external dependencies.
 *
 * REGOLA MADRE:
 *   DATABASE GestAffitti = fonte di verità (disponibilità, prezzi ufficiali,
 *   prenotazioni, caparre, check-in, dati cliente, regole interne).
 *   MARKET INTELLIGENCE = analisi, confronto, consigli, strategie.
 *   L'LLM può consigliare, non decidere al posto del gestionale.
 *
 * Exports:
 *   buildMarketIntelligenceContext()              → compact context for LLM
 *   classifyMarketQuestion(text)                  → "internal" | "market" | "mixed"
 *   buildMarketGuidance(topic)                    → structured guidance for a topic
 *   separateInternalFactsFromMarketAdvice(data)   → labels internal vs market data
 */

// ── Static Knowledge Base: Location ────────────────────────────────────────────

const AREA = {
  city:    "Senigallia",
  region:  "Marche, costa adriatica (centro-nord)",
  country: "Italia",
  type:    "località balneare adriatica",
  beach:   "Spiaggia di velluto — sabbia fine, famosa sulla riviera adriatica",
  context: "Destinazione turistica balneare italiana con forte domanda familiare estiva",
};

const PROPERTY_PROFILE = {
  type:        "appartamenti estivi fronte/vicino mare",
  model:       "affitti brevi stagionali (principalmente giugno–settembre)",
  primary_target: "famiglie italiane con figli (principale)",
  secondary_target: "coppie, over 50, lavoratori da remoto in settembre",
  stay_norm:   "7 notti (sabato–sabato) in alta stagione, più flessibile in spalla/bassa",
};

// ── Static Knowledge Base: Seasonality ─────────────────────────────────────────

const SEASONALITY_KB = {
  peak: {
    months:     [7, 8],
    label:      "Alta stagione — luglio e agosto",
    demand:     "molto alta, mercato del venditore",
    lead_weeks: "4–16 settimane prima",
    occupancy:  "85–95% nel mercato generale",
    min_stay:   "7 notti (sabato–sabato) standard di mercato",
    strategy:   "Prezzi fermi, nessuno sconto, early bird può avere piccolo premium. Ferragosto = picco assoluto.",
    ferragosto: "Settimana 8–17 agosto: la più richiesta dell'anno. Domanda anelastica — non fare mai sconti. Prezzi massimi giustificati dal mercato.",
    booking_window: "La maggior parte delle prenotazioni estive avviene tra gennaio e maggio. Chi prenota ad agosto per agosto paga il massimo.",
  },
  shoulder_june: {
    months:     [6],
    label:      "Media stagione — giugno",
    demand:     "media-alta (cresce significativamente nella seconda metà)",
    lead_weeks: "1–6 settimane",
    occupancy:  "55–75%",
    min_stay:   "7 notti standard, trattabile a -2 settimane se ancora vuoto",
    strategy:   "Prezzi competitivi. Apertura a soggiorni medi (4-5 notti) per riempire buchi last minute. Buon momento per clienti repeat con sconto fedeltà.",
    note:       "La terza e quarta settimana di giugno hanno domanda quasi estiva — ottimo per prezzi alti. Le prime due settimane sono più lente.",
  },
  shoulder_sept: {
    months:     [9],
    label:      "Media stagione bassa — settembre",
    demand:     "media-bassa, calo forte dopo Ferragosto",
    lead_weeks: "1–3 settimane",
    occupancy:  "30–55%",
    min_stay:   "flessibile (3–7 notti)",
    strategy:   "Prezzi ridotti rispetto ad agosto. Target adulti, coppie, over 50, lavoratori remoto. Considera promozioni 'settimana + qualcosa' o settimane tematiche.",
    note:       "La prima settimana di settembre (1–8) ha ancora buona domanda da chi cerca prezzi post-agosto. Poi calo netto.",
  },
};

// ── Static Knowledge Base: Price Benchmarks ──────────────────────────────────────────
// Range indicativi per appartamenti 2-3 camere fronte/vicino mare, costa adriatica.
// NON sono i prezzi ufficiali di GestAffitti — sono benchmark di mercato.

const PRICE_BENCHMARKS = {
  disclaimer: "Range indicativi mercato adriatico (appartamenti 2-3 camere vicino/fronte mare). NON sono i prezzi ufficiali di GestAffitti.",
  weekly: {
    june_early:      "400–650 €/settimana",
    june_late:       "500–750 €/settimana",
    july:            "750–1050 €/settimana",
    august_standard: "900–1250 €/settimana",
    ferragosto:      "1000–1500 €/settimana (8–17 agosto)",
    september:       "400–600 €/settimana",
  },
  monthly: {
    june:      "1400–2000 €/mese",
    july:      "2400–3100 €/mese",
    august:    "2600–3400 €/mese",
    september: "1200–1700 €/mese",
  },
  positioning_note: "Appartamenti fronte mare con vista o accesso diretto possono stare nella fascia alta o sopra. Appartamenti a 200-500m dal mare nella fascia media.",
};

// ── Static Knowledge Base: Revenue Management ─────────────────────────────────────────

const REVENUE_MANAGEMENT_KB = [
  "Last minute (< 2 settimane): considera sconto 10–15% se l'appartamento è ancora vuoto — meglio riempire che lasciare vuoto",
  "Early bird (> 3 mesi): mantieni il prezzo pieno o applica un piccolo premium (+5%) per premiare chi prenota presto",
  "Ferragosto: non fare mai sconti — la domanda è anelastica, chi vuole il mare quella settimana paga senza trattare",
  "Fill gaps: i brevi vuoti tra prenotazioni (3–4 notti) possono essere riempiti con soggiorni brevi a prezzo ridotto del 20–30%",
  "Settembre: la prima settimana (1–8 sett) ha ancora valore — non svendere. Dalla seconda settimana le tariffe calano notevolmente",
  "Prezzi fissi vs dinamici: per chi inizia, prezzi fissi per stagione sono più semplici. Il dynamic pricing (come Airbnb smart pricing) può aumentare fatturato del 10–25% ma richiede monitoraggio",
  "Mese intero: sconto del 15–20% rispetto al prezzo per 4 settimane è accettabile e riduce il rischio di buchi",
  "Revisione prezzi: aggiorna la tua tariffa ogni anno a febbraio–marzo prima dell'apertura della stagione",
];

// ── Static Knowledge Base: Listing & Marketing ───────────────────────────────────────

const LISTING_TIPS_KB = [
  "Foto professionali: aumentano CTR del 30–50% su Airbnb e Booking. Foto naturale, luminosa, ordine perfetto",
  "Titolo: menziona 'fronte mare' o 'a 100m dal mare' e la spiaggia specifica ('Spiaggia di velluto Senigallia') — sono parole chiave SEO forti sulle piattaforme",
  "Filtri critici che i clienti usano: parcheggio, aria condizionata, WiFi, lavatrice. Elencali sempre e in modo evidente",
  "Tempo di risposta < 1 ora: porta al badge Superhost (Airbnb) e al rango migliore su Booking — impatto diretto sulle prenotazioni",
  "Foto della spiaggia vicina, del lungomare e delle distanze aumentano la fiducia pre-acquisto",
  "Descrizione: sii specifico sulle distanze ('100m dalla spiaggia a piedi', 'parcheggio privato incluso'), non generico",
  "Recensioni: rispondo sempre alle recensioni — positive e negative. Aumenta la fiducia dei nuovi potenziali ospiti",
];

// ── Static Knowledge Base: Distribution Channels ───────────────────────────────────────

const CHANNEL_KB = {
  "Subito.it": {
    commission:  "0% — contatto diretto",
    reach:       "prevalentemente italiano, molto locale",
    fit:         "ottimo per prenotazioni dirette, zero commissione, target famiglie italiane locali",
    limit:       "meno visibilità internazionale, nessun sistema di pagamento integrato",
  },
  "Airbnb": {
    commission:  "~3% host + ~14% guest (varia)",
    reach:       "internazionale + italiano forte",
    fit:         "ottimo per fiducia (recensioni verificate), visibilità alta, clienti internazionali",
    limit:       "commissione alta per il guest può scoraggiare confronto diretto",
  },
  "Booking.com": {
    commission:  "~15% host (varia)",
    reach:       "internazionale, business travel + famiglie",
    fit:         "alto volume, ottimo per riempire buchi, visibilità massima",
    limit:       "commissione alta per il proprietario, poca fidelizzazione",
  },
  "Diretto (WhatsApp/email)": {
    commission:  "0%",
    reach:       "clienti fidelizzati, passaparola",
    fit:         "margine massimo, relazione diretta, possibilità di personalizzare",
    limit:       "richiede costruzione lista contatti, nessuna visibilità nuovi clienti",
  },
};

// ── Static Knowledge Base: Topic guides ────────────────────────────────────────────

const TOPIC_GUIDES = {
  pricing: {
    guidance: `Benchmark adriatici 2-3 camere vicino mare: giugno 450–750€/sett, luglio 750–1050€/sett, agosto 900–1250€/sett, ferragosto 1000–1500€/sett, settembre 400–600€/sett. Revisiona ogni anno a febbraio–marzo. Ferragosto: non scontare mai.`,
  },
  competitors: {
    guidance: `Non ho dati live dalla concorrenza reale. Per benchmarking: filtra su Airbnb/Booking per Senigallia, 2-3 camere, periodo specifico, controlla i top 5-10 risultati. Fai questo monitoraggio manuale 2-3 volte a stagione. Posso darti logiche di mercato generali ma non prezzi reali concorrenti.`,
    action_suggestion: "Crea un foglio di monitoraggio con 5 appartamenti simili e aggiorna i prezzi ogni 2 mesi.",
  },
  seasonality: {
    guidance: `Alta (lug–ago): prezzi massimi, min 7 notti, domanda inelastica. Giugno: media-alta, flessibile last minute. Settembre: bassa, prezzi ridotti, target adulti/coppie. Ferragosto (8–17 ago) è il picco assoluto dell'anno.`,
  },
  revenue: {
    guidance: `Last minute (< 2 sett): -10–15% se vuoto. Early bird (> 3 mesi): prezzo pieno o +5%. Ferragosto: mai sconti. Mese intero: -15–20% sul settimanale × 4. Prezzi dinamici possono aumentare fatturato del 10–25% ma richiedono monitoraggio.`,
    tips: REVENUE_MANAGEMENT_KB,
  },
  listing: {
    guidance: `Foto professionali aumentano CTR del 30–50%. Titolo con 'fronte mare' + nome spiaggia. Elenca: parcheggio, AC, WiFi, lavatrice. Risposta < 1 ora per badge Superhost.`,
    tips: LISTING_TIPS_KB,
  },
  guests: {
    guidance: `Risposta entro 1 ora aumenta ranking. Welcome basket (acqua, caffè, qualcosa locale) migliora le recensioni del 60–70%. Lista ristoranti e attività locali = forte differenziazione. Istruzioni chiare per check-in/out riducono messaggi e malintesi.`,
  },
  channels: {
    guidance: `Subito: zero commissioni, ottimo per locali italiani. Airbnb: fiducia e recensioni verificate, buon reach internazionale. Booking: alto volume, commissione alta. Strategia multi-canale consigliata per massimizzare occupazione.`,
    details: CHANNEL_KB,
  },
  september: {
    guidance: `Settembre è la stagione più difficile. Prima settimana (1–8): ancora valore — non svendere. Dalla seconda settimana: calo netto. Prezzi target: 400–600€/sett. Flessibilità su durata (3–7 notti). Target: coppie, over 50, lavoratori remoto. Considera 'settimana + weekend gratis' per allungare soggiorni.`,
  },
  ferragosto: {
    guidance: `Settimana Ferragosto (tipicamente 8–17 agosto) è il picco assoluto. La domanda è completamente anelastica — chi vuole il mare in quei giorni paga senza trattare. Non fare mai sconti. Tieni il prezzo massimo. Comunicare check-in/out con anticipo è fondamentale per questa settimana.`,
  },
  general: {
    guidance: `Affitti brevi balneari: qualità > quantità. Focus su: presenza su più canali, risposta rapida, pulizia impeccabile, foto professionali. Clienti soddisfatti generano recensioni e passaparola — il canale migliore per abbassare i costi di acquisizione nel lungo periodo.`,
  },
};

// ── Question classification patterns ─────────────────────────────────────────────

const INTERNAL_PATTERNS = [
  "disponibil", "libero", "occupato", "prenotat", "prenotaz",
  "caparra", "check-in", "checkin", "check-out", "checkout",
  "chi arriv", "chi parte", "chi è a", "chi c'è",
  "ospite", "cliente", "il nostro", "la nostra", "nostri", "i nostri",
  "cosa ho oggi", "fammi il punto", "situazione", "cosa devo fare",
  "chi devo richiamare", "prenotazioni attive", "c'è qualcuno",
  "calendario", "ho prenotat", "è prenotato", "è libero",
  "apt1", "apt2", "appartamento 1", "appartamento 2",
  "pagato", "caparra ricevuta", "arrivato", "partito",
];

const MARKET_PATTERNS = [
  "mercato", "concorrenz", "concorrente", "booking.com", "airbnb", "subito.it",
  "strategia", "consiglio", "consigl", "secondo te", "cosa pensi", "mi consigli",
  "quanto chiedo", "quanto chiedere", "quanto vale", "prezzo giusto",
  "prezzo di mercato", "dovrei alzare", "dovrei abbassare", "rivedere il prezzo",
  "sto vendendo basso", "sto vendendo caro", "sto chiedendo troppo",
  "revenue", "tariffa", "tariff", "ottimizzar",
  "posizionamento", "annuncio", "foto", "recension", "marketing",
  "last minute", "occupazione", "fatturato", "stagion",
  "ferragosto vale", "agosto vale", "luglio vale",
  "settembre conviene", "settembre come va",
  "piattaforma", "canale di distribuzione", "dove pubbl",
  "analisi", "tendenza", "andamento mercato",
  "cosa monitoro", "come miglioro", "come aumento",
  "superhost", "ranking", "visibilit",
];

// ── Public API ─────────────────────────────────────────────────────────────────────

/**
 * Returns compact market context for inclusion in the LLM context payload.
 * Kept compact — this goes to the Edge Function on every call.
 */
export function buildMarketIntelligenceContext() {
  return {
    area:             `${AREA.city} (${AREA.region}) — ${AREA.beach}`,
    property_type:    PROPERTY_PROFILE.type,
    business_model:   PROPERTY_PROFILE.model,
    primary_target:   PROPERTY_PROFILE.primary_target,
    internal_truth_rule: "Disponibilità, prezzi ufficiali, prenotazioni, caparre, check-in/out, dati cliente e regole interne vengono ESCLUSIVAMENTE dal contesto gestionale. Non inventarli mai.",
    no_live_data_disclaimer: "Nessun dato live da Booking/Airbnb/Subito/concorrenza disponibile. Per stime di mercato: usa logiche generali. Se chiedi dati live, dichiara che non li hai.",
    seasonality_summary: {
      peak:      "Luglio–agosto: domanda alta, min 7 notti sab–sab, prezzi stabili, no sconti. Ferragosto (8–17 ago) = picco assoluto, prezzi massimi.",
      june:      "Giugno: domanda media-alta (cresce nella seconda metà), lead time 1–6 sett, flessibile su min stay a -2 sett se vuoto.",
      september: "Settembre: domanda bassa, prezzi ridotti, alta flessibilità su durata, target adulti/coppie/over 50.",
    },
    price_benchmarks: PRICE_BENCHMARKS,
    revenue_highlights: [
      REVENUE_MANAGEMENT_KB[0],
      REVENUE_MANAGEMENT_KB[2],
      REVENUE_MANAGEMENT_KB[6],
    ],
    channel_summary: "Multi-canale consigliato: Subito (0% commissione, locale), Airbnb (fiducia+recensioni), Booking (volume), Diretto (margine massimo).",
  };
}

/**
 * Classifies a user question as internal (needs DB data), market (strategic/advisory),
 * or mixed (needs both).
 *
 * "internal" → safe default — forces the LLM to look at the gestionale context
 * "market"   → strategic question, LLM can use market knowledge
 * "mixed"    → both: present gestionale facts first, then market advice
 *
 * @param {string} text — user message in Italian
 * @returns {"internal" | "market" | "mixed"}
 */
export function classifyMarketQuestion(text) {
  if (!text || typeof text !== "string") return "internal";
  const lower = text.toLowerCase();

  const internalScore = INTERNAL_PATTERNS.filter((p) => lower.includes(p)).length;
  const marketScore   = MARKET_PATTERNS.filter((p) => lower.includes(p)).length;

  if (internalScore > 0 && marketScore === 0) return "internal";
  if (marketScore > 0  && internalScore === 0) return "market";
  if (internalScore > 0 && marketScore > 0)    return "mixed";

  // Default: internal — safer (avoids market invention on ambiguous questions)
  return "internal";
}

/**
 * Returns structured guidance for a specific market topic.
 * Always includes disclaimer: no live competitor data.
 *
 * @param {"pricing"|"competitors"|"seasonality"|"revenue"|"listing"|"guests"|"channels"|"september"|"ferragosto"|"general"} topic
 * @returns {{ topic, topic_label, guidance, has_live_data, disclaimer, ...extra }}
 */
export function buildMarketGuidance(topic) {
  const topicLabels = {
    pricing:     "Strategia prezzi / tariffe",
    competitors: "Concorrenza / benchmarking",
    seasonality: "Stagionalità / periodi chiave",
    revenue:     "Revenue management / occupazione",
    listing:     "Annunci / foto / piattaforme",
    guests:      "Gestione ospiti / comunicazione",
    channels:    "Canali di distribuzione",
    september:   "Strategie settembre",
    ferragosto:  "Settimana Ferragosto",
    general:     "Consulenza affitti brevi",
  };

  const topicLabel = topicLabels[topic] ?? topicLabels.general;
  const data       = TOPIC_GUIDES[topic] ?? TOPIC_GUIDES.general;

  return {
    topic,
    topic_label:   topicLabel,
    guidance:      data.guidance,
    has_live_data: false,
    disclaimer:    "Valutazione basata su logiche di mercato generali. Nessun dato live dalla concorrenza disponibile.",
    ...(data.tips             && { tips: data.tips }),
    ...(data.details          && { details: data.details }),
    ...(data.action_suggestion && { action_suggestion: data.action_suggestion }),
  };
}

/**
 * Labels data items as internal (authoritative, from DB) or market (advisory, from KB/LLM).
 * Useful for explicitly marking context before passing to LLM.
 *
 * @param {{ internalFacts?: object[], marketAdvice?: object[] }} data
 * @returns {{ internalFacts, marketAdvice, isSeparated, rule }}
 */
export function separateInternalFactsFromMarketAdvice({
  internalFacts = [],
  marketAdvice  = [],
} = {}) {
  return {
    internalFacts: internalFacts.map((f) => ({
      ...f,
      source:        "gestionale",
      authoritative: true,
    })),
    marketAdvice: marketAdvice.map((a) => ({
      ...a,
      source:        "market_kb",
      authoritative: false,
      disclaimer:    "analisi di mercato — non dato gestionale",
    })),
    isSeparated: true,
    rule: "Internal facts are authoritative. Market advice is guidance only. Never invent internal facts.",
  };
}
