/**
 * managerAgentSnapshot.js — GestAffitti Manager Agent v1
 *
 * Pure function: no I/O, no side effects, no async, no data invention.
 * Reads real data passed in and produces a structured operational snapshot.
 *
 * Call: getManagerAgentSnapshot({ inbox, decisions, bookings, apartments, today })
 *
 * The caller (UI, test, or future API endpoint) is responsible for
 * fetching data from Supabase and passing it in.
 */

import { groupInboxByThread } from './groupInboxByThread.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_INBOX_STATUSES  = new Set(['new', 'processing']);
const ACTIVE_BOOKING_STATUSES = new Set(['confirmed', 'pending_payment']);

// Decisions that need human review
const REVIEW_DECISION_TYPES   = new Set(['manual_review', 'needs_info']);
// Decisions that represent a positive lead (potential booking)
const OPPORTUNITY_TYPES       = new Set(['available', 'has_alternatives', 'outside_rules', 'full_month', 'price_negotiation']);

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(from, to) {
  return Math.round(
    (new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000,
  );
}

// ── Field accessors — handle both snake_case (DB) and camelCase (dbToBooking) ──

function depositPaid(b) { return !!(b.deposit_paid ?? b.depositPaid); }
function checkinDone(b)  { return !!(b.checkin_done ?? b.checkinDone); }

// ── Decision lookup helpers ───────────────────────────────────────────────────

/**
 * Effective decision type: prefer raw_decision_type from payload (pre-normalization)
 * over the DB-stored decision_type (which maps everything non-standard to manual_review).
 */
function effectiveDecisionType(decision) {
  if (!decision) return null;
  return decision.payload?.raw_decision_type ?? decision.decision_type ?? null;
}

/**
 * Find the most recent agent_decision for a set of inbox IDs.
 * Returns null if none found.
 */
function latestDecisionForIds(inboxIds, decisionIndex) {
  const found = inboxIds
    .map(id => decisionIndex[id])
    .filter(Boolean)
    .sort((a, b) => (b.created_at ?? '') > (a.created_at ?? '') ? 1 : -1);
  return found[0] ?? null;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Build an operational snapshot of the current GestAffitti state.
 *
 * @param {{
 *   inbox?:      Array,   – rows from agent_inbox
 *   decisions?:  Array,   – rows from agent_decisions
 *   bookings?:   Array,   – rows from bookings (snake_case or camelCase)
 *   apartments?: Array,   – rows from apartments
 *   today?:      string,  – "YYYY-MM-DD" (injectable for testing)
 * }} input
 *
 * @returns {{
 *   messages_to_review:    Array,
 *   pending_opportunities: Array,
 *   upcoming_arrivals:     Array,
 *   current_guests:        Array,
 *   calendar_alerts:       Array,
 *   suggested_actions:     Array,
 *   revenue_notes:         Array,
 *   agent_summary:         string,
 *   _meta:                 object,
 * }}
 */
export function getManagerAgentSnapshot({
  inbox      = [],
  decisions  = [],
  bookings   = [],
  apartments = [],
  today      = new Date().toISOString().slice(0, 10),
} = {}) {

  // ── Index decisions by inbox_id for O(1) lookup ─────────────────────────
  const decisionIndex = Object.fromEntries(decisions.map(d => [d.inbox_id, d]));

  // ── Active bookings ──────────────────────────────────────────────────────
  const activeBookings = bookings.filter(b => ACTIVE_BOOKING_STATUSES.has(b.status ?? 'confirmed'));

  // ── Group inbox into threads, keep only active (unresolved) ─────────────
  const allThreads    = groupInboxByThread(inbox);
  const activeThreads = allThreads.filter(t => t.hasNewMessages);

  // Enrich each active thread with its best available decision
  const enrichedThreads = activeThreads.map(thread => {
    const decision      = latestDecisionForIds(thread.allIds, decisionIndex);
    const decisionType  = effectiveDecisionType(decision);
    return { thread, decision, decisionType };
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  1. messages_to_review
  //     Active threads where decision is manual_review, needs_info, or missing.
  // ─────────────────────────────────────────────────────────────────────────
  const messages_to_review = enrichedThreads
    .filter(({ decision, decisionType }) =>
      !decision || REVIEW_DECISION_TYPES.has(decisionType),
    )
    .map(({ thread, decisionType }) => ({
      inboxId:       thread.latestMessage.id,
      threadId:      thread.threadId,
      source:        thread.source,
      aptId:         thread.latestMessage.apt_id ?? thread.apt_id ?? null,
      decisionType:  decisionType ?? 'no_decision',
      receivedAt:    thread.lastActivityAt,
      guestName:     thread.parsed_guest_name ?? null,
      preview:       (thread.latestMessage.raw_text ?? '').slice(0, 120).trim(),
    }));

  // ─────────────────────────────────────────────────────────────────────────
  //  2. pending_opportunities
  //     Active threads with a positive decision not yet converted to booking.
  // ─────────────────────────────────────────────────────────────────────────
  const pending_opportunities = enrichedThreads
    .filter(({ decisionType }) => OPPORTUNITY_TYPES.has(decisionType))
    .map(({ thread, decision, decisionType }) => ({
      inboxId:      thread.latestMessage.id,
      threadId:     thread.threadId,
      source:       thread.source,
      aptId:        thread.latestMessage.apt_id ?? thread.apt_id ?? null,
      decisionType,
      pricingTotal: decision?.payload?.context_snapshot?.pricing_total ?? null,
      receivedAt:   thread.lastActivityAt,
      guestName:    thread.parsed_guest_name ?? null,
    }));

  // ─────────────────────────────────────────────────────────────────────────
  //  3. upcoming_arrivals (next 7 days)
  // ─────────────────────────────────────────────────────────────────────────
  const sevenDaysOut = addDays(today, 7);
  const upcoming_arrivals = activeBookings
    .filter(b => b.checkin >= today && b.checkin <= sevenDaysOut)
    .sort((a, b) => a.checkin.localeCompare(b.checkin))
    .map(b => ({
      bookingId:   b.id,
      apt:         b.apt,
      guest:       b.guest,
      checkin:     b.checkin,
      checkout:    b.checkout,
      nights:      nightsBetween(b.checkin, b.checkout),
      price:       Number(b.price ?? 0),
      depositPaid: depositPaid(b),
      checkinDone: checkinDone(b),
      platform:    b.platform ?? null,
      daysUntil:   nightsBetween(today, b.checkin),
    }));

  // ─────────────────────────────────────────────────────────────────────────
  //  4. current_guests  (checkin ≤ today < checkout)
  // ─────────────────────────────────────────────────────────────────────────
  const current_guests = activeBookings
    .filter(b => b.checkin <= today && b.checkout > today)
    .sort((a, b) => a.checkout.localeCompare(b.checkout))
    .map(b => ({
      bookingId:    b.id,
      apt:          b.apt,
      guest:        b.guest,
      checkin:      b.checkin,
      checkout:     b.checkout,
      checkoutIn:   nightsBetween(today, b.checkout),
      price:        Number(b.price ?? 0),
      checkinDone:  checkinDone(b),
    }));

  // ─────────────────────────────────────────────────────────────────────────
  //  5. calendar_alerts
  // ─────────────────────────────────────────────────────────────────────────
  const calendar_alerts = [];

  // 5a. Guest is currently staying but checkin not recorded
  for (const g of current_guests) {
    if (!g.checkinDone) {
      calendar_alerts.push({
        type:      'missed_checkin',
        severity:  'high',
        message:   `Check-in di ${g.guest} (${g.apt}) del ${g.checkin} non ancora registrato`,
        bookingId: g.bookingId,
        apt:       g.apt,
        guest:     g.guest,
        date:      g.checkin,
      });
    }
  }

  // 5b. Checkin is today or yesterday and checkin_done = false (just arrived or arrived yesterday)
  const yesterday = addDays(today, -1);
  for (const b of activeBookings) {
    if ((b.checkin === today || b.checkin === yesterday) && !checkinDone(b)) {
      // Avoid duplicating with current_guests loop above
      const alreadyAdded = calendar_alerts.some(a => a.bookingId === b.id && a.type === 'missed_checkin');
      if (!alreadyAdded) {
        calendar_alerts.push({
          type:      'missed_checkin',
          severity:  'medium',
          message:   `Check-in di ${b.guest} (${b.apt}) del ${b.checkin} non registrato`,
          bookingId: b.id,
          apt:       b.apt,
          guest:     b.guest,
          date:      b.checkin,
        });
      }
    }
  }

  // 5c. Imminent arrival (≤ 3 days) without deposit
  const threeDaysOut = addDays(today, 3);
  for (const b of activeBookings) {
    if (b.checkin >= today && b.checkin <= threeDaysOut && !depositPaid(b)) {
      calendar_alerts.push({
        type:      'deposit_pending',
        severity:  'medium',
        message:   `Caparra non ricevuta — ${b.guest} (${b.apt}) arriva tra ${nightsBetween(today, b.checkin)} giorni`,
        bookingId: b.id,
        apt:       b.apt,
        guest:     b.guest,
        date:      b.checkin,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  6. suggested_actions (prioritized)
  // ─────────────────────────────────────────────────────────────────────────
  const suggested_actions = [];

  // P1: calendar alerts (high severity)
  for (const alert of calendar_alerts) {
    if (alert.severity === 'high') {
      suggested_actions.push({
        priority: 1,
        category: 'calendar',
        action:   alert.message,
        ref:      { bookingId: alert.bookingId, type: alert.type },
      });
    }
  }

  // P2: imminent arrivals (≤ 3 days) + medium alerts
  for (const arr of upcoming_arrivals.filter(a => a.daysUntil <= 3)) {
    suggested_actions.push({
      priority: 2,
      category: 'arrival',
      action:   `Preparare check-in ${arr.guest} (${arr.apt}) — ${arr.daysUntil === 0 ? 'OGGI' : `tra ${arr.daysUntil} giorno/i`}`,
      ref:      { bookingId: arr.bookingId },
    });
  }
  for (const alert of calendar_alerts.filter(a => a.severity === 'medium')) {
    suggested_actions.push({
      priority: 2,
      category: 'calendar',
      action:   alert.message,
      ref:      { bookingId: alert.bookingId, type: alert.type },
    });
  }

  // P3: pending opportunities (could become bookings)
  const OPP_LABELS = {
    available:        'Disponibile',
    has_alternatives: 'Alternative disponibili',
    full_month:       'Mese intero',
    outside_rules:    'Date fuori regola',
    price_negotiation:'Proposta prezzo in attesa',
  };
  for (const opp of pending_opportunities) {
    const label    = OPP_LABELS[opp.decisionType] ?? opp.decisionType;
    const priceTag = opp.pricingTotal ? ` — €${opp.pricingTotal}` : '';
    suggested_actions.push({
      priority: 3,
      category: 'opportunity',
      action:   `Rispondere su ${opp.source} (${opp.aptId ?? '?'}): ${label}${priceTag}`,
      ref:      { inboxId: opp.inboxId },
    });
  }

  // P4: messages needing manual review
  for (const msg of messages_to_review) {
    const label = msg.decisionType === 'no_decision'
      ? 'nessuna analisi automatica'
      : msg.decisionType;
    suggested_actions.push({
      priority: 4,
      category: 'message',
      action:   `Revisione manuale richiesta — ${msg.source} (${msg.aptId ?? '?'}): ${label}`,
      ref:      { inboxId: msg.inboxId },
    });
  }

  suggested_actions.sort((a, b) => a.priority - b.priority || 0);

  // ─────────────────────────────────────────────────────────────────────────
  //  7. revenue_notes
  // ─────────────────────────────────────────────────────────────────────────
  const revenue_notes = [];

  const thirtyDaysOut      = addDays(today, 30);
  const upcomingRevenue    = activeBookings
    .filter(b => b.checkin >= today && b.checkin <= thirtyDaysOut)
    .reduce((s, b) => s + Number(b.price ?? 0), 0);
  if (upcomingRevenue > 0) {
    revenue_notes.push({
      type:  'upcoming_revenue',
      note:  `Entrate confermate prossimi 30 giorni: €${upcomingRevenue}`,
      value: upcomingRevenue,
    });
  }

  const pendingDepositsTotal = activeBookings
    .filter(b => b.checkin >= today && !depositPaid(b))
    .reduce((s, b) => s + Number(b.deposit ?? 0), 0);
  if (pendingDepositsTotal > 0) {
    revenue_notes.push({
      type:  'pending_deposits',
      note:  `Caparre da ricevere: €${pendingDepositsTotal}`,
      value: pendingDepositsTotal,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  8. agent_summary (testo operativo in italiano)
  // ─────────────────────────────────────────────────────────────────────────
  const lines = [];
  if (current_guests.length > 0) {
    lines.push(`👤 ${current_guests.length} ospite/i attualmente in appartamento.`);
  }
  if (upcoming_arrivals.length > 0) {
    const today_ = upcoming_arrivals.filter(a => a.daysUntil === 0);
    if (today_.length > 0) {
      lines.push(`🔑 ${today_.length} check-in OGGI.`);
    }
    lines.push(`📅 ${upcoming_arrivals.length} arrivo/i nei prossimi 7 giorni.`);
  }
  if (calendar_alerts.filter(a => a.severity === 'high').length > 0) {
    lines.push(`🚨 ${calendar_alerts.filter(a => a.severity === 'high').length} alert urgenti sul calendario.`);
  }
  if (pending_opportunities.length > 0) {
    lines.push(`💬 ${pending_opportunities.length} richiesta/e con opportunità da confermare.`);
  }
  if (messages_to_review.length > 0) {
    lines.push(`⚠️ ${messages_to_review.length} messaggio/i da revisionare manualmente.`);
  }
  if (calendar_alerts.filter(a => a.type === 'deposit_pending').length > 0) {
    lines.push(`💶 ${calendar_alerts.filter(a => a.type === 'deposit_pending').length} caparra/e in attesa.`);
  }
  if (lines.length === 0) {
    lines.push('✅ Nessuna azione urgente. Tutto sotto controllo.');
  }

  const agent_summary = lines.join('\n');

  // ─────────────────────────────────────────────────────────────────────────
  //  Output
  // ─────────────────────────────────────────────────────────────────────────
  return {
    messages_to_review,
    pending_opportunities,
    upcoming_arrivals,
    current_guests,
    calendar_alerts,
    suggested_actions,
    revenue_notes,
    agent_summary,
    _meta: {
      generated_at:        today,
      active_threads:      activeThreads.length,
      total_inbox:         inbox.length,
      active_bookings:     activeBookings.length,
      apartments_count:    apartments.filter(a => a.id !== 'all').length,
    },
  };
}
