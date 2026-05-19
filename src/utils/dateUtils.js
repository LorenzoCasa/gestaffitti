import { MONTHS_LONG } from "../constants";

export function formatDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export function nightCount(ci, co) {
  if (!ci || !co) return 0;
  return Math.max(0, (new Date(co) - new Date(ci)) / 86400000);
}

export function getPeriodBounds(tab, month, quarter, year) {
  if (tab === "mensile") {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const m = String(month + 1).padStart(2, "0");
    return [`${year}-${m}-01`, `${year}-${m}-${String(lastDay).padStart(2, "0")}`];
  }
  if (tab === "trimestrale") {
    const sm = quarter * 3, em = sm + 2;
    const lastDay = new Date(year, em + 1, 0).getDate();
    return [`${year}-${String(sm+1).padStart(2,"0")}-01`, `${year}-${String(em+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`];
  }
  return [`${year}-01-01`, `${year}-12-31`];
}

export function getPeriodLabel(tab, month, quarter, year) {
  if (tab === "mensile") return `${MONTHS_LONG[month]} ${year}`;
  if (tab === "trimestrale") return `T${quarter + 1} – ${year}`;
  return `${year}`;
}
