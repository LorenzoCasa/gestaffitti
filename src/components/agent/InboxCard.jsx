const STATUS_COLORS = {
  new:        "#c9a96e",
  processing: "#6ea0c9",
  replied:    "#6ec99a",
  booked:     "#3a8a5a",
  rejected:   "#c96e6e",
  ignored:    "#5a5a5a",
};

const STATUS_LABELS = {
  new:        "Nuova",
  processing: "In analisi",
  replied:    "Risposta salvata",
  booked:     "Prenotata",
  rejected:   "Rifiutata",
  ignored:    "Ignorata",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function InboxCard({ item, onLoad }) {
  const color   = STATUS_COLORS[item.status] ?? "#c9a96e";
  const label   = STATUS_LABELS[item.status] ?? item.status;
  const listing = item.raw_metadata?.listing_title ?? null;
  const preview = item.raw_text?.length > 120
    ? item.raw_text.slice(0, 120) + "…"
    : item.raw_text;

  return (
    <div style={{ background: "#120f0a", border: "1px solid #2a2010", borderRadius: "12px", padding: "0.85rem 1rem", marginBottom: "0.6rem" }}>

      {/* Header: badges + data */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.4rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ background: "#2a2010", color: "#c9a96e", border: "1px solid #c9a96e44", borderRadius: "20px", padding: "0.15rem 0.65rem", fontSize: "0.68rem", fontWeight: "700", fontFamily: "'Playfair Display',serif", textTransform: "uppercase" }}>
            {item.source}
          </span>
          <span style={{ background: `${color}18`, color, border: `1px solid ${color}44`, borderRadius: "20px", padding: "0.15rem 0.65rem", fontSize: "0.68rem", fontWeight: "700" }}>
            {label}
          </span>
        </div>
        <span style={{ color: "#5a4a30", fontSize: "0.65rem" }}>
          {formatDate(item.created_at)}
        </span>
      </div>

      {/* Listing title */}
      {listing && (
        <div style={{ color: "#8a7a60", fontSize: "0.7rem", marginBottom: "0.3rem", fontStyle: "italic" }}>
          📋 {listing}
        </div>
      )}

      {/* Raw text preview */}
      <div style={{ color: "#e8d5b0", fontSize: "0.78rem", lineHeight: "1.45", background: "#0d0a07", borderRadius: "8px", padding: "0.5rem 0.65rem", marginBottom: "0.55rem" }}>
        {preview}
      </div>

      {/* Footer: source_message_id + button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#3a3020", fontSize: "0.6rem", fontFamily: "monospace" }}>
          {item.source_message_id}
        </span>
        <button
          onClick={() => onLoad(item)}
          style={{ background: "#2a2010", border: "1px solid #c9a96e55", borderRadius: "8px", padding: "0.35rem 0.85rem", color: "#c9a96e", fontSize: "0.72rem", fontWeight: "700", cursor: "pointer", fontFamily: "'Playfair Display',serif" }}
        >
          Carica in analisi
        </button>
      </div>
    </div>
  );
}
