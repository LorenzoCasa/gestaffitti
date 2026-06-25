/**
 * testHostConfig.js — M4: Second Host Config Test
 *
 * Configurazione host alternativa usata SOLO nei test per verificare
 * che il motore GestAffitti non dipenda da apt1/apt2 o Senigallia hardcoded.
 *
 * NON usare in produzione.
 * NON cambiare DEFAULT_HOST_CONFIG.
 * NON è multi-tenancy.
 *
 * Host fittizio: Marco Ferretti, Pineto (Abruzzo), Costa dei Trabocchi.
 * Differenze chiave rispetto a Lorenzo/Senigallia:
 *   - id appartamenti: unitA / unitB (non apt1/apt2)
 *   - numericAlias: null → nessun fallback posizionale
 *   - naturalAliasPattern: "alpha"/"beta" (non "uno"/"due")
 *   - subitoTitle: completamente diversi
 *   - stagioni: peak solo luglio+agosto (non giugno)
 *   - validNights: [7, 14] (non 21 notti)
 *   - prezzi: diversi
 *   - maxAlternativeOffsetDays: 14 (non 15)
 */

export const TEST_HOST_CONFIG = {

  // ── Identità host ───────────────────────────────────────────────────────────
  identity: {
    businessName: "Marco Ferretti",
    city:         "Pineto",
    area:         "Centro",
    region:       "Abruzzo",
    locationLine: "Pineto Lungomare, Costa dei Trabocchi",
  },

  // ── Appartamenti ────────────────────────────────────────────────────────────
  // numericAlias: null → nessun fallback posizionale, test critico per M4
  apartments: [
    {
      id:                  "unitA",
      label:               "Villa del Pino",
      subitoTitle:         "pineto abruzzo villa del pino vacanze estive",
      naturalAliasPattern: /sull['']?alpha\b|nell['']?alpha\b|\bl['']?alpha\b/i,
      numericAlias:        null,
    },
    {
      id:                  "unitB",
      label:               "Casa del Pino",
      subitoTitle:         "pineto abruzzo casa del pino vacanze estive",
      naturalAliasPattern: /sull['']?beta\b|nell['']?beta\b|\bl['']?beta\b/i,
      numericAlias:        null,
    },
  ],

  // ── Tariffe stagionali ──────────────────────────────────────────────────────
  // Nota: giugno (6) assente — non è stagione per questo host.
  seasonalRates: {
    7: { month: "luglio",    weekly: 700,  monthly: 2200, season: "peak"     },
    8: { month: "agosto",    weekly: 700,  monthly: 2200, season: "peak"     },
    9: { month: "settembre", weekly: 350,  monthly: 1100, season: "shoulder" },
  },

  // ── Regole soggiorno ────────────────────────────────────────────────────────
  // peakMonths: [7, 8] — giugno NON è peak per questo host
  // validNights: [7, 14] — no 21 notti
  // maxAlternativeOffsetDays: 14 — diverso da Lorenzo (15)
  stayRules: {
    peakMonths:               [7, 8],
    validNights:              [7, 14],
    checkInDayOfWeek:         6,
    maxAlternativeOffsetDays: 14,
    fullMonthEligible:        true,
    septemberFlexible:        true,
  },

};
