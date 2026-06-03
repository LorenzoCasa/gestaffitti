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

  unavailable({ inquiry, apartment }) {
    return `Salve,
la ringraziamo per l'interesse per ${apartment.label}.
Purtroppo il periodo ${itDate(inquiry.checkin)} – ${itDate(inquiry.checkout)} non è disponibile.

Restiamo a disposizione per altri periodi.
Cordiali saluti`;
  },

  has_alternatives({ inquiry, apartment, alternatives }) {
    const sameAptAlts  = alternatives.items.filter(a => a.aptId === inquiry.aptId);
    const otherAptAlts = alternatives.items.filter(a => a.aptId !== inquiry.aptId);

    let body = `Il periodo ${itDate(inquiry.checkin)} – ${itDate(inquiry.checkout)} per ${apartment.label} purtroppo non è libero.`;

    if (sameAptAlts.length > 0) {
      const lines = sameAptAlts.map(a => {
        const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : '';
        return `  📅 ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${price})`;
      });
      body += '\n\nPeriodi alternativi per lo stesso appartamento:\n' + lines.join('\n');
    }

    if (otherAptAlts.length > 0) {
      const lines = otherAptAlts.map(a => {
        const price = a.pricing?.totalPrice != null ? `, €${a.pricing.totalPrice}` : '';
        return `  📅 ${a.aptLabel}: ${itDate(a.checkin)} – ${itDate(a.checkout)} (${a.nights} notti${price})`;
      });
      body += '\n\nIn alternativa possiamo proporle un altro appartamento:\n' + lines.join('\n');
    }

    return `Salve,\nla ringraziamo per la sua richiesta.\n${body}\n\nLe interessa una di queste soluzioni?\nCordiali saluti`;
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

  needs_info({ inquiry, apartment }) {
    const {
      requestedMonth, requestedNights, requestedWeekPosition,
      isFlexibleDatesRequest, monthWindows,
    } = inquiry;

    // ── Caso A: mese noto + finestre trovate ──────────────────────────────────
    if (isFlexibleDatesRequest && requestedMonth && requestedNights && monthWindows?.length > 0) {
      const monthName   = itMonth(requestedMonth);
      const nightsLabel = requestedNights === 7  ? 'una settimana'
                        : requestedNights === 14 ? 'due settimane'
                        : requestedNights === 21 ? 'tre settimane'
                        : `${requestedNights} notti`;
      const aptLine = apartment?.label ? ` per ${apartment.label}` : '';
      const lines = monthWindows.map(w => {
        const price = w.pricing?.totalPrice != null ? `, €${w.pricing.totalPrice}` : '';
        return `  📅 ${itDate(w.checkin)} – ${itDate(w.checkout)} (${w.nights} notti${price})`;
      });
      return `Salve,
grazie per la sua richiesta${aptLine}!

Per ${nightsLabel} in ${monthName} abbiamo queste disponibilità:

${lines.join('\n')}

Le interessa uno di questi periodi? Restiamo a disposizione.
Cordiali saluti`;
    }

    // ── Caso B: mese noto + finestre cercate ma nessuna libera ───────────────
    if (isFlexibleDatesRequest && requestedMonth && requestedNights && monthWindows !== null && monthWindows.length === 0) {
      const monthName   = itMonth(requestedMonth);
      const nightsLabel = requestedNights === 7  ? 'una settimana'
                        : requestedNights === 14 ? 'due settimane'
                        : requestedNights === 21 ? 'tre settimane'
                        : `${requestedNights} notti`;
      const aptLine = apartment?.label ? ` per ${apartment.label}` : '';
      return `Salve,
grazie per la sua richiesta.
Purtroppo per ${monthName} (${nightsLabel}) non risultano disponibilità${aptLine}.

Può valutare altri periodi o settimane diverse? Restiamo a disposizione.
Cordiali saluti`;
    }

    // ── Caso C: mese noto ma durata non specificata (es. "disponibilità ad agosto?") ──
    if (isFlexibleDatesRequest && requestedMonth) {
      const monthName = itMonth(requestedMonth);
      const aptLine   = apartment?.label ? ` per ${apartment.label}` : '';
      return `Salve,
grazie per la sua richiesta${aptLine}!

Per verificare la disponibilità in ${monthName} può indicarci:
– il periodo preferito (es. prima o seconda settimana)
– il numero di settimane
– numero di ospiti previsto

Lavoriamo principalmente con soggiorni da sabato a sabato (7, 14 o 21 notti).
Restiamo a disposizione.
Cordiali saluti`;
    }

    // ── Caso D: standard needs_info (nessun mese riconosciuto) ───────────────
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
