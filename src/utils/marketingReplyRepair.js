/**
 * marketingReplyRepair.js — GestAffitti
 *
 * Rilevamento intent marketing + garanzia di completezza bozza annuncio Subito.
 * Funzioni pure — nessun I/O, nessun LLM call, nessuna scrittura DB.
 *
 * Usato da:
 *   - managerAgentLLMContext.js   → per costruire promoReadyDraft da passare nel context
 *   - index.ts (Edge Function)    → per repair post-parse della reply incompleta
 *   - tests/marketingReplyRepair.test.js
 */

import { DEFAULT_HOST_CONFIG } from "../config/hostConfig.js";

// ── Parole chiave che indicano richiesta annuncio/inserzione Subito ────────────

const MARKETING_KEYWORDS = [
  "annuncio",
  "inserzione",
  "messaggio da mettere",
  "testo da mettere",
  "testo per subito",
  "metti su subito",
  "copia su subito",
  "pubblicare su subito",
  "promuovere",
  "promuovi",
  "post per subito",
  "annuncio subito",
];

/**
 * Rileva se il messaggio dell'owner contiene un intent marketing/Subito.
 * @param {string} message
 * @returns {boolean}
 */
export function detectMarketingIntent(message) {
  if (!message || typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return MARKETING_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Pattern che indicano reply senza corpo annuncio reale ─────────────────────

const HOLLOW_PATTERNS = [
  /^eccolo[.!,\s]*/i,
  /^ecco il testo[.!,\s]*/i,
  /^annuncio pronto[.!,\s]*/i,
  /^copia e incolla[.!,\s]*/i,
  /^ecco la bozza[.!,\s]*/i,
  /^perfetto[.!,\s]*/i,
];

/**
 * Controlla se la reply è priva di un corpo annuncio reale.
 * Una reply è "incomplete" se è corta (< 120 chars) o inizia con frasi hollows.
 * @param {string} reply
 * @returns {boolean}
 */
export function isReplyBodyMissing(reply) {
  if (!reply || typeof reply !== "string") return true;
  const trimmed = reply.trim();
  if (trimmed.length < 120) return true;
  return HOLLOW_PATTERNS.some(p => p.test(trimmed));
}

// ── Nomi dei mesi in italiano ─────────────────────────────────────────────────

const MONTH_NAMES = {
  6:  "giugno",
  7:  "luglio",
  8:  "agosto",
  9:  "settembre",
  10: "ottobre",
};

/**
 * Costruisce la bozza testo annuncio Subito per uno slot libero.
 * Equivalente JS di draftSubitoPromotion — usato come fallback testabile.
 *
 * @param {object|null} slot       — da derived.freeSlots[0]
 * @param {object|null} apartment  — { id, label }
 * @returns {{ title, body, fullText }|null}
 */
export function buildFallbackPromoText(slot, apartment, hostConfig = DEFAULT_HOST_CONFIG) {
  if (!slot) return null;

  const aptLabel  = apartment?.label ?? slot.aptLabel ?? "Appartamento";
  const startDay  = parseInt(slot.start.slice(8, 10), 10);
  const endDay    = parseInt(slot.end.slice(8, 10), 10);
  const startMth  = parseInt(slot.start.slice(5, 7), 10);
  const endMth    = parseInt(slot.end.slice(5, 7), 10);

  const smName  = MONTH_NAMES[startMth] ?? "";
  const emName  = MONTH_NAMES[endMth]   ?? "";
  const dateRange = startMth === endMth
    ? `${startDay}–${endDay} ${smName}`
    : `${startDay} ${smName} – ${endDay} ${emName}`;

  const priceLabel = slot.estimatedValue != null
    ? `€${slot.estimatedValue} (da confermare per soggiorni non standard)`
    : "prezzo da confermare";

  const weeksLabel = slot.weeks === 1
    ? "1 settimana"
    : slot.weeks > 1 ? `${slot.weeks} settimane` : `${slot.nights} notti`;

  const title = `🏖 ${aptLabel} — ${dateRange} disponibile`;

  const body = [
    `📅 Periodo: ${dateRange} (${slot.nights} notti / ${weeksLabel})`,
    `💶 Prezzo consigliato: ${priceLabel}`,
    `📍 ${hostConfig.identity.locationLine}`,
    ``,
    `${aptLabel} disponibile per il periodo ${dateRange}.`,
    `Ideale per famiglie o coppie. Posizione fronte mare.`,
    ``,
    `📩 Contattami indicando numero di persone e periodo richiesto. Risposta rapida garantita.`,
  ].join("\n");

  const fullText = `${title}\n\n${body}`;
  return { title, body, fullText, dateRange, priceLabel, weeksLabel };
}

/**
 * Repair post-LLM: se intent marketing rilevato e reply incompleta,
 * inietta la bozza pre-costruita nella reply.
 *
 * @param {object}      brainResponse  — risposta normalizzata { reply, intent, ... }
 * @param {string}      message        — messaggio originale dell'owner
 * @param {object|null} topSlot        — derived.freeSlots[0] (slot più urgente)
 * @param {object|null} apartment      — appartamento corrispondente al topSlot
 * @returns {object}   brainResponse eventualmente riparata
 */
export function repairMarketingReply(brainResponse, message, topSlot, apartment, hostConfig = DEFAULT_HOST_CONFIG) {
  if (!detectMarketingIntent(message)) return brainResponse;
  if (!isReplyBodyMissing(brainResponse?.reply)) return brainResponse;

  const draft = buildFallbackPromoText(topSlot, apartment, hostConfig);
  if (!draft) return brainResponse;

  const intro = brainResponse?.reply?.trim()
    ? `${brainResponse.reply.trim()}\n\n`
    : "";

  return {
    ...brainResponse,
    reply: `${intro}---\n\nTITOLO:\n${draft.title}\n\nTESTO:\n${draft.body}`,
    _marketing_repair: true,
  };
}
