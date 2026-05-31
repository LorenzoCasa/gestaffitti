/**
 * generateGuestReply — replaceable text generator.
 *
 * Stable interface: generateGuestReply(context) → string
 *
 * Today: deterministic template strings.
 * Next step: this file is the ONLY thing that changes when wiring Claude/OpenAI.
 * Future: swap internals for local LLM endpoint.
 * Callers (AgentChat, AgentSection) never change.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES_IT = [
  'gennaio','febbraio','marzo','aprile','maggio','giugno',
  'luglio','agosto','settembre','ottobre','novembre','dicembre',
];

function itMonth(num) {
  return num >= 1 && num <= 12 ? MONTH_NAMES_IT[num - 1] : '—';
}

function itDate(iso) {
  if (!iso) return '—';
  const months = [
    'gennaio','febbraio','marzo','aprile','maggio','giugno',
    'luglio','agosto','settembre','ottobre','novembre','dicembre',
  ];
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function fmtAlternatives(alternatives) {
  if (!alternatives?.items?.length) return '';
  const lines = alternatives.items.map(a => {
    const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : '';
    const apt   = a.aptLabel ? ` — ${a.aptLabel}` : '';
    return `  📅 ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${apt}${price})`;
  });
  return '\n\nPeriodi alternativi disponibili:\n' + lines.join('\n');
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = {

  available({ inquiry, apartment, pricing, availability }) {
    const nights = availability.nights ?? '?';
    const total  = pricing.totalPrice != null ? `€${pricing.totalPrice}` : '(prezzo da confermare)';
    const weekly = pricing.weeklyRate  != null ? ` (€${pricing.weeklyRate}/settimana)` : '';
    return `Salve,
grazie per la sua richiesta per ${apartment.label}!

L'appartamento è disponibile dal ${itDate(inquiry.checkin)} al ${itDate(inquiry.checkout)} (${nights} notti).

💶 Totale: ${total}${weekly}

Per confermare la prenotazione le chiediamo di:
– fornire i dati dei soggiornanti
– versare un acconto

Restiamo a disposizione per qualsiasi informazione.
Cordiali saluti`;
  },

  unavailable({ inquiry, alternatives }) {
    const altsBlock = fmtAlternatives(alternatives);
    return `Salve,
la ringraziamo per l'interesse per il nostro appartamento.
Purtroppo il periodo ${itDate(inquiry.checkin)} – ${itDate(inquiry.checkout)} non è disponibile.${altsBlock}

Restiamo a disposizione per altri periodi.
Cordiali saluti`;
  },

  has_alternatives({ inquiry, alternatives }) {
    const altsBlock = fmtAlternatives(alternatives);
    return `Salve,
la ringraziamo per la sua richiesta.
Il periodo ${itDate(inquiry.checkin)} – ${itDate(inquiry.checkout)} purtroppo non è libero.${altsBlock}

Le interessa una di queste soluzioni?
Cordiali saluti`;
  },

  outside_rules({ inquiry, stayRules }) {
    const sug = (stayRules.suggestedValidRanges ?? []).slice(0, 2).map(r => {
      const price = r.pricing?.totalPrice != null ? `, €${r.pricing.totalPrice}` : '';
      return `  • ${itDate(r.checkin)} – ${itDate(r.checkout)} (${r.nights} notti${price})`;
    }).join('\n');
    return `Salve,
grazie per la sua richiesta.
Per i mesi di giugno, luglio e agosto ospitiamo soggiorni da sabato a sabato, con durate di 7, 14 o 21 notti.

${sug ? `Alcune date compatibili:\n${sug}\n\n` : ''}Possiamo valutare insieme una soluzione adatta alle sue esigenze.
Cordiali saluti`;
  },

  price_negotiation({ inquiry, pricing }) {
    const total = pricing.totalPrice != null ? `€${pricing.totalPrice}` : 'il prezzo di listino';
    return `Salve,
grazie per la sua proposta.
Per il periodo ${itDate(inquiry.checkin)} – ${itDate(inquiry.checkout)} il prezzo è ${total}.

Possiamo valutare la sua offerta: mi faccia sapere se vuole procedere o se ha altre domande.
Cordiali saluti`;
  },

  needs_info({ inquiry }) {
    const extra = inquiry.missingFields?.length
      ? `\nIn particolare ci mancano: ${inquiry.missingFields.join(', ')}.`
      : '';
    return `Salve,
grazie per averci contattato!
Per verificare la disponibilità le chiediamo gentilmente di indicare:
– data di arrivo
– data di partenza
– numero di ospiti
${extra}
Risponderemo al più presto.
Cordiali saluti`;
  },

  full_month({ inquiry, apartment, pricing }) {
    const monthName = itMonth(inquiry.fullMonthNum);
    const price     = pricing.totalPrice != null ? `€${pricing.totalPrice}` : '(prezzo da definire)';
    const guestsLine = !inquiry.guests
      ? '\n\nCi può indicare il numero di ospiti previsto?'
      : '';
    return `Salve,
grazie per la sua richiesta per ${apartment.label}!

Per il mese intero di ${monthName} il prezzo indicativo è ${price}.

Il mese intero è una soluzione valutabile: scriveteci per definire le date precise e verificare la disponibilità sul calendario.${guestsLine}

Restiamo a disposizione.
Cordiali saluti`;
  },

  manual_review() {
    return `Salve,
grazie per il suo messaggio.
Stiamo verificando la disponibilità e le risponderemo entro 24 ore.
Cordiali saluti`;
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a guest reply from an AgentContext.
 *
 * @param {ReturnType<import('./buildAgentContext.js').buildAgentContext>} context
 * @returns {string}
 */
export function generateGuestReply(context) {
  const type = context?.decision?.type ?? 'manual_review';
  const fn   = TEMPLATES[type] ?? TEMPLATES.manual_review;
  return fn(context);
}
