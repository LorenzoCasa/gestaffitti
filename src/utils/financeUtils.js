import { COMMISSIONS } from "../constants";

// ── Category classification fallbacks ─────────────────────────────────────────
// Used when expense_categories from Supabase have type/scope/affects_profit = null.
// These mirror the intent of the DB schema and must stay aligned with the
// actual values once the expense_categories table is populated (Sprint 2).
const FISCAL_CAT_NAMES     = ["IMU", "TARI"];
const VARIABLE_CAT_NAMES   = ["Pulizie", "Manutenzione", "Dotazioni", "Altro"];
const COMMISSION_CAT_NAMES = ["Commissioni piattaforma"];

// Platforms whose bookings are included in the cedolare secca tax base by default.
const TAXABLE_PLATFORMS_DEFAULT = ["Airbnb", "Booking"];

// Platforms that already withhold cedolare and remit it directly to
// Agenzia delle Entrate (Airbnb Italy, since 2017).
// The owner's actual cash liability excludes their portion.
const WITHHELD_PLATFORMS = ["Airbnb"];

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a single expense category's financial classification metadata.
 *
 * Priority: Supabase data (when type ≠ null) > name-based constants fallback.
 *
 * @param {string}  categoryName
 * @param {Array}   categories  – expense_categories array from Supabase
 * @returns {{ type: string, scope: string, affects_profit: boolean }}
 */
function resolveCategoryMeta(categoryName, categories) {
  const cat = categories.find(c => c.name === categoryName);

  // Supabase record has real values → use them
  if (cat && cat.type !== null) {
    return {
      type:           cat.type,
      scope:          cat.scope,
      affects_profit: cat.affects_profit,
    };
  }

  // Fallback: derive from the known constant lists
  if (FISCAL_CAT_NAMES.includes(categoryName)) {
    // scope = "fiscal": separate dimension, not apartment nor property-operational
    return { type: "fiscal",     scope: "fiscal",    affects_profit: true };
  }
  if (COMMISSION_CAT_NAMES.includes(categoryName)) {
    // affects_profit = false: commissions are already derived from bookings via
    // the COMMISSIONS map; a manual "Commissioni piattaforma" expense must NOT
    // double-count into the P&L.
    return { type: "commission", scope: "platform",  affects_profit: false };
  }
  if (VARIABLE_CAT_NAMES.includes(categoryName)) {
    return { type: "variable",   scope: "apartment", affects_profit: true };
  }
  // Default: recurring structural fixed cost
  return { type: "fixed",       scope: "property",  affects_profit: true };
}

/**
 * Group an array of expenses by category name, sorted descending by total amount.
 * Returns only entries where the summed amount is > 0.
 *
 * @param {Array} expenses
 * @returns {Array<{ cat: string, amt: number }>}
 */
function aggregateByCategory(expenses) {
  const map = {};
  for (const e of expenses) {
    map[e.category] = (map[e.category] || 0) + Number(e.amount);
  }
  return Object.entries(map)
    .map(([cat, amt]) => ({ cat, amt }))
    .filter(x => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Block A — Operational income statement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the operational income statement for a given period.
 *
 * Revenue side:
 *   grossRevenue − platformCommissions = netRevenue
 *
 * Cost side (only operational costs):
 *   variableExpenses  (type = "variable": Pulizie, Manutenzione, Dotazioni, Altro)
 *   fixedExpenses     (type = "fixed":    Condominio, Assicurazione, Utenze…)
 *   EXCLUDED: fiscal       (type = "fiscal"      → Block B: IMU, TARI)
 *   EXCLUDED: commission   (type = "commission"  → already in platformCommissions)
 *   EXCLUDED: affects_profit === false
 *
 * @param {Array} bookings   – Bookings in the period (filtered)
 * @param {Array} expenses   – Expenses in the period (filtered)
 * @param {Array} categories – expense_categories from Supabase (may have null type fields)
 * @returns {{
 *   grossRevenue: number,
 *   platformCommissions: number,
 *   netRevenue: number,
 *   variableTotal: number,
 *   fixedTotal: number,
 *   operationalExpenses: number,
 *   variableByCategory: Array,
 *   fixedByCategory: Array,
 *   operationalMargin: number,
 *   operationalMarginPct: number,
 * }}
 */
export function calcOperationalMetrics(bookings, expenses, categories) {
  // ── Revenue ────────────────────────────────────────────────────────────────
  const grossRevenue = bookings.reduce((s, b) => s + Number(b.price), 0);

  const platformCommissions = bookings.reduce((s, b) => {
    const rate = COMMISSIONS[b.platform] ?? 0;
    return s + Number(b.price) * rate / 100;
  }, 0);

  const netRevenue = grossRevenue - platformCommissions;

  // ── Expense classification ─────────────────────────────────────────────────
  const variableExpenses = [];
  const fixedExpenses    = [];

  for (const exp of expenses) {
    const meta = resolveCategoryMeta(exp.category, categories);

    if (meta.type === "fiscal")        continue; // → Block B
    if (meta.type === "commission")    continue; // → already priced in platformCommissions
    if (meta.affects_profit === false) continue; // explicitly non-P&L

    if (meta.type === "variable") {
      variableExpenses.push(exp);
    } else {
      // type = "fixed" (or any unrecognised value) → structural fixed cost
      fixedExpenses.push(exp);
    }
  }

  const variableTotal       = variableExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const fixedTotal          = fixedExpenses.reduce((s, e)    => s + Number(e.amount), 0);
  const operationalExpenses = variableTotal + fixedTotal;

  const operationalMargin    = netRevenue - operationalExpenses;
  const operationalMarginPct = netRevenue > 0
    ? Math.round((operationalMargin / netRevenue) * 100)
    : 0;

  return {
    grossRevenue,
    platformCommissions,
    netRevenue,
    variableTotal,
    fixedTotal,
    operationalExpenses,
    variableByCategory: aggregateByCategory(variableExpenses),
    fixedByCategory:    aggregateByCategory(fixedExpenses),
    operationalMargin,
    operationalMarginPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Block B — Fiscal simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate fiscal-layer metrics: cedolare secca simulation + patrimonial costs.
 *
 * Cedolare logic:
 *   • taxableRevenue  = revenue from bookings "included" in the tax base
 *   • estimatedTax    = taxableRevenue × effectiveRate  (total tax obligation)
 *   • withheldTax     = portion already remitted by the platform (Airbnb Italy)
 *   • taxDueEstimate  = estimatedTax − withheldTax  (owner's remaining liability)
 *
 * Patrimonial costs (IMU + TARI):
 *   Extracted from the expense list using type = "fiscal" classification.
 *   Separated from the operational margin in Block A.
 *
 * @param {Array}  bookings   – Bookings in the period
 * @param {Array}  expenses   – Expenses in the period
 * @param {{
 *   taxMode:      string,   // "21" | "26" | "custom"
 *   customRate:   string,   // numeric string, used when taxMode = "custom"
 *   taxOverrides: Object,   // { [bookingId]: boolean } per-booking toggle
 * }} taxConfig
 * @param {Array} categories – expense_categories from Supabase
 * @returns {{
 *   effectiveRate: number,
 *   taxableRevenue: number,
 *   excludedRevenue: number,
 *   estimatedTax: number,
 *   withheldRevenue: number,
 *   withheldTax: number,
 *   taxDueEstimate: number,
 *   includedBookings: Array,
 *   excludedBookings: Array,
 *   fiscalExpenses: Array,
 *   fiscalExpensesByCategory: Array,
 *   fiscalExpensesTotal: number,
 *   fiscalExpensesPaid: number,
 *   fiscalExpensesUnpaid: number,
 * }}
 */
export function calcFiscalMetrics(bookings, expenses, taxConfig, categories) {
  const { taxMode, customRate, taxOverrides = {} } = taxConfig;

  const effectiveRate = taxMode === "custom"
    ? (parseFloat(customRate) || 0)
    : parseInt(taxMode, 10);

  // ── Tax base: which bookings are subject to cedolare ───────────────────────
  const isIncluded = (b) =>
    b.id in taxOverrides
      ? taxOverrides[b.id]
      : TAXABLE_PLATFORMS_DEFAULT.includes(b.platform);

  const includedBookings = bookings.filter(isIncluded);
  const excludedBookings = bookings.filter(b => !isIncluded(b));

  const taxableRevenue  = includedBookings.reduce((s, b) => s + Number(b.price), 0);
  const excludedRevenue = excludedBookings.reduce((s, b) => s + Number(b.price), 0);

  // ── Total estimated tax on the full taxable base ───────────────────────────
  const estimatedTax = Math.round(taxableRevenue * effectiveRate) / 100;

  // ── Withheld portion: already remitted by the platform ────────────────────
  // Only applies to included bookings from platforms in WITHHELD_PLATFORMS.
  // The owner has already "paid" this indirectly (platform deducted before payout).
  const withheldBookings = includedBookings.filter(b =>
    WITHHELD_PLATFORMS.includes(b.platform)
  );
  const withheldRevenue = withheldBookings.reduce((s, b) => s + Number(b.price), 0);
  const withheldTax     = Math.round(withheldRevenue * effectiveRate) / 100;

  // ── Owner's remaining tax liability (cedolare not yet withheld) ───────────
  const taxDueEstimate = estimatedTax - withheldTax;

  // ── Patrimonial costs: IMU, TARI (fiscal-type expenses) ───────────────────
  const fiscalExpenses = expenses.filter(exp => {
    const meta = resolveCategoryMeta(exp.category, categories);
    return meta.type === "fiscal";
  });

  const fiscalExpensesTotal  = fiscalExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const fiscalExpensesPaid   = fiscalExpenses
    .filter(e => e.paid)
    .reduce((s, e) => s + Number(e.amount), 0);
  const fiscalExpensesUnpaid = fiscalExpensesTotal - fiscalExpensesPaid;

  return {
    effectiveRate,
    taxableRevenue,
    excludedRevenue,
    estimatedTax,
    withheldRevenue,
    withheldTax,
    taxDueEstimate,
    includedBookings,
    excludedBookings,
    fiscalExpenses,
    fiscalExpensesByCategory: aggregateByCategory(fiscalExpenses),
    fiscalExpensesTotal,
    fiscalExpensesPaid,
    fiscalExpensesUnpaid,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Block C — Final net result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combine operational and fiscal layers into the final bottom line.
 *
 * When taxEnabled = false:
 *   finalNet = operationalMargin  (fiscal deductions not applied — raw operating result)
 *
 * When taxEnabled = true:
 *   finalNet = operationalMargin − taxDueEstimate − fiscalExpensesTotal
 *
 *   taxDueEstimate      = cedolare the owner must still pay (Booking, Diretto, ecc.)
 *   fiscalExpensesTotal = IMU + TARI already logged as expenses
 *
 * NOTE — withheldTax:
 *   Returned for informational/display purposes only. It represents the cedolare
 *   already withheld and remitted upstream by the platform (Airbnb Italy).
 *   It is NOT deducted again in finalNet because the owner never received that
 *   cash to begin with — the economic cost is already embedded in the gross revenue.
 *   Future Sprint: once booking.tax_withheld is persisted in DB, this value will
 *   drive a dedicated "Ritenuta già versata" line in the fiscal block UI.
 *
 * @param {ReturnType<calcOperationalMetrics>} operational
 * @param {ReturnType<calcFiscalMetrics>}      fiscal
 * @param {boolean}                            taxEnabled
 * @returns {{
 *   operationalMargin: number,
 *   taxDueEstimate: number,
 *   withheldTax: number,
 *   fiscalCosts: number,
 *   finalNet: number,
 * }}
 */
export function calcFinalMetrics(operational, fiscal, taxEnabled) {
  const { operationalMargin } = operational;

  const taxDueEstimate = taxEnabled ? fiscal.taxDueEstimate      : 0;
  const withheldTax    = taxEnabled ? fiscal.withheldTax         : 0; // informational only — see NOTE above
  const fiscalCosts    = taxEnabled ? fiscal.fiscalExpensesTotal : 0;

  const finalNet = operationalMargin - taxDueEstimate - fiscalCosts;

  return {
    operationalMargin,
    taxDueEstimate,
    withheldTax,   // informational only — already withheld upstream, not a new deduction
    fiscalCosts,
    finalNet,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Formatting utilities (kept for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Format a number as a rounded Euro amount with Italian locale separators. */
export function fmtEur(n) {
  return Math.round(n).toLocaleString("it-IT");
}

/**
 * Return the expense amount if its date falls within [periodStart, periodEnd],
 * otherwise 0. Kept for backwards compatibility with legacy callers.
 */
export function expInPeriod(expense, periodStart, periodEnd) {
  const d = expense.date;
  if (!d) return 0;
  return (d >= periodStart && d <= periodEnd) ? Number(expense.amount) : 0;
}
