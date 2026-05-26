function moneyOrZero(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function dbToBooking(row) {
  return {
    ...row,
    depositPaid: row.deposit_paid,
    checkinDone: row.checkin_done,
    status: row.status ?? "confirmed",
  };
}

export function bookingToDb(b) {
  return {
    apt: b.apt,
    guest: b.guest,
    email: b.email || "",
    phone: b.phone || "",
    checkin: b.checkin,
    checkout: b.checkout,
    price: moneyOrZero(b.price),
    deposit: moneyOrZero(b.deposit),
    deposit_paid: b.depositPaid || false,
    platform: b.platform,
    notes: b.notes || "",
    cleaning: b.cleaning || false,
    checkin_done: b.checkinDone || false,
    status: b.status ?? "confirmed",
  };
}
