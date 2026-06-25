import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

// Parole troppo generiche per identificare un appartamento
const GENERIC = new Set([
  "appartamento","casa","mare","affitto","stanza","camera",
  "alloggio","locale","bilocale","trilocale","villa","monolocale",
  "il","la","lo","le","gli","i","un","una","di","da","in","a","e","con",
]);

function distinctiveWords(label) {
  return label
    .toLowerCase()
    .split(/[\s\-_/,.()+]+/)
    .filter(w => w.length >= 3 && !GENERIC.has(w));
}

/**
 * Estrae il miglior candidato per il titolo annuncio da raw_metadata.
 * Prova in ordine: listing_title → email_subject → subject.
 * NON usa raw_text: è il corpo del messaggio cliente, non il titolo annuncio.
 *
 * @param {object|null} rawMetadata
 * @returns {string|null}
 */
export function extractListingTitle(rawMetadata) {
  if (!rawMetadata) return null;
  return (
    rawMetadata.listing_title ||
    rawMetadata.email_subject ||
    rawMetadata.subject ||
    null
  ) || null;
}

/**
 * Risolve l'appartamento dal titolo annuncio.
 * Restituisce aptId se sicuro, null se non riconosciuto.
 *
 * @param {string|null} listingTitle
 * @param {Array<{id:string, label:string}>} apartments
 * @param {object|null} mappings  — futuro: { listingId → aptId }
 * @param {object} hostConfig
 * @returns {string|null}
 */
export function resolveListingFromTitle(
  listingTitle,
  apartments,
  mappings = null,
  hostConfig = DEFAULT_HOST_CONFIG,
) {
  if (!listingTitle) return null;

  const title = listingTitle.toLowerCase().trim();

  // Step 0: mapping esplicito da hostConfig (priorità massima)
  for (const apt of hostConfig.apartments) {
    if (apt.subitoTitle && (title === apt.subitoTitle || title.includes(apt.subitoTitle))) {
      return apt.id;
    }
  }

  // Futuro: mappings dinamici da DB
  if (mappings) {
    // TODO: implementare quando agent_listing_mappings sarà disponibile
  }

  if (!apartments?.length) return null;

  // 1. Match esatto sull'intera label
  for (const apt of apartments) {
    if (title.includes(apt.label.toLowerCase())) return apt.id;
  }

  // 2. Tutte le parole distintive della label devono apparire nel titolo
  const matches = [];
  for (const apt of apartments) {
    const words = distinctiveWords(apt.label);
    if (words.length === 0) continue;
    const found = words.filter(w => title.includes(w));
    if (found.length === words.length) {
      matches.push(apt.id);
    }
  }

  // Solo se match univoco
  if (matches.length === 1) return matches[0];

  return null;
}
