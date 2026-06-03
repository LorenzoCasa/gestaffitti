import { useState } from "react";
import useAgentData from "../../../hooks/useAgentData";
import { stripHtml, looksLikeHtml, extractSubitoLink } from "../../../utils/stripHtml";
import { resolveListingFromTitle, extractListingTitle } from "../../../utils/agentListingResolver";
import { buildAgentContext } from "../../../utils/buildAgentContext";
import { generateGuestReply } from "../../../utils/generateGuestReply";

const STATUS_COLORS = {
  new: "#c9a96e", processing: "#6ea0c9", replied: "#6ec99a",
  booked: "#3a8a5a", rejected: "#c96e6e", ignored: "#5a5a5a",
};
const STATUS_LABELS = {
  new: "Nuova", processing: "In analisi", replied: "Gestita",
  booked: "Prenotata", rejected: "Rifiutata", ignored: "Ignorata",
};
const SOURCE_LABELS = {
  subito: "Subito", email: "Email", whatsapp: "WhatsApp",
  airbnb: "Airbnb", booking: "Booking", altro: "Altro",
};
const DECISION_LABELS = {
  available: "Disponibile", unavailable: "Non disponibile", has_alternatives: "Alternative",
  outside_rules: "Fuori regola", full_month: "Mese intero", needs_info: "Info mancanti",
  price_negotiation: "Negoziazione", manual_review: "Revisione",
};
const DECISION_COLORS = {
  available: "#6ec99a", unavailable: "#c96e6e", has_alternatives: "#c9a96e",
  outside_rules: "#c9c96e", full_month: "#9ec9a9", needs_info: "#6ea0c9",
  price_negotiation: "#9e6ec9", manual_review: "#8a7a60",
};

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

function MessageCard({ item, apartments, bookings, aptRules, onMarkDone }) {
  const [expanded, setExpanded]   = useState(false);
  const [copied,   setCopied]     = useState(false);

  const realApts  = apartments.filter(a => a.id !== "all");
  const cleanText = looksLikeHtml(item.raw_text)
    ? stripHtml(item.raw_text)
    : (item.raw_text ?? "");

  const candidateTitle = extractListingTitle(item.raw_metadata);
  const aptId =
    resolveListingFromTitle(candidateTitle, realApts) ??
    item.apt_id ??
    item.parsed_apt_id ??
    "";

  const unrecognized = !aptId && !!candidateTitle;

  let context = null;
  try {
    context = buildAgentContext({
      rawText:     cleanText,
      rawMetadata: item.raw_metadata ?? {},
      formData: {
        aptId,
        source:   item.source          ?? "subito",
        checkin:  item.parsed_checkin  ?? "",
        checkout: item.parsed_checkout ?? "",
        guests:   item.parsed_guests   ?? null,
      },
      apartments: realApts,
      bookings,
      aptRules,
    });
  } catch (e) {
    console.error("[MessageCard] buildAgentContext:", e);
  }

  const responseText  = context ? generateGuestReply(context) : null;
  const subitoLink    = extractSubitoLink(item.raw_metadata, cleanText);
  const apt           = realApts.find(a => a.id === aptId);
  const color         = STATUS_COLORS[item.status] ?? "#c9a96e";
  const isNew         = ["new", "processing"].includes(item.status);
  const decisionType  = context?.decision?.type;
  const avail         = context?.availability;
  const pricing       = context?.pricing;
  const checkin       = context?.inquiry.checkin  ?? item.parsed_checkin;
  const checkout      = context?.inquiry.checkout ?? item.parsed_checkout;
  const guests        = context?.inquiry.guests   ?? item.parsed_guests;

  const periodText = checkin && checkout
    ? fmtShortDate(checkin) + " → " + fmtShortDate(checkout)
    : checkin ? "dal " + fmtShortDate(checkin) : null;

  function handleCopy() {
    if (!responseText) return;
    navigator.clipboard.writeText(responseText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  const btnBase = {
    borderRadius: "6px", padding: "0.22rem 0.55rem",
    fontSize: "0.63rem", cursor: "pointer", fontFamily: "Georgia,serif",
  };

  return (
    <div style={{
      background: "#120f0a",
      border: "1px solid #2a2010",
      borderLeft: "3px solid " + color,
      borderRadius: "12px",
      padding: "0.8rem 0.95rem",
      marginBottom: "0.55rem",
    }}>

      {/* ── Header: badges + data ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: "#2a2010", color: "#c9a96e", border: "1px solid #c9a96e33", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem", fontWeight: "700", textTransform: "uppercase", fontFamily: "'Playfair Display',serif" }}>
            {SOURCE_LABELS[item.source] ?? item.source}
          </span>
          <span style={{ background: color + "18", color, border: "1px solid " + color + "44", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem", fontWeight: "700" }}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
          {decisionType && (
            <span style={{ background: (DECISION_COLORS[decisionType] ?? "#8a7a60") + "22", color: DECISION_COLORS[decisionType] ?? "#8a7a60", border: "1px solid " + (DECISION_COLORS[decisionType] ?? "#8a7a60") + "44", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem" }}>
              {DECISION_LABELS[decisionType] ?? decisionType}
            </span>
          )}
        </div>
        <span style={{ color: "#4a3a20", fontSize: "0.6rem", flexShrink: 0 }}>
          {fmtDatetime(item.created_at)}
        </span>
      </div>

      {/* ── Meta: apt + periodo + ospiti + disponibilità + prezzo ── */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        {apt ? (
          <span style={{ fontSize: "0.7rem", color: apt.color ?? "#c9a96e", fontWeight: "600" }}>
            🏠 {apt.label}
          </span>
        ) : unrecognized ? (
          <span style={{ fontSize: "0.68rem", color: "#c96e6e" }}>⚠️ Appartamento non riconosciuto</span>
        ) : null}

        {periodText && (
          <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>📅 {periodText}</span>
        )}
        {guests && (
          <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>👤 {guests} ospiti</span>
        )}
        {avail && checkin && (
          <span style={{ fontSize: "0.68rem", fontWeight: "600", color: avail.isAvailable ? "#6ec99a" : "#c96e6e" }}>
            {avail.isAvailable ? "✓ Disponibile" : "✗ Occupato"}
          </span>
        )}
        {pricing?.totalPrice != null && checkin && !context?.stayRules?.isFullMonth && (
          <span style={{ fontSize: "0.68rem", color: "#c9a96e" }}>€{pricing.totalPrice}</span>
        )}
      </div>

      {/* ── Testo cliente (pulito) ── */}
      {cleanText ? (
        <div style={{
          fontSize: "0.75rem", color: "#c0a870", lineHeight: "1.5",
          background: "#0d0a07", borderRadius: "7px", padding: "0.4rem 0.6rem",
          marginBottom: "0.4rem",
          maxHeight: expanded ? "none" : "2.8rem",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
        }}>
          {cleanText}
        </div>
      ) : null}

      {/* ── Risposta suggerita — sempre visibile, collassata ── */}
      {responseText && (
        <div style={{
          fontSize: "0.72rem", color: "#90c890", lineHeight: "1.5",
          background: "#0a120a", border: "1px solid #2a4a2a33",
          borderRadius: "7px", padding: "0.5rem 0.65rem", marginBottom: "0.4rem",
          whiteSpace: "pre-wrap",
          maxHeight: expanded ? "none" : "5.5rem",
          overflow: "hidden",
        }}>
          <div style={{ fontSize: "0.58rem", color: "#4a7a4a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem", fontFamily: "'Playfair Display',serif" }}>
            Risposta suggerita
          </div>
          {responseText}
        </div>
      )}

      {/* ── Azioni ── */}
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>

        {/* Espandi/comprimi */}
        <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: "#5a4a30", fontSize: "0.63rem", cursor: "pointer", padding: 0, fontFamily: "Georgia,serif" }}>
          {expanded ? "Mostra meno ▲" : "Mostra tutto ▼"}
        </button>

        {/* Copia risposta — sempre visibile se risposta esiste */}
        {responseText && (
          <button
            onClick={handleCopy}
            style={{ ...btnBase, background: copied ? "#1a3a1a" : "#1a1a2a", border: "1px solid " + (copied ? "#6ec99a55" : "#3a3a6a55"), color: copied ? "#6ec99a" : "#8888cc" }}>
            {copied ? "✓ Copiato!" : "📋 Copia risposta"}
          </button>
        )}

        {/* Apri Subito */}
        {subitoLink ? (
          <a
            href={subitoLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnBase, background: "#1a1510", border: "1px solid #c9a96e44", color: "#c9a96e", textDecoration: "none", display: "inline-block" }}>
            🔗 Apri Subito
          </a>
        ) : (
          <span style={{ fontSize: "0.6rem", color: "#3a3020" }}>link Subito non disponibile</span>
        )}

        {/* Segna come gestito — solo per messaggi nuovi */}
        {isNew && (
          <button
            onClick={() => onMarkDone(item.id)}
            style={{ ...btnBase, background: "#0a1a0a", border: "1px solid #6ec99a33", color: "#6ec99a", marginLeft: "auto" }}>
            ✓ Segna come gestito
          </button>
        )}
      </div>
    </div>
  );
}

export default function MessaggiSection({ user, apartments, bookings }) {
  const { inbox, aptRules, agentLoading, updateInboxStatus } = useAgentData(user);
  const [tab, setTab] = useState("nuovi");

  const nuovi   = inbox.filter(i => ["new", "processing"].includes(i.status));
  const gestiti = inbox.filter(i => !["new", "processing"].includes(i.status));
  const displayed = tab === "nuovi" ? nuovi : gestiti;

  async function handleMarkDone(id) {
    await updateInboxStatus(id, "replied");
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "1.2rem", marginBottom: "0.7rem", marginTop: "0.4rem" }}>
        Messaggi
      </h2>

      {agentLoading && (
        <div style={{ color: "#6a5a40", fontSize: "0.8rem", marginBottom: "0.7rem" }}>
          Caricamento messaggi...
        </div>
      )}

      {/* Tab: Nuovi / Già gestiti */}
      <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.9rem" }}>
        {[
          { id: "nuovi",   label: "Nuovi",        count: nuovi.length   },
          { id: "gestiti", label: "Già gestiti",  count: gestiti.length },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background:   active ? "#2a2010" : "#120f0a",
                border:       active ? "1px solid #c9a96e55" : "1px solid #2a2010",
                borderRadius: "20px",
                padding:      "0.3rem 0.8rem",
                color:        active ? "#c9a96e" : "#5a4a30",
                fontSize:     "0.7rem",
                fontFamily:   "'Playfair Display',serif",
                cursor:       "pointer",
                whiteSpace:   "nowrap",
              }}>
              {t.label}
              {t.count > 0 && (
                <span style={{ marginLeft: "0.35rem", background: active ? "#c9a96e22" : "#1a1a1a", borderRadius: "10px", padding: "0 0.35rem", fontSize: "0.6rem" }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {!agentLoading && displayed.length === 0 && (
        <div style={{ color: "#4a3a20", fontSize: "0.8rem", textAlign: "center", padding: "2.5rem 0" }}>
          {tab === "nuovi" ? "Nessun messaggio nuovo." : "Nessun messaggio gestito."}
        </div>
      )}

      {/* Cards */}
      {displayed.map(item => (
        <MessageCard
          key={item.id}
          item={item}
          apartments={apartments}
          bookings={bookings ?? []}
          aptRules={aptRules}
          onMarkDone={handleMarkDone}
        />
      ))}
    </div>
  );
}
