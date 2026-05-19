export function dbToBooking(row) {
  return { ...row, depositPaid: row.deposit_paid, checkinDone: row.checkin_done };
}

export function bookingToDb(b) {
  return {
    apt: b.apt, guest: b.guest, email: b.email || "", phone: b.phone || "",
    checkin: b.checkin, checkout: b.checkout, price: Number(b.price) || 0,
    deposit: Number(b.deposit) || 0, deposit_paid: b.depositPaid || false,
    platform: b.platform, notes: b.notes || "", cleaning: b.cleaning || false,
    checkin_done: b.checkinDone || false,
  };
}
