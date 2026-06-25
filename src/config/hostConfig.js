/**
 * hostConfig.js — GestAffitti Host Configuration
 *
 * Centralizza le costanti specifiche dell'host attuale (Lorenzo/Senigallia).
 * Permette in futuro di usare una seconda configurazione host senza
 * riscrivere il motore (orchestratore, parser, regole).
 *
 * Questo NON è multi-tenancy. È decoupling minimo MVP.
 *
 * Come usare:
 *   - Le funzioni business accettano `hostConfig = DEFAULT_HOST_CONFIG` come
 *     parametro opzionale. Il comportamento attuale resta invariato.
 *   - Per un secondo host: passa una config diversa alle stesse funzioni.
 */

export const DEFAULT_HOST_CONFIG = {

  // ── Identità host ───────────────────────────────────────────────────────────
  identity: {
    businessName: "Lorenzo Casavecchia",
    city:         "Senigallia",
    area:         "Lungomare",
    region:       "Marche",
    locationLine: "Lungomare Senigallia, Spiaggia di Velluto",
  },

  // ── Appartamenti ────────────────────────────────────────────────────────────
  // id: corrisponde all'id nel database (non rinominare)
  // subitoTitle: titolo annuncio Subito in minuscolo (usato per resolver)
  // naturalAliasPattern: regex italiana per riconoscimento in linguaggio naturale
  apartments: [
    {
      id:                  "apt1",
      label:               "Appartamento A",
      subitoTitle:         "lungomare senigallia appartamento estivo 1",
      naturalAliasPattern: /sull['']?uno\b|nell['']?uno\b|\bl['']?uno\b/i,
    },
    {
      id:                  "apt2",
      label:               "Appartamento B",
      subitoTitle:         "lungomare senigallia appartamento estivo 2",
      naturalAliasPattern: /sull['']?due\b|nell['']?due\b|\bl['']?due\b/i,
    },
  ],

  // ── Tariffe stagionali ──────────────────────────────────────────────────────
  // Fonte: CLAUDE.md "Current Pricing Rules"
  // weekly: tariffa per 7 notti (o multipli)
  // monthly: tariffa mese intero
  // season: "peak" | "shoulder"
  seasonalRates: {
    6: { month: "giugno",    weekly: 500,  monthly: 1600, season: "shoulder" },
    7: { month: "luglio",    weekly: 800,  monthly: 2600, season: "peak"     },
    8: { month: "agosto",    weekly: 800,  monthly: 2600, season: "peak"     },
    9: { month: "settembre", weekly: 500,  monthly: 1500, season: "shoulder" },
  },

  // ── Regole soggiorno ────────────────────────────────────────────────────────
  // Fonte: CLAUDE.md "Current Stay Rules"
  stayRules: {
    peakMonths:               [6, 7, 8],   // mesi con regola sabato-sabato
    validNights:              [7, 14, 21], // durate valide in alta stagione
    checkInDayOfWeek:         6,           // 6 = sabato (UTC)
    maxAlternativeOffsetDays: 15,          // max ±giorni per alternative
    fullMonthEligible:        true,
    septemberFlexible:        true,
  },

};
