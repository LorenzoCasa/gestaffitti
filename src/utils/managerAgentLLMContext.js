/**
 * managerAgentLLMContext.js — GestAffitti Manager Agent LLM Context Builder
 *
 * Pure functions: no I/O, no side effects, no async.
 *
 * buildManagerAgentLLMContext({ inbox, decisions, bookings, apartments, snapshot,
 *   selectedThreadId, selectedBookingId, today })
 *   → compact context object for the manager-agent-brain Edge Function
 *
 * validateLLMActionPlan(actionPlan, { bookings, apartments, today })
 *   → { valid: boolean, plan?: object, error?: string }
 *   Validates an LLM-proposed action_plan against real data before executeAction.
 */

import { checkAvailability } from "./agentAvailability.js";
import { buildMarketIntelligenceContext } from "./marketIntelligenceLayer.js";
import { buildLegalMarketContext } from "./legalMarketPricingEngine.js";

// ── buildManagerAgentLLMContext ───────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["confirmed", "pending_payment"]);

export function buildManagerAgentLLMContext({
  inbox       = [],
  decisions   = [],
  bookings    = [],
  apartments  = [],
  snapshot    = null,
  selectedThreadId  = null,
  selectedBookingId = null,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  // Decision index by inbox_id for O(1) lookup
  const decisionIndex = Object.fromEntries(decisions.map((d) => [d.inbox_id, d]));

  // Active bookings: only future/current, sorted by checkin, max 25
  const relevantBookings = bookings
    .filter((b) => ACTIVE_STATUSES.has(b.status) && b.checkout >= today)
    .sort((a, b) => a.checkin.localeCompare(b.checkin))
    .slice(0, 25)
    .map((b) => ({
      id:          b.id,
      apt:         b.apt,
      guest:       b.guest,
      checkin:     b.checkin,
      checkout:    b.checkout,
      status:      b.status,
      depositPaid: !!(b.deposit_paid ?? b.depositPaid),
      checkinDone: !!(b.checkin_done ?? b.checkinDone),
      price:       Number(b.price ?? 0),
      deposit:     Number(b.deposit ?? 0),
    }));

  // Recent inbox: most recent first, max 15
  const recentInbox = [...inbox]
    .sort((a, b) => (b.created_at ?? "") > (a.created_at ?? "") ? 1 : -1)
    .slice(0, 15)
    .map((item) => {
      const dec = decisionIndex[item.id] ?? null;
      const decType = dec?.payload?.raw_decision_type ?? dec?.decision_type ?? null;
      const csn = dec?.payload?.context_snapshot ?? null;
      return {
        id:          item.id,
        apt_id:      item.apt_id ?? null,
        guest:       item.parsed_guest_name ?? item.raw_metadata?.parsed_guest_name ?? null,
        status:      item.status,
        source:      item.source,
        preview:     (item.raw_text ?? "").slice(0, 150).trim(),
        received_at: item.created_at?.slice(0, 10) ?? null,
        decision: dec ? {
          id:      dec.id,
          type:    decType,
          checkin:  csn?.inquiry?.checkin  ?? null,
          checkout: csn?.inquiry?.checkout ?? null,
          apt_id:   csn?.inquiry?.aptId    ?? null,
          price:    csn?.pricing?.totalPrice ?? null,
        } : null,
      };
    });

  // Apartments without the "all" virtual entry
  const aptList = apartments
    .filter((a) => a.id !== "all")
    .map((a) => ({ id: a.id, label: a.label }));

  // Snapshot: compact version (avoid sending raw arrays of hundreds of items)
  const snapshotCompact = snapshot ? {
    summary:              snapshot.agent_summary ?? "",
    suggested_actions:    (snapshot.suggested_actions  ?? []).slice(0, 8).map((a) => ({ priority: a.priority, action: a.action })),
    pending_opportunities:(snapshot.pending_opportunities ?? []).slice(0, 5),
    messages_to_review:   (snapshot.messages_to_review   ?? []).slice(0, 5),
    upcoming_arrivals:    (snapshot.upcoming_arrivals     ?? []).slice(0, 7),
    current_guests:       (snapshot.current_guests        ?? []).slice(0, 5),
    calendar_alerts:      (snapshot.calendar_alerts       ?? []).slice(0, 8),
  } : null;

  return {
    today,
    apartments:             aptList,
    bookings:               relevantBookings,
    inbox:                  recentInbox,
    snapshot:               snapshotCompact,
    selectedThreadId,
    selectedBookingId,
    market_context:         buildMarketIntelligenceContext(),
    market_pricing_context: buildLegalMarketContext(),
  };
}

// ── validateLLMActionPlan ─────────────────────────────────────────────────────

/**
 * Validate and resolve an LLM-proposed action_plan against real app data.
 *
 * Returns:
 *   { valid: true,  plan: { type, canExecute: true, payload } }  — ready for executeAction
 *   { valid: false, error: string }                              — block + show error
 *
 * This is the deterministic firewall between the LLM proposal and any DB write.
 */
export function validateLLMActionPlan(
  actionPlan,
  { bookings = [], apartments = [], today = new Date().toISOString().slice(0, 10) } = {},
) {
  if (!actionPlan || typeof actionPlan.type !== "string") {
    return { valid: false, error: "action_plan mancante o tipo non specificato." };
  }

  const { type, payload } = actionPlan;

  switch (type) {

    case "mark_deposit_paid": {
      const booking = bookings.find((b) => b.id === payload?.bookingId);
      if (!booking) return { valid: false, error: `Prenotazione non trovata (ID: ${payload?.bookingId}).` };
      if (booking.depositPaid || booking.deposit_paid) {
        return { valid: false, error: `Caparra di ${booking.guest} è già segnata come ricevuta.` };
      }
      return { valid: true, plan: { type: "mark_deposit_paid", canExecute: true, payload: { booking } } };
    }

    case "mark_checkin_done": {
      const booking = bookings.find((b) => b.id === payload?.bookingId);
      if (!booking) return { valid: false, error: `Prenotazione non trovata (ID: ${payload?.bookingId}).` };
      if (booking.checkinDone || booking.checkin_done) {
        return { valid: false, error: `Check-in di ${booking.guest} è già registrato.` };
      }
      return { valid: true, plan: { type: "mark_checkin_done", canExecute: true, payload: { booking } } };
    }

    case "cancel_booking": {
      const booking = bookings.find((b) => b.id === payload?.bookingId);
      if (!booking) return { valid: false, error: `Prenotazione non trovata (ID: ${payload?.bookingId}).` };
      if (booking.status === "cancelled") {
        return { valid: false, error: `La prenotazione di ${booking.guest} è già annullata.` };
      }
      return { valid: true, plan: { type: "cancel_booking", canExecute: true, payload: { booking } } };
    }

    case "create_booking": {
      const apt = apartments.find((a) => a.id === payload?.aptId && a.id !== "all");
      if (!apt) return { valid: false, error: `Appartamento "${payload?.aptId}" non trovato.` };
      if (!payload?.guest)    return { valid: false, error: "Nome ospite mancante." };
      if (!payload?.checkin)  return { valid: false, error: "Data check-in mancante." };
      if (!payload?.checkout) return { valid: false, error: "Data check-out mancante." };
      if (payload.checkin >= payload.checkout) {
        return { valid: false, error: "Data check-out deve essere successiva al check-in." };
      }

      const avail = checkAvailability(
        { aptId: payload.aptId, checkin: payload.checkin, checkout: payload.checkout },
        bookings,
        {},
      );
      if (!avail.available) {
        return { valid: false, error: `${apt.label} non è disponibile nel periodo ${payload.checkin} → ${payload.checkout}.` };
      }

      return {
        valid: true,
        plan: {
          type: "create_booking",
          canExecute: true,
          payload: {
            aptId:    payload.aptId,
            guest:    payload.guest,
            checkin:  payload.checkin,
            checkout: payload.checkout,
            price:    Number(payload.price  ?? 0),
            deposit:  Number(payload.deposit ?? 0),
            guests:   payload.guests ?? null,
          },
        },
      };
    }

    default:
      return { valid: false, error: `Tipo azione non supportato: ${type}.` };
  }
}
