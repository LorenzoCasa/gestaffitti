export const APT_ALL = { id: "all", label: "Tutti", color: "#c9a96e" };

export const COLOR_PALETTE = [
  "#6e9ec9","#c96e9e","#9ec96e","#c9a96e","#6ec9a9",
  "#c96e6e","#9e6ec9","#c9c96e","#6ec9c9","#c9906e",
];

export const PLATFORMS = ["Airbnb", "Booking", "Subito", "Diretto", "Altro"];
export const COMMISSIONS = { Airbnb: 3, Booking: 15, Subito: 0, Diretto: 0, Altro: 0 };

export const CATEGORIES = ["IMU","TARI","Luce","Gas","Acqua","Internet","Condominio","Pulizie","Manutenzione","Dotazioni","Assicurazione","Commissioni piattaforma","Altro"];
export const FIXED_CATS = ["IMU","TARI","Luce","Gas","Acqua","Internet","Condominio","Assicurazione","Commissioni piattaforma"];
export const MGMT_CATS = ["Pulizie","Manutenzione","Dotazioni","Altro"];
export const CATEGORIES_FALLBACK = CATEGORIES.map((name, i) => ({
  id: null, name, type: null, scope: null, affects_profit: null, active: true, sort_order: i + 1,
}));
export const PAYMENT_TYPES = ["Una tantum","Rata IMU (2 rate)","Rata Condominio (5 rate)","Mensile"];

export const MONTHS_LONG = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
export const MONTHS = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

// ─────────────────────────────────────────────────────────────────────────────
//  Agent — multi-source inbox constants
// ─────────────────────────────────────────────────────────────────────────────

/** All supported inbound sources for the agent inbox. */
export const AGENT_SOURCES = ["subito", "email", "whatsapp", "airbnb", "booking", "altro"];

/** Lifecycle states of a message in the agent inbox. */
export const AGENT_STATUSES = [
  "new",        // just received, not yet processed
  "processing", // AI is evaluating
  "replied",    // a response has been composed/sent
  "booked",     // a booking was created from this inquiry
  "rejected",   // declined (not available, not suitable)
  "ignored",    // spam / irrelevant
];

/** Types of decisions the Decision Engine can produce. */
export const AGENT_DECISION_TYPES = [
  "available",           // dates free → quote + propose booking
  "unavailable",         // dates occupied → suggest alternatives or politely decline
  "partially_available", // overlap → propose adjusted dates
  "needs_info",          // missing checkin/checkout → ask for details
  "price_negotiation",   // guest asked for discount → evaluate and respond
  "manual_review",       // engine not confident → escalate to owner
];

/**
 * Per-platform configuration for the agent.
 *
 * requiresParsing  – message is free-text and needs AI NLP extraction
 * tone             – default reply tone for response generation
 * autonomyHint     – suggested autonomy level (low=always ask owner, high=auto-send)
 * trustBaseline    – how much to trust guest data before verification
 * commissionPct    – platform commission percentage (mirrors COMMISSIONS map)
 */
export const AGENT_PLATFORM_PROFILES = {
  subito:   { label: "Subito.it",   requiresParsing: true,  tone: "informal_it", autonomyHint: "low",    trustBaseline: "low",    commissionPct: 0  },
  email:    { label: "Email",       requiresParsing: true,  tone: "formal_it",   autonomyHint: "medium", trustBaseline: "medium", commissionPct: 0  },
  whatsapp: { label: "WhatsApp",    requiresParsing: true,  tone: "informal_it", autonomyHint: "medium", trustBaseline: "low",    commissionPct: 0  },
  airbnb:   { label: "Airbnb",      requiresParsing: false, tone: "formal_it",   autonomyHint: "high",   trustBaseline: "high",   commissionPct: 3  },
  booking:  { label: "Booking.com", requiresParsing: false, tone: "formal_it",   autonomyHint: "high",   trustBaseline: "high",   commissionPct: 15 },
  altro:    { label: "Altro",       requiresParsing: true,  tone: "formal_it",   autonomyHint: "low",    trustBaseline: "low",    commissionPct: 0  },
};
