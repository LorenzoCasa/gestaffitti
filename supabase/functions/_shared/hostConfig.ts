// ── hostConfig.ts — GestAffitti Edge Function Config (Lorenzo/Senigallia)
//
// Fonte di verità per le costanti host nelle Edge Functions Supabase/Deno.
// Mantieni allineato con: src/config/hostConfig.js
//
// Le Edge Functions non possono importare da src/ — questa è la copia edge-safe.
// Nessun RegExp: tutti i valori sono JSON-serializzabili.

export const EDGE_SEASONAL_RATES: Record<number, { weekly: number; monthly: number; month: string; season: string }> = {
  6: { weekly: 500,  monthly: 1600, month: "giugno",    season: "shoulder" },
  7: { weekly: 800,  monthly: 2600, month: "luglio",    season: "peak"     },
  8: { weekly: 800,  monthly: 2600, month: "agosto",    season: "peak"     },
  9: { weekly: 500,  monthly: 1500, month: "settembre", season: "shoulder" },
};

export const EDGE_PEAK_MONTHS: readonly number[] = [6, 7, 8];

export const EDGE_VALID_NIGHTS: readonly number[] = [7, 14, 21];

export const EDGE_SUBITO_TITLE_MAP: Record<string, string> = {
  "lungomare senigallia appartamento estivo 1": "apt1",
  "lungomare senigallia appartamento estivo 2": "apt2",
};

export const EDGE_HOST_IDENTITY = {
  businessName: "Lorenzo Casavecchia",
  city:         "Senigallia",
  area:         "Lungomare",
  region:       "Marche",
  locationLine: "Lungomare Senigallia, Spiaggia di Velluto",
  // UUID del proprietario in auth.users — usato per owner_id in agent_inbox.
  // Aggiornare qui se il webhook viene riconfigurato per un host diverso.
  ownerUUID:    "adf5d712-f332-43bd-b3ee-8f93b920d860",
} as const;
