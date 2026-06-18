/**
 * managerAgentActions.js — GestAffitti Manager Agent Command Executor
 *
 * Receives a validated action plan and callback functions from the UI.
 * This is the ONLY place in the Manager Agent that performs DB writes.
 * Never called automatically — always triggered by explicit owner confirmation.
 */

/**
 * Execute a validated action plan.
 *
 * @param {{ type: string, canExecute: boolean, payload: object }} plan
 * @param {{
 *   onAddBooking:    (formData: object) => Promise<{ ok: boolean }>,
 *   onUpdateBooking: (id: string, formData: object) => Promise<{ ok: boolean }>,
 * }} callbacks
 * @returns {Promise<{ success: boolean, message: string, data?: any }>}
 */
export async function executeAction(plan, { onAddBooking, onUpdateBooking } = {}) {
  if (!plan?.canExecute) {
    return { success: false, message: "Azione non eseguibile." };
  }

  const { type, payload } = plan;

  switch (type) {

    case "create_booking": {
      if (!onAddBooking) return { success: false, message: "onAddBooking non disponibile." };
      const formData = {
        apt:         payload.aptId,
        guest:       payload.guest,
        email:       "",
        checkin:     payload.checkin,
        checkout:    payload.checkout,
        price:       payload.price ?? 0,
        deposit:     payload.deposit ?? 0,
        depositPaid: false,
        checkinDone: false,
        cleaning:    false,
        status:      "confirmed",
        platform:    "manuale",
        notes:       "",
        guests:      payload.guests ?? null,
      };
      const result = await onAddBooking(formData);
      if (!result || result.ok === false) {
        const errMsg = result?.error?.message ?? "Errore sconosciuto";
        return { success: false, message: `Errore durante la creazione: ${errMsg}` };
      }
      return { success: true, message: `Prenotazione di ${payload.guest} creata correttamente.` };
    }

    case "mark_deposit_paid": {
      if (!onUpdateBooking) return { success: false, message: "onUpdateBooking non disponibile." };
      const updated = { ...payload.booking, depositPaid: true };
      const result = await onUpdateBooking(payload.booking.id, updated);
      if (result?.ok === false) {
        return { success: false, message: `Errore: ${result.error?.message ?? "sconosciuto"}` };
      }
      return { success: true, message: `Caparra di ${payload.booking.guest} segnata come ricevuta.` };
    }

    case "mark_checkin_done": {
      if (!onUpdateBooking) return { success: false, message: "onUpdateBooking non disponibile." };
      const updated = { ...payload.booking, checkinDone: true };
      const result = await onUpdateBooking(payload.booking.id, updated);
      if (result?.ok === false) {
        return { success: false, message: `Errore: ${result.error?.message ?? "sconosciuto"}` };
      }
      return { success: true, message: `Check-in di ${payload.booking.guest} registrato.` };
    }

    case "cancel_booking": {
      if (!onUpdateBooking) return { success: false, message: "onUpdateBooking non disponibile." };
      const updated = { ...payload.booking, status: "cancelled" };
      const result = await onUpdateBooking(payload.booking.id, updated);
      if (result?.ok === false) {
        return { success: false, message: `Errore: ${result.error?.message ?? "sconosciuto"}` };
      }
      return { success: true, message: `Prenotazione di ${payload.booking.guest} cancellata.` };
    }

    default:
      return { success: false, message: `Tipo azione non gestito: ${type}` };
  }
}
