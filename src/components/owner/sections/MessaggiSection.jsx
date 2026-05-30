import { useState } from "react";
import useAgentData from "../../../hooks/useAgentData";

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

const DECISION_LABELS = {
  available:           "Disponibile",
  unavailable:         "Non disponibile",
  outside_rules:       "Fuori regola",
  full_month:          "Mese intero",
  needs_info:          "Info mancanti",
  price_negotiation:   "Negoziazione",
  manual_review:       "Revisione manuale",
  partially_available: "Parz. disponibile",
};

const SOURCE_LABELS = {
  subito: "Subito", email: "Email", whatsapp: "WhatsApp",
  airbnb: "Airbnb", booking: "Booking", altro: "Altro",
};

const FILTER_TABS = [
  { id: "all",        label: "Tutti" },
  { id: "new",        label: "Nuovi" },
  { id: "processing", label: "In analisi" },
  { id: "replied",    label: "Risposti" },
  { id: "rejected",   label: "Rifiutati" },
  { id: "ignored",    label: "Ignorati" },
];

function fmtDatetime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtShortDate(iso) {
  if (!iso) return null;
  const months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const [, m, d] = iso.split("-");
  return parseInt(d) + " " + months[parseInt(m) - 1];
}

function MessageCard({ item, decision, apartments }) {
  const [expanded, setExpanded] = useState(false);

  const color        = STATUS_COLORS[item.status] ?? "#c9a96e";
  const apt          = apartments.find(a => a.id === (item.apt_id || item.parsed_apt_id));
  const hasDecision  = !!decision;
  const hasResponse  = !!decision?.response_text;
  const checkin      = item.parsed_checkin;
  const checkout     = item.parsed_checkout;
  const guests       = item.parsed_guests;
  const hasMeta      = !!(apt || (checkin && checkout) || guests);

  const periodText = checkin && checkout
    ? fmtShortDate(checkin) + " -> " + fmtShortDate(checkout)
    : checkin ? "dal " + fmtShortDate(checkin) : null;

  const canExpand = (item.raw_text?.length ?? 0) > 100 || hasResponse;

  return (
    <div style={{
      background: "#120f0a",
      border: "1px solid #2a2010",
      borderLeft: "3px solid " + color,
      borderRadius: "12px",
      padding: "0.8rem 0.95rem",
      marginBottom: "0.55rem",
    }}>

      {/* Header: badges + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: "#2a2010", color: "#c9a96e", border: "1px solid #c9a96e33", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem", fontWeight: "700", textTransform: "uppercase", fontFamily: "'Playfair Display',serif" }}>
            {SOURCE_LABELS[item.source] ?? item.source}
          </span>
          <span style={{ background: color + "18", color, border: "1px solid " + color + "44", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem", fontWeight: "700" }}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
          {hasDecision && (
            <span style={{ background: "#1a1a2a", color: "#8888cc", border: "1px solid #3a3a6a33", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem" }}>
              {DECISION_LABELS[decision.decision_type] ?? decision.decision_type}
            </span>
          )}
        </div>
        <span style={{ color: "#4a3a20", fontSize: "0.6rem", flexShrink: 0 }}>
          {fmtDatetime(item.created_at)}
        </span>
      </div>

      {/* Meta: apartment + period + guests */}
      {hasMeta && (
        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
          {apt && (
            <span style={{ fontSize: "0.68rem", color: apt.color ?? "#c9a96e" }}>
              {"🏠"} {apt.label}
            </span>
          )}
          {periodText && (
            <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>
              {"📅"} {periodText}
            </span>
          )}
          {guests && (
            <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>
              {"👤"} {guests} ospiti
            </span>
          )}
        </div>
      )}

      {/* Raw text */}
      {item.raw_text && (
        <div style={{
          fontSize: "0.75rem", color: "#c0a870", lineHeight: "1.45",
          background: "#0d0a07", borderRadius: "7px", padding: "0.4rem 0.6rem",
          marginBottom: canExpand ? "0.35rem" : "0",
          maxHeight: expanded ? "none" : "4rem",
          overflow: "hidden",
        }}>
          {item.raw_text}
        </div>
      )}

      {/* Response (visible only when expanded) */}
      {hasResponse && expanded && (
        <div style={{ fontSize: "0.72rem", color: "#90c890", lineHeight: "1.4", background: "#0a120a", border: "1px solid #2a4a2a33", borderRadius: "7px", padding: "0.4rem 0.6rem", marginBottom: "0.35rem" }}>
          <div style={{ fontSize: "0.58rem", color: "#4a7a4a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem", fontFamily: "'Playfair Display',serif" }}>
            {decision.was_modified ? "Risposta modificata" : "Risposta salvata"}
          </div>
          {decision.response_text}
        </div>
      )}

      {/* Footer: expand button + response indicator */}
      {canExpand && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem" }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: "none", border: "none", color: "#5a4a30", fontSize: "0.63rem", cursor: "pointer", padding: 0, fontFamily: "Georgia,serif" }}
          >
            {expanded ? "Mostra meno" : "Mostra tutto"}
          </button>
          {!expanded && hasResponse && (
            <span style={{ fontSize: "0.6rem", color: "#4a7a4a" }}>risposta salvata</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessaggiSection({ user, apartments }) {
  const { inbox, decisions, agentLoading } = useAgentData(user);
  const [filter, setFilter] = useState("all");

  const realApts = apartments.filter(a => a.id !== "all");

  const decisionByInboxId = Object.fromEntries(
    decisions.map(d => [d.inbox_id, d])
  );

  const filtered = filter === "all"
    ? inbox
    : inbox.filter(item => item.status === filter);

  const counts = FILTER_TABS.reduce((acc, tab) => {
    acc[tab.id] = tab.id === "all"
      ? inbox.length
      : inbox.filter(i => i.status === tab.id).length;
    return acc;
  }, {});

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "1.2rem", marginBottom: "0.9rem", marginTop: "0.4rem" }}>
        Messaggi
      </h2>

      {agentLoading && (
        <div style={{ color: "#6a5a40", fontSize: "0.8rem", marginBottom: "0.7rem" }}>
          Caricamento messaggi...
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.9rem", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "2px" }}>
        {FILTER_TABS.map(tab => {
          const count  = counts[tab.id] ?? 0;
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                background:  active ? "#2a2010" : "#120f0a",
                border:      active ? "1px solid #c9a96e55" : "1px solid #2a2010",
                borderRadius: "20px",
                padding:     "0.28rem 0.65rem",
                color:       active ? "#c9a96e" : "#5a4a30",
                fontSize:    "0.66rem",
                fontFamily:  "'Playfair Display',serif",
                cursor:      "pointer",
                whiteSpace:  "nowrap",
                flexShrink:  0,
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{ marginLeft: "0.3rem", background: active ? "#c9a96e22" : "#1a1a1a", borderRadius: "10px", padding: "0 0.3rem", fontSize: "0.58rem" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {!agentLoading && filtered.length === 0 && (
        <div style={{ color: "#4a3a20", fontSize: "0.8rem", textAlign: "center", padding: "2.5rem 0" }}>
          Nessun messaggio{filter !== "all" ? " con questo stato" : ""}.
        </div>
      )}

      {/* Message list */}
      {filtered.map(item => (
        <MessageCard
          key={item.id}
          item={item}
          decision={decisionByInboxId[item.id] ?? null}
          apartments={realApts}
        />
      ))}
    </div>
  );
}
