/**
 * hostConfig.betaHost.js — GestAffitti Beta Host Configuration
 *
 * Configurazione beta per B&B MARE (Riccione / Emilia-Romagna).
 * Usata solo per test interni del motore — NON è multi-tenant, NON ha DB.
 *
 * Template di riferimento: src/config/hostConfig.js
 * Milestone: M5A-1 Beta Host Config
 *
 * Differenze rispetto a Lorenzo/Senigallia:
 * - 5 camere (non 2 appartamenti)
 * - pricing per notte (pricingModel: "nightly")
 * - soggiorno minimo 1 notte, nessun obbligo sabato-sabato
 * - check-in qualsiasi giorno
 * - supplemento ospiti 3ª/4ª persona (+€20/notte ciascuno)
 */

export const BETA_HOST_CONFIG = {

  // ── Identità host ────────────────────────────────────────────────────────────
  identity: {
    businessName: "B&B MARE",
    city:         "Riccione",
    area:         "Lungomare",
    region:       "Emilia-Romagna",
    locationLine: "Lungomare di Riccione, Emilia-Romagna",
    ownerName:    "Davide",
    unitType:     "camera",
  },

  // ── Unità prenotabili (5 camere) ────────────────────────────────────────────
  // id: interno al motore (nessun DB in fase beta)
  // naturalAliasPattern: regex per riconoscimento in linguaggio naturale
  // hasBalcone: Camera 1-3 sì, Camera 4-5 no
  apartments: [
    {
      id:                  "cam1",
      label:               "Camera 1",
      subitoTitle:         "",
      naturalAliasPattern: /camera\s*1\b/i,
      numericAlias:        1,
      hasBalcone:          true,
    },
    {
      id:                  "cam2",
      label:               "Camera 2",
      subitoTitle:         "",
      naturalAliasPattern: /camera\s*2\b/i,
      numericAlias:        2,
      hasBalcone:          true,
    },
    {
      id:                  "cam3",
      label:               "Camera 3",
      subitoTitle:         "",
      naturalAliasPattern: /camera\s*3\b/i,
      numericAlias:        3,
      hasBalcone:          true,
    },
    {
      id:                  "cam4",
      label:               "Camera 4",
      subitoTitle:         "",
      naturalAliasPattern: /camera\s*4\b/i,
      numericAlias:        4,
      hasBalcone:          false,
    },
    {
      id:                  "cam5",
      label:               "Camera 5",
      subitoTitle:         "",
      naturalAliasPattern: /camera\s*5\b/i,
      numericAlias:        5,
      hasBalcone:          false,
    },
  ],

  // ── Modello di pricing ───────────────────────────────────────────────────────
  // "nightly" = prezzo per camera/notte (non per settimana)
  // weekly = nightly × 7 per compatibilità con il motore esistente
  pricingModel: "nightly",

  // ── Tariffe stagionali ───────────────────────────────────────────────────────
  // nightly: tariffa base per 1 notte (fino a 2 persone)
  // weekly:  nightly × 7 (mantenuto per compatibilità con il motore)
  // monthly: null — B&B non applica tariffe mese intero
  seasonalRates: {
    1:  { month: "gennaio",    nightly:  80, weekly:  560, monthly: null, season: "low"      },
    2:  { month: "febbraio",   nightly:  80, weekly:  560, monthly: null, season: "low"      },
    3:  { month: "marzo",      nightly:  80, weekly:  560, monthly: null, season: "low"      },
    4:  { month: "aprile",     nightly: 100, weekly:  700, monthly: null, season: "shoulder" },
    5:  { month: "maggio",     nightly: 100, weekly:  700, monthly: null, season: "shoulder" },
    6:  { month: "giugno",     nightly: 120, weekly:  840, monthly: null, season: "shoulder" },
    7:  { month: "luglio",     nightly: 160, weekly: 1120, monthly: null, season: "peak"     },
    8:  { month: "agosto",     nightly: 190, weekly: 1330, monthly: null, season: "peak"     },
    9:  { month: "settembre",  nightly: 130, weekly:  910, monthly: null, season: "shoulder" },
    10: { month: "ottobre",    nightly: 100, weekly:  700, monthly: null, season: "shoulder" },
    11: { month: "novembre",   nightly:  80, weekly:  560, monthly: null, season: "low"      },
    12: { month: "dicembre",   nightly:  80, weekly:  560, monthly: null, season: "low"      },
  },

  // Tariffe eventi speciali
  specialRates: {
    ferragosto: { nightly: 230, label: "Ferragosto (10–18 agosto)" },
    capodanno:  { nightly: 160, label: "Capodanno" },
  },

  // Supplemento ospiti (oltre 2 persone, per notte)
  guestSupplements: {
    baseGuests:          2,
    extraPersonPerNight: 20,
    maxGuests:           4,
  },

  // ── Regole soggiorno ────────────────────────────────────────────────────────
  stayRules: {
    peakMonths:               [7, 8],  // alta stagione senza vincolo sabato-sabato
    validNights:              [],      // nessuna durata fissa obbligatoria
    minNights:                1,
    checkInDayOfWeek:         null,    // qualsiasi giorno
    weekendsAllowed:          true,
    maxAlternativeOffsetDays: 7,
    fullMonthEligible:        false,
    septemberFlexible:        true,
    checkInTime:              "14:00",
    checkOutTime:             "10:00",
  },

  // ── Servizi ─────────────────────────────────────────────────────────────────
  amenities: {
    colazione:        false,
    pulizie:          true,
    biancheria:       true,
    animali:          true,
    ariaCondizionata: true,
    wifi:             true,
    tv:               true,
    angolocottura:    true,
    bagnoprivato:     true,
  },

  // ── Pagamento ────────────────────────────────────────────────────────────────
  paymentRules: {
    depositoPercentuale: 0.30,
    saldo:               "all_arrival",
  },

  // ── Canali (beta) ────────────────────────────────────────────────────────────
  channels: {
    subito:  true,
    airbnb:  true,
    booking: true,
  },

};
