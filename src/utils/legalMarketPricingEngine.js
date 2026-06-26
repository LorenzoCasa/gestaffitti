/**
 * legalMarketPricingEngine.js — GestAffitti Legal Market Pricing Engine
 *
 * Pure functions: no I/O, no async, no external dependencies, no scraping.
 *
 * REGOLA MADRE:
 *   DATABASE GestAffitti = fonte di verità (disponibilità, prezzi ufficiali,
 *   prenotazioni, caparre, check-in, dati cliente, regole interne).
 *   MARKET DATA = consulenza (benchmark, confronto, strategie).
 *
 * Fonti ammesse: manual | csv_import | authorized_api | internal_history | mock.
 * Scraping VIETATO: viola ToS Booking/Airbnb/Subito, fragile, non vendibile.
 *
 * Exports:
 *   buildLegalMarketContext()
 *   normalizeCompetitorRecord(raw)
 *   classifyMarketDataSource(sourceType)
 *   calculateBenchmarkRange(competitors, options)
 *   analyzePricePosition(ourPrice, benchmarkRange)
 *   suggestPriceStrategy(params)
 *   generateMarketPricingAdvice(params)
 *   validateMarketDataTrustLevel(record)
 */

import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const LEGAL_SOURCES  = ["manual", "csv_import", "authorized_api", "internal_history", "mock"];
export const SCRAPING_ALLOWED = false;

const VALID_PLATFORMS = ["booking", "airbnb", "subito", "direct", "other"];
const VALID_AVAILABILITY = ["available", "limited", "unknown"];

const SOURCE_TRUST_MAP = {
  mock:             "low",
  manual:           "medium",
  csv_import:       "medium",
  authorized_api:   "high",
  internal_history: "high",
};

const SOURCE_DISCLAIMERS = {
  mock:             "Analisi basata su dati simulati, non su dati live della concorrenza.",
  manual:           "Analisi basata su dati inseriti manualmente e da verificare periodicamente.",
  csv_import:       "Analisi basata su dati importati via CSV e da verificare periodicamente.",
  authorized_api:   "Analisi basata su dati provenienti da fonte autorizzata.",
  internal_history: "Analisi basata su storico interno GestAffitti.",
};

// ── Static Benchmark KB (mock, clearly labeled) ───────────────────────────────
// Stime strategiche per Senigallia e zone limitrofe.
// NON sono dati live della concorrenza.
// source_type: "mock", is_mock: true, trust_level: "low"

const AREA_BENCHMARK_KB = [
  // LUNGOMARE SENIGALLIA
  {
    id: "kb-lun-giugno", source_type: "mock", source_name: "KB Senigallia (stima strategica)",
    area: "senigallia_lungomare", platform: "other", title: "Benchmark lungomare giugno",
    distance_to_sea_meters: 50, beds: 4, bedrooms: 2, amenities: ["parcheggio","aria_condizionata","wifi"],
    period_start: "2026-06-01", period_end: "2026-06-30",
    price_total: 600, price_nightly: null, price_weekly_equivalent: 600,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  {
    id: "kb-lun-luglio", source_type: "mock", source_name: "KB Senigallia (stima strategica)",
    area: "senigallia_lungomare", platform: "other", title: "Benchmark lungomare luglio",
    distance_to_sea_meters: 50, beds: 4, bedrooms: 2, amenities: ["parcheggio","aria_condizionata","wifi"],
    period_start: "2026-07-01", period_end: "2026-07-31",
    price_total: 900, price_nightly: null, price_weekly_equivalent: 900,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  {
    id: "kb-lun-agosto", source_type: "mock", source_name: "KB Senigallia (stima strategica)",
    area: "senigallia_lungomare", platform: "other", title: "Benchmark lungomare agosto",
    distance_to_sea_meters: 50, beds: 4, bedrooms: 2, amenities: ["parcheggio","aria_condizionata","wifi"],
    period_start: "2026-08-01", period_end: "2026-08-31",
    price_total: 1100, price_nightly: null, price_weekly_equivalent: 1100,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  {
    id: "kb-lun-ferragosto", source_type: "mock", source_name: "KB Senigallia (stima strategica)",
    area: "senigallia_lungomare", platform: "other", title: "Benchmark lungomare ferragosto",
    distance_to_sea_meters: 50, beds: 4, bedrooms: 2, amenities: ["parcheggio","aria_condizionata","wifi"],
    period_start: "2026-08-08", period_end: "2026-08-17",
    price_total: 1250, price_nightly: null, price_weekly_equivalent: 1250,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Ferragosto — picco assoluto. Stima strategica.",
  },
  {
    id: "kb-lun-settembre", source_type: "mock", source_name: "KB Senigallia (stima strategica)",
    area: "senigallia_lungomare", platform: "other", title: "Benchmark lungomare settembre",
    distance_to_sea_meters: 50, beds: 4, bedrooms: 2, amenities: ["parcheggio","aria_condizionata","wifi"],
    period_start: "2026-09-01", period_end: "2026-09-30",
    price_total: 500, price_nightly: null, price_weekly_equivalent: 500,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  // MARZOCCA
  {
    id: "kb-marzocca-agosto", source_type: "mock", source_name: "KB Marzocca (stima strategica)",
    area: "marzocca", platform: "other", title: "Benchmark Marzocca agosto",
    distance_to_sea_meters: 200, beds: 4, bedrooms: 2, amenities: ["parcheggio","wifi"],
    period_start: "2026-08-01", period_end: "2026-08-31",
    price_total: 800, price_nightly: null, price_weekly_equivalent: 800,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  // CESANO
  {
    id: "kb-cesano-agosto", source_type: "mock", source_name: "KB Cesano (stima strategica)",
    area: "cesano", platform: "other", title: "Benchmark Cesano agosto",
    distance_to_sea_meters: 150, beds: 4, bedrooms: 2, amenities: ["parcheggio","wifi"],
    period_start: "2026-08-01", period_end: "2026-08-31",
    price_total: 750, price_nightly: null, price_weekly_equivalent: 750,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
  // CIARNIN
  {
    id: "kb-ciarnin-agosto", source_type: "mock", source_name: "KB Ciarnin (stima strategica)",
    area: "ciarnin", platform: "other", title: "Benchmark Ciarnin agosto",
    distance_to_sea_meters: 100, beds: 4, bedrooms: 2, amenities: ["parcheggio","wifi"],
    period_start: "2026-08-01", period_end: "2026-08-31",
    price_total: 850, price_nightly: null, price_weekly_equivalent: 850,
    availability_status: "unknown", rating: null, reviews_count: null,
    collected_at: "2026-01-01", trust_level: "low", is_mock: true, notes: "Stima strategica — non dato live",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPeriodLabel(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day   = parseInt(dateStr.slice(8, 10), 10);
  if (month === 8 && day >= 8 && day <= 17) return "ferragosto";
  if (month === 6) return "june";
  if (month === 7) return "july";
  if (month === 8) return "august";
  if (month === 9) return "september";
  return "other";
}

function periodsOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return true;
  return startA < endB && endA > startB;
}

function safeUniqueId(raw) {
  if (raw?.id && typeof raw.id === "string") return raw.id;
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the legal market context for inclusion in the LLM context payload.
 * Documents which sources are legal, trust rules and static KB summary.
 */
export function buildLegalMarketContext(hostConfig = DEFAULT_HOST_CONFIG) {
  const city       = hostConfig?.identity?.city ?? "N/D";
  const hasLocalKB = AREA_BENCHMARK_KB.some(b =>
    b.area.toLowerCase().includes(city.toLowerCase())
  );

  const base = {
    legal_sources_only: true,
    scraping_allowed:   SCRAPING_ALLOWED,
    supported_sources:  [...LEGAL_SOURCES],
    source_trust_rules: { ...SOURCE_TRUST_MAP },
    source_disclaimers: { ...SOURCE_DISCLAIMERS },
    kb_is_mock:         true,
    no_scraping_rule:   "Scraping da Booking/Airbnb/Subito non ammesso: viola ToS, tecnica fragile, prodotto non vendibile.",
    pricing_advice:     {},
    disclaimers:        [],
  };

  if (!hasLocalKB) {
    return {
      ...base,
      area:            city,
      areas_covered:   [],
      periods_covered: [],
      kb_summary:      `Nessun benchmark locale configurato per ${city}. Usa ricerche manuali su Airbnb/Booking per la zona.`,
      kb_benchmark_count: 0,
      kb_source:       "none",
    };
  }

  return {
    ...base,
    area:            city,
    areas_covered:   ["senigallia_lungomare", "marzocca", "cesano", "ciarnin"],
    periods_covered: ["june", "july", "august", "ferragosto", "september"],
    kb_summary:      `Benchmark strategici (mock) disponibili per ${city} e zone limitrofe. Nessun dato live. Fonti reali ammesse: manual, csv_import, authorized_api, internal_history.`,
    kb_benchmark_count: AREA_BENCHMARK_KB.length,
  };
}

/**
 * Normalizes a raw competitor record to the standard schema.
 * Forces safe defaults, sets trust_level from source_type.
 * Marks is_mock=true for source_type="mock".
 *
 * Standard CompetitorRecord schema:
 * {
 *   id, source_type, source_name, area, platform, title,
 *   distance_to_sea_meters, beds, bedrooms, amenities,
 *   period_start, period_end, price_total, price_nightly,
 *   price_weekly_equivalent, availability_status,
 *   rating, reviews_count, collected_at,
 *   trust_level, is_mock, notes
 * }
 *
 * @param {object} raw
 * @returns {object|null}
 */
export function normalizeCompetitorRecord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const sourceType = LEGAL_SOURCES.includes(raw.source_type) ? raw.source_type : "mock";
  const classified = classifyMarketDataSource(sourceType);

  return {
    id:                      safeUniqueId(raw),
    source_type:             sourceType,
    source_name:             typeof raw.source_name === "string" ? raw.source_name : "Sconosciuta",
    area:                    typeof raw.area === "string" ? raw.area : "unknown",
    platform:                VALID_PLATFORMS.includes(raw.platform) ? raw.platform : "other",
    title:                   typeof raw.title === "string" ? raw.title : "",
    distance_to_sea_meters:  typeof raw.distance_to_sea_meters === "number" ? raw.distance_to_sea_meters : null,
    beds:                    typeof raw.beds === "number" ? raw.beds : null,
    bedrooms:                typeof raw.bedrooms === "number" ? raw.bedrooms : null,
    amenities:               Array.isArray(raw.amenities) ? raw.amenities : [],
    period_start:            typeof raw.period_start === "string" ? raw.period_start : null,
    period_end:              typeof raw.period_end === "string" ? raw.period_end : null,
    price_total:             typeof raw.price_total === "number" ? raw.price_total : 0,
    price_nightly:           typeof raw.price_nightly === "number" ? raw.price_nightly : null,
    price_weekly_equivalent: typeof raw.price_weekly_equivalent === "number" ? raw.price_weekly_equivalent : null,
    availability_status:     VALID_AVAILABILITY.includes(raw.availability_status) ? raw.availability_status : "unknown",
    rating:                  typeof raw.rating === "number" ? raw.rating : null,
    reviews_count:           typeof raw.reviews_count === "number" ? raw.reviews_count : null,
    collected_at:            typeof raw.collected_at === "string" ? raw.collected_at : new Date().toISOString().slice(0, 10),
    trust_level:             classified.trust_level,
    is_mock:                 sourceType === "mock",
    notes:                   typeof raw.notes === "string" ? raw.notes : null,
  };
}

/**
 * Classifies a source type and returns trust level + mandatory disclaimer.
 *
 * Trust levels:
 *   mock             → low
 *   manual           → medium
 *   csv_import       → medium
 *   authorized_api   → high
 *   internal_history → high
 *
 * @param {string} sourceType
 * @returns {{ source_type, trust_level, disclaimer }}
 */
export function classifyMarketDataSource(sourceType) {
  const safe = LEGAL_SOURCES.includes(sourceType) ? sourceType : "mock";
  return {
    source_type: safe,
    trust_level: SOURCE_TRUST_MAP[safe],
    disclaimer:  SOURCE_DISCLAIMERS[safe],
  };
}

/**
 * Calculates benchmark price range from competitor records.
 * Falls back to static KB if no matching competitors provided.
 *
 * @param {object[]} competitors
 * @param {{ period?: string, area?: string, periodStart?: string, periodEnd?: string }} options
 * @returns {{ min, max, avg, median, count, trust_level, is_mock, disclaimer }}
 */
export function calculateBenchmarkRange(competitors = [], { period, area, periodStart, periodEnd } = {}) {
  let pool = Array.isArray(competitors) ? [...competitors] : [];

  if (area) {
    pool = pool.filter(c => !c.area || c.area === area || c.area.includes(area) || area.includes(c.area));
  }

  if (periodStart && periodEnd) {
    pool = pool.filter(c => periodsOverlap(periodStart, periodEnd, c.period_start, c.period_end));
  } else if (period) {
    pool = pool.filter(c => {
      const p = getPeriodLabel(c.period_start);
      return !p || p === period || p === "other";
    });
  }

  if (pool.length === 0) {
    let kb = [...AREA_BENCHMARK_KB];
    if (area) kb = kb.filter(c => !c.area || c.area === area || c.area.includes(area) || area.includes(c.area));
    if (period) {
      kb = kb.filter(c => {
        const p = getPeriodLabel(c.period_start);
        return !p || p === period;
      });
    }
    if (periodStart && periodEnd) {
      kb = kb.filter(c => periodsOverlap(periodStart, periodEnd, c.period_start, c.period_end));
    }
    if (kb.length > 0) pool = kb;
  }

  if (pool.length === 0) {
    return {
      min: null, max: null, avg: null, median: null, count: 0,
      trust_level: "low", is_mock: true,
      disclaimer:  SOURCE_DISCLAIMERS.mock + " Nessun benchmark disponibile per area/periodo.",
    };
  }

  const prices = pool
    .map(c => c.price_weekly_equivalent ?? c.price_total)
    .filter(p => typeof p === "number" && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      min: null, max: null, avg: null, median: null, count: pool.length,
      trust_level: "low", is_mock: true, disclaimer: SOURCE_DISCLAIMERS.mock,
    };
  }

  const min    = prices[0];
  const max    = prices[prices.length - 1];
  const avg    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const mid    = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];

  const hasMock   = pool.some(c => c.is_mock || c.source_type === "mock");
  const hasManual = pool.some(c => c.source_type === "manual" || c.source_type === "csv_import");
  const hasHigh   = pool.some(c => c.source_type === "authorized_api" || c.source_type === "internal_history");

  const trust_level = hasHigh && !hasMock ? "high" : hasManual && !hasMock ? "medium" : "low";
  const primarySource = hasMock ? "mock" : hasManual ? "manual" : "authorized_api";

  return {
    min, max, avg, median,
    count: prices.length,
    trust_level,
    is_mock: hasMock,
    disclaimer: SOURCE_DISCLAIMERS[primarySource],
  };
}

/**
 * Analyzes our price position relative to a benchmark range.
 * Returns "unknown" if our price is missing from the gestionale context.
 *
 * @param {number|null} ourPrice
 * @param {{ min, max, avg }} benchmarkRange
 * @returns {{ position, pct_diff, reasoning }}
 */
export function analyzePricePosition(ourPrice, benchmarkRange) {
  if (ourPrice == null || typeof ourPrice !== "number") {
    return {
      position:  "unknown",
      pct_diff:  null,
      reasoning: "Prezzo ufficiale non presente nel gestionale. Impossibile confrontare con il mercato.",
    };
  }

  const { min, max, avg } = benchmarkRange ?? {};
  if (min == null || max == null || avg == null) {
    return {
      position:  "unknown",
      pct_diff:  null,
      reasoning: "Benchmark non disponibile per il periodo/area selezionati.",
    };
  }

  const pct_diff  = Math.round(((ourPrice - avg) / avg) * 100);
  const TOLERANCE = 10;

  const position =
    pct_diff < -TOLERANCE ? "below_market" :
    pct_diff > TOLERANCE  ? "above_market" :
    "aligned";

  const reasoning =
    position === "below_market"
      ? `Il nostro prezzo (€${ourPrice}) è ${Math.abs(pct_diff)}% sotto la media di mercato (€${avg}).`
      : position === "above_market"
      ? `Il nostro prezzo (€${ourPrice}) è ${pct_diff}% sopra la media di mercato (€${avg}).`
      : `Il nostro prezzo (€${ourPrice}) è in linea con la media di mercato (€${avg}) — entro ±${TOLERANCE}%.`;

  return { position, pct_diff, reasoning };
}

/**
 * Suggests a price strategy for an apartment/period.
 * Never modifies prices. Returns recommendation + confidence only.
 *
 * @param {{
 *   current_price?: number|null,
 *   period?: string|null,
 *   area?: string|null,
 *   periodStart?: string|null,
 *   periodEnd?: string|null,
 *   daysToCheckin?: number|null,
 *   occupancy_pct?: number|null,
 *   competitors?: object[],
 * }} params
 *
 * @returns {{
 *   current_price, suggested_min, suggested_target, suggested_max,
 *   position, confidence, demand_level,
 *   reasoning: string[], recommendations: string[], disclaimer, data_sources: string[]
 * }}
 */
export function suggestPriceStrategy({
  current_price  = null,
  period         = null,
  area           = null,
  periodStart    = null,
  periodEnd      = null,
  daysToCheckin  = null,
  occupancy_pct  = null,
  competitors    = [],
  hostConfig     = DEFAULT_HOST_CONFIG,
} = {}) {
  const benchmark = calculateBenchmarkRange(competitors, { period, area, periodStart, periodEnd });
  const pos       = analyzePricePosition(current_price, benchmark);

  const periodLabel = period ?? getPeriodLabel(periodStart);
  const demand_level =
    periodLabel === "ferragosto"                       ? "high"    :
    periodLabel === "july" || periodLabel === "august" ? "high"    :
    periodLabel === "june"                             ? "medium"  :
    periodLabel === "september"                        ? "low"     : "unknown";

  const reasoning = [];
  if (pos.reasoning) reasoning.push(pos.reasoning);

  if (periodLabel === "ferragosto") {
    reasoning.push("Ferragosto (8–17 ago): domanda anelastica — non fare mai sconti. Prezzi massimi giustificati.");
  }

  if (typeof daysToCheckin === "number") {
    if (daysToCheckin <= 7 && demand_level !== "high") {
      reasoning.push(`Last minute (${daysToCheckin}gg al check-in): considera -10–15% se ancora libero.`);
    } else if (daysToCheckin > 90) {
      reasoning.push(`Prenotazione anticipata (${daysToCheckin}gg): prezzo pieno giustificato.`);
    }
  }

  if (typeof occupancy_pct === "number") {
    if (occupancy_pct < 50) {
      reasoning.push(`Occupazione interna ${occupancy_pct}%: valuta promozioni last minute per riempire.`);
    } else if (occupancy_pct > 80) {
      reasoning.push(`Occupazione interna ${occupancy_pct}%: posizione forte, nessuno sconto necessario.`);
    }
  }

  const recommendations = [];

  if (pos.position === "unknown" || current_price == null) {
    recommendations.push("Non ho il prezzo ufficiale nel gestionale. Per un confronto reale, inserisci il prezzo ufficiale.");
  } else if (pos.position === "below_market" && periodLabel !== "september") {
    recommendations.push("Il prezzo appare sotto la media di mercato: valuta un aumento per il prossimo anno.");
    recommendations.push("Verifica che il benchmark rifletta caratteristiche simili (distanza mare, servizi).");
  } else if (pos.position === "above_market") {
    recommendations.push("Il prezzo è sopra la media: assicurati che sia giustificato da posizione/servizi premium.");
    recommendations.push("Se vuoto a -3 settimane, considera last minute targeting su Subito (zero commissioni).");
  } else {
    recommendations.push("Il prezzo è in linea con il mercato. Mantieni e monitora ogni 4-6 settimane.");
  }

  if (periodLabel === "ferragosto") {
    recommendations.push("NON abbassare durante Ferragosto: domanda anelastica, chi vuole il mare paga.");
  }
  if (periodLabel === "september") {
    recommendations.push("Settembre: considera flessibilità su min stay. Prezzi ridotti del 20–30% rispetto agosto sono normali.");
  }
  if (periodLabel === "june") {
    recommendations.push("Giugno: se libero a -2 settimane, apri a soggiorni corti (4–5 notti) per riempire buchi.");
  }

  let confidence = 0.3;
  if (benchmark.trust_level === "high")         confidence += 0.4;
  else if (benchmark.trust_level === "medium")  confidence += 0.2;
  if (current_price != null)  confidence += 0.2;
  if (pos.position !== "unknown") confidence += 0.1;
  confidence = Math.min(Math.round(confidence * 100) / 100, 0.9);

  const { min, max, avg } = benchmark;
  const suggested_min    = min != null ? Math.round(min * 0.9) : null;
  const suggested_target = avg;
  const suggested_max    = max != null ? Math.round(max * 1.1) : null;

  const kbCity     = hostConfig?.identity?.city ?? "";
  const hasLocalKB = kbCity
    ? AREA_BENCHMARK_KB.some(b => b.area.toLowerCase().includes(kbCity.toLowerCase()))
    : false;
  const data_sources = [
    ...new Set([
      ...competitors.map(c => c.source_name ?? c.source_type).filter(Boolean),
      ...(benchmark.is_mock && hasLocalKB ? [`KB strategica ${kbCity} (mock — non live)`] : []),
    ]),
  ];

  return {
    current_price,
    suggested_min,
    suggested_target,
    suggested_max,
    position:        pos.position,
    confidence,
    demand_level,
    reasoning,
    recommendations,
    disclaimer:      benchmark.disclaimer,
    data_sources,
  };
}

/**
 * Generates a structured market pricing advice object.
 * Always includes trust_level and disclaimer.
 * NEVER generates action_plan. NEVER needs_confirmation.
 *
 * @param {{
 *   question?: string|null,
 *   current_price?: number|null,
 *   period?: string|null,
 *   area?: string|null,
 *   periodStart?: string|null,
 *   periodEnd?: string|null,
 *   competitors?: object[],
 *   daysToCheckin?: number|null,
 *   occupancy_pct?: number|null,
 * }} params
 *
 * @returns {{ strategy, benchmark, position_analysis, intent_hint, action_plan: null, needs_confirmation: false }}
 */
export function generateMarketPricingAdvice({
  question       = null,
  current_price  = null,
  period         = null,
  area           = null,
  periodStart    = null,
  periodEnd      = null,
  competitors    = [],
  daysToCheckin  = null,
  occupancy_pct  = null,
  hostConfig     = DEFAULT_HOST_CONFIG,
} = {}) {
  const city       = hostConfig?.identity?.city ?? "";
  const hasLocalKB = city
    ? AREA_BENCHMARK_KB.some(b => b.area.toLowerCase().includes(city.toLowerCase()))
    : false;

  // No local KB and no real competitors: can't run meaningful analysis
  if (!hasLocalKB && (!competitors || competitors.length === 0)) {
    const noDataBenchmark = {
      min: null, max: null, avg: null, median: null, count: 0,
      trust_level: "low", is_mock: true,
      disclaimer: SOURCE_DISCLAIMERS.mock + " Nessun benchmark disponibile per area/periodo.",
    };
    return {
      strategy: {
        current_price, suggested_min: null, suggested_target: null, suggested_max: null,
        position: "unknown", confidence: 0, demand_level: "unknown",
        reasoning: [`Nessun benchmark locale disponibile per ${city || "questo host"}. Esegui ricerche manuali su Airbnb/Booking per la zona.`],
        recommendations: ["Inserisci manualmente prezzi di mercato rilevati da Airbnb/Booking per la tua area."],
        disclaimer: SOURCE_DISCLAIMERS.mock,
        data_sources: [],
      },
      benchmark:        noDataBenchmark,
      position_analysis: analyzePricePosition(current_price, noDataBenchmark),
      intent_hint:        "no_kb",
      action_plan:        null,
      needs_confirmation: false,
    };
  }

  const strategy          = suggestPriceStrategy({ current_price, period, area, periodStart, periodEnd, daysToCheckin, occupancy_pct, competitors, hostConfig });
  const benchmark         = calculateBenchmarkRange(competitors, { period, area, periodStart, periodEnd });
  const position_analysis = analyzePricePosition(current_price, benchmark);

  return {
    strategy,
    benchmark,
    position_analysis,
    intent_hint:        "market_analysis",
    action_plan:        null,
    needs_confirmation: false,
  };
}

/**
 * Validates the trust level consistency of a competitor record.
 * Returns warnings if is_mock/source_type/trust_level are inconsistent.
 *
 * @param {object} record — CompetitorRecord
 * @returns {{ valid, trust_level, disclaimer, warnings: string[] }}
 */
export function validateMarketDataTrustLevel(record) {
  if (!record || typeof record !== "object") {
    return {
      valid:       false,
      trust_level: "low",
      disclaimer:  SOURCE_DISCLAIMERS.mock,
      warnings:    ["Record non valido o null."],
    };
  }

  const classified = classifyMarketDataSource(record.source_type);
  const warnings   = [];

  if (record.is_mock && record.source_type !== "mock") {
    warnings.push(`is_mock=true ma source_type='${record.source_type}': trattato come mock per sicurezza.`);
  }
  if (record.source_type === "mock" && record.is_mock === false) {
    warnings.push("source_type='mock' ma is_mock=false: il record sarà trattato come mock.");
  }
  if (record.trust_level && record.trust_level !== classified.trust_level) {
    warnings.push(`trust_level dichiarato '${record.trust_level}' non corrisponde a source_type '${record.source_type}' (atteso: '${classified.trust_level}').`);
  }

  const effectiveTrust      = record.is_mock || record.source_type === "mock" ? "low" : classified.trust_level;
  const effectiveDisclaimer = record.is_mock || record.source_type === "mock"
    ? SOURCE_DISCLAIMERS.mock
    : classified.disclaimer;

  return {
    valid:       warnings.length === 0,
    trust_level: effectiveTrust,
    disclaimer:  effectiveDisclaimer,
    warnings,
  };
}
