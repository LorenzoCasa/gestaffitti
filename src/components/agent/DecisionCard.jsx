import { useState } from "react";

const DECISION_COLORS = {
  available:           "#6ec99a",
  unavailable:         "#c96e6e",
  partially_available: "#c9a96e",
  needs_info:          "#6ea0c9",
  price_negotiation:   "#c9c96e",
  manual_review:       "#9e6ec9",
};

const DECISION_LABELS = {
  available:           "✅ Disponibile",
  unavailable:         "❌ Non disponibile",
  partially_available: "⚠️ Parz. disponibile",
  needs_info:          "ℹ️ Info mancanti",
  price_negotiation:   "💬 Negoziazione",
  manual_review:       "👤 Revisione manuale",
};

export default function DecisionCard({ decision, onSave, saving, saved }) {
  // ── Payload decomposition ──────────────────────────────────────────
  const payload = decision?.payload || {};
  const pricing = payload.pricing || payload.altPricing || null;
  const avail   = payload.avail   || null;
  const windows = payload.windows || avail?.alternativeSuggestions || [];
  const color   = DECISION_COLORS[decision?.type] || "#c9a96e";

  // ── State ──────────────────────────────────────────────────────────
  const [text,   setText]   = useState(decision?.responseText || "");
  const [copied, setCopied] = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Pricing rows ───────────────────────────────────────────────────
  const pricingRows = pricing ? [
    ["Tariffa base",  `€${pricing.baseNightlyRate}/n`],
    ["Stagione",      `${pricing.season} (×${pricing.seasonMultiplier})`],
    ["Notti",         String(avail?.nights ?? pricing.nights)],
    ["Tariffa/notte", `€${pricing.seasonalRate}/n`],
    pricing.cleaningFee   > 0 ? ["Pulizie",      `€${pricing.cleaningFee}`]   : null,
    pricing.extraGuestFee > 0 ? ["Extra ospiti", `€${pricing.extraGuestFee}`] : null,
    ["Totale ospite", `€${pricing.totalGuestPrice}`],
    ["Netto propr.",  `€${pricing.netRevenue}`],
  ].filter(Boolean) : [];

  // ── Motivo decisione flags ─────────────────────────────────────────
  const hasReason   = !!avail?.reason;
  const hasConflict = !!avail?.conflictingBooking?.guest;
  const hasScore    = decision?.decision_score != null;
  const hasDetails  = hasReason || hasConflict || hasScore;

  return (
    <div style={{ background: "#120f0a", border: `1px solid ${color}44`, borderRadius: "14px", padding: "1rem", marginTop: "0.9rem" }}>

      {/* Badge decisione */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
        <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: "20px", padding: "0.2rem 0.8rem", fontSize: "0.78rem", fontWeight: "700", fontFamily: "'Playfair Display',serif" }}>
          {DECISION_LABELS[decision?.type] || decision?.type}
        </span>
        {decision?.requiresOwnerApproval && (
          <span style={{ color: "#c9a96e", fontSize: "0.68rem" }}>⚠️ Approvazione richiesta</span>
        )}
      </div>

      {/* Motivo decisione */}
      <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "10px", padding: "0.75rem", marginBottom: "0.8rem" }}>
        <div style={{ color: "#8a7a60", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.5rem" }}>
          🧠 Motivo decisione
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
            <span style={{ color: "#6a5a40" }}>Tipo</span>
            <span style={{ color: "#e8d5b0" }}>{decision?.type}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
            <span style={{ color: "#6a5a40" }}>Approvazione owner</span>
            <span style={{ color: decision?.requiresOwnerApproval ? "#c9a96e" : "#6ec99a" }}>
              {decision?.requiresOwnerApproval ? "Richiesta" : "Non richiesta"}
            </span>
          </div>
          {hasReason && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
              <span style={{ color: "#6a5a40" }}>Motivo</span>
              <span style={{ color: "#e8d5b0" }}>{avail.reason}</span>
            </div>
          )}
          {hasConflict && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
              <span style={{ color: "#6a5a40" }}>Conflitto con</span>
              <span style={{ color: "#c96e6e" }}>{avail.conflictingBooking.guest}</span>
            </div>
          )}
          {hasScore && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
              <span style={{ color: "#6a5a40" }}>Score</span>
              <span style={{ color: "#e8d5b0" }}>{decision.decision_score}</span>
            </div>
          )}
          {!hasDetails && (
            <div style={{ fontSize: "0.72rem", color: "#5a4a30", fontStyle: "italic", padding: "0.25rem 0" }}>
              Decisione generata dal motore in base a disponibilità, prezzo e regole configurate.
            </div>
          )}
        </div>
      </div>

      {/* Prezzi */}
      {pricingRows.length > 0 && (
        <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "10px", padding: "0.75rem", marginBottom: "0.8rem" }}>
          <div style={{ color: "#8a7a60", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.5rem" }}>
            💶 Prezzi
          </div>
          {pricingRows.map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.18rem 0", borderBottom: "1px solid #1a1710" }}>
              <span style={{ color: "#6a5a40" }}>{label}</span>
              <span style={{ color: "#e8d5b0" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Periodi alternativi */}
      {windows.length > 0 && (
        <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "10px", padding: "0.75rem", marginBottom: "0.8rem" }}>
          <div style={{ color: "#8a7a60", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.4rem" }}>
            📅 Periodi alternativi
          </div>
          {windows.slice(0, 3).map((w, i) => (
            <div key={i} style={{ fontSize: "0.75rem", color: "#c9a96e", padding: "0.15rem 0" }}>
              {w.checkin} → {w.checkout} · {w.nights} notti
            </div>
          ))}
        </div>
      )}

      {/* Risposta suggerita */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label style={{ display: "block", color: "#8a7a60", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.35rem" }}>
          📝 Risposta suggerita
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          style={{ width: "100%", background: "#0d0a07", border: "1px solid #3a3020", borderRadius: "8px", padding: "0.6rem 0.8rem", color: "#e8d5b0", fontFamily: "Georgia,serif", fontSize: "0.82rem", minHeight: "140px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: "0.65rem" }}>
        <button
          onClick={() => onSave(text)}
          disabled={saving || saved}
          style={{ flex: 1, background: saved ? "#1a2a1a" : "linear-gradient(135deg,#c9a96e,#a07840)", border: saved ? "1px solid #6ec99a44" : "none", borderRadius: "8px", padding: "0.65rem", color: saved ? "#6ec99a" : "#0a0806", fontWeight: "700", cursor: saving || saved ? "default" : "pointer", fontFamily: "'Playfair Display',serif", fontSize: "0.82rem", opacity: saving ? 0.6 : 1 }}
        >
          {saved ? "✓ Salvata" : saving ? "Salvataggio…" : "💾 Salva decisione"}
        </button>
        <button
          onClick={handleCopy}
          style={{ flex: 1, background: copied ? "#1a2a1a" : "#2a2010", border: `1px solid ${copied ? "#6ec99a44" : "#3a3020"}`, borderRadius: "8px", padding: "0.65rem", color: copied ? "#6ec99a" : "#c9a96e", fontWeight: "700", cursor: "pointer", fontFamily: "'Playfair Display',serif", fontSize: "0.82rem" }}
        >
          {copied ? "✓ Copiato!" : "📋 Copia"}
        </button>
      </div>

    </div>
  );
}
