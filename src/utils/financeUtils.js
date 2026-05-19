export function expInPeriod(expense, periodStart, periodEnd) {
  const d = expense.date;
  if (!d) return 0;
  return (d >= periodStart && d <= periodEnd) ? Number(expense.amount) : 0;
}

export function fmtEur(n) {
  return Math.round(n).toLocaleString("it-IT");
}
