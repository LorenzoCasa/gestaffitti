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
 * Risolve l'appartamento dal titolo annuncio (raw_metadata.listing_title).
 * Restituisce aptId se sicuro, null se non lo è.
 *
 * @param {string|null} listingTitle  — raw_metadata.listing_title
 * @param {Array<{id:string, label:string}>} apartments
 * @param {object|null} mappings  — futuro: { listingId → aptId }
 * @returns {string|null}
 */
export function resolveListingFromTitle(listingTitle, apartments, mappings = null) {
  if (!listingTitle || !apartments?.length) return null;

  // Futuro: mappings espliciti avranno priorità
  if (mappings) {
    // TODO: implementare quando agent_listing_mappings sarà disponibile
  }

  const title = listingTitle.toLowerCase();

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
