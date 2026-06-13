import { useState } from "react";
import { stripHtml, looksLikeHtml, extractSubitoLink } from "../../../utils/stripHtml";
import { resolveListingFromTitle, extractListingTitle } from "../../../utils/agentListingResolver";
import { buildAgentContext } from "../../../utils/buildAgentContext";
import { generateGuestReply } from "../../../utils/generateGuestReply";
import { groupInboxByThread } from "../../../utils/groupInboxByThread";

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

// ── Mini-card per messaggi storici nel thread ─────────────────────────────────

function HistoryMessageRow({ msg }) {
  const [expanded, setExpanded] = useState(false);
  const cleanText = looksLikeHtml(msg.raw_text) ? stripHtml(msg.raw_text) : (msg.raw_text ?? "");
  const preview = cleanText.length > 100 ? cleanText.slice(0, 100) + "…" : cleanText;
  const color = STATUS_COLORS[msg.status] ?? "#c9a96e";

  return (
    <div style={{
      borderLeft: "2px solid " + color + "55",
      paddingLeft: "0.6rem",
      marginBottom: "0.4rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
        <span style={{ fontSize: "0.6rem", color: color, fontWeight: "700", textTransform: "uppercase" }}>
          {STATUS_LABELS[msg.status] ?? msg.status}
        </span>
        <span style={{ fontSize: "0.58rem", color: "#3a2a18" }}>{fmtDatetime(msg.created_at)}</span>
      </div>
      <div
        style={{ fontSize: "0.7rem", color: "#7a6a50", lineHeight: "1.4", cursor: cleanText.length > 100 ? "pointer" : "default" }}
        onClick={() => cleanText.length > 100 && setExpanded(e => !e)}
      >
        {expanded ? cleanText : preview}
      </div>
    </div>
  );
}

// ── Conversation card — gestisce sia singolo messaggio che thread ─────────────

function ConversationCard({ thread, apartments, bookings, aptRules, decisions, onMarkDone }) {
  const [showHistory, setShowHistory] = useState(false);
  const [copied,      setCopied]      = useState(false);

  const { latestMessage: item, isThread, messageCount, messages, allIds } = thread;
  const realApts  = apartments.filter(a => a.id !== "all");
  const cleanText = looksLikeHtml(item.raw_text) ? stripHtml(item.raw_text) : (item.raw_text ?? "");

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
    console.error("[ConversationCard] buildAgentContext:", e);
  }

  const templateText = context ? generateGuestReply(context) : null;

  // Cerca la risposta suggerita salvata in agent_decisions dall'LLM
  const agentDecision = decisions?.find(d => d.inbox_id === item.id);
  const llmText       = agentDecision?.suggested_text ?? null;
  const isLlmGenerated = llmText && !agentDecision?.payload?.llm_failed;

  // Testo da mostrare: LLM se disponibile, altrimenti template deterministico
  const responseText = llmText ?? templateText;

  // Subito link: cerca in tutti i messaggi del thread, dal più recente
  const subitoLink = [...messages].reverse().reduce((found, msg) => {
    if (found) return found;
    const t = looksLikeHtml(msg.raw_text) ? stripHtml(msg.raw_text) : (msg.raw_text ?? "");
    return extractSubitoLink(msg.raw_metadata, t);
  }, null);

  const apt         = realApts.find(a => a.id === aptId);
  const color       = STATUS_COLORS[item.status] ?? "#c9a96e";
  const isActive    = thread.hasNewMessages;
  const decisionType = context?.decision?.type;
  const avail        = context?.availability;
  const pricing      = context?.pricing;
  const checkin      = context?.inquiry.checkin  ?? item.parsed_checkin;
  const checkout     = context?.inquiry.checkout ?? item.parsed_checkout;
  const guests       = context?.inquiry.guests   ?? item.parsed_guests;

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

  const btnPrimary = {
    borderRadius: "7px", padding: "0.3rem 0.7rem",
    fontSize: "0.7rem", cursor: "pointer", fontFamily: "Georgia,serif",
    fontWeight: "600", border: "none",
  };

  // Messaggi storici = tutti tranne l'ultimo
  const historyMessages = messages.slice(0, -1);

  return (
    <div style={{
      background: "#120f0a",
      border: "1px solid #2a2010",
      borderLeft: "3px solid " + color,
      borderRadius: "12px",
      padding: "0.85rem 1rem",
      marginBottom: "0.6rem",
    }}>

      {/* ── Header: source + status + decision + thread badge + data ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.45rem", gap: "0.5rem", flexWrap: "wrap" }}>
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
          {/* Thread badge — mostra solo se ci sono più messaggi */}
          {isThread && (
            <span style={{ background: "#1a2a3a", color: "#6ea0c9", border: "1px solid #6ea0c933", borderRadius: "20px", padding: "0.1rem 0.5rem", fontSize: "0.63rem", fontWeight: "700" }}>
              💬 {messageCount} messaggi
            </span>
          )}
        </div>
        <span style={{ color: "#4a3a20", fontSize: "0.6rem", flexShrink: 0 }}>
          {fmtDatetime(item.created_at)}
        </span>
      </div>

      {/* ── Meta: apt + periodo + ospiti + disponibilità + prezzo ── */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
        {apt ? (
          <span style={{ fontSize: "0.72rem", color: apt.color ?? "#c9a96e", fontWeight: "700" }}>
            🏠 {apt.label}
          </span>
        ) : unrecognized ? (
          <span style={{ fontSize: "0.68rem", color: "#c96e6e" }}>⚠️ Appartamento non riconosciuto</span>
        ) : null}
        {periodText && <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>📅 {periodText}</span>}
        {guests     && <span style={{ fontSize: "0.68rem", color: "#8a7a60" }}>👤 {guests} ospiti</span>}
        {avail && checkin && (
          <span style={{ fontSize: "0.68rem", fontWeight: "700", color: avail.isAvailable ? "#6ec99a" : "#c96e6e" }}>
            {avail.isAvailable ? "✓ Libero" : "✗ Occupato"}
          </span>
        )}
        {pricing?.totalPrice != null && checkin && !context?.stayRules?.isFullMonth && (
          <span style={{ fontSize: "0.7rem", color: "#c9a96e", fontWeight: "600" }}>€{pricing.totalPrice}</span>
        )}
      </div>

      {/* ── Risposta suggerita (sull'ultimo messaggio del thread) ── */}
      {responseText && (
        <div style={{
          fontSize: "0.78rem", color: "#a0d8a0", lineHeight: "1.55",
          background: "#0a140a", border: "1px solid #2a4a2a55",
          borderRadius: "8px", padding: "0.6rem 0.75rem", marginBottom: "0.55rem",
          whiteSpace: "pre-wrap",
        }}>
          <div style={{ fontSize: "0.58rem", color: isLlmGenerated ? "#6a9a9a" : "#4a8a4a", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "0.35rem", fontFamily: "'Playfair Display',serif", fontWeight: "700" }}>
            {isLlmGenerated ? "✨ Risposta Claude" : `Risposta suggerita${isThread ? " (ultimo messaggio)" : ""}`}
          </div>
          {responseText}
        </div>
      )}

      {/* ── Action bar ── */}
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>

        {responseText ? (
          <button
            onClick={handleCopy}
            style={{ ...btnPrimary, background: copied ? "#1a4a1a" : "#1a1a3a", color: copied ? "#6ec99a" : "#9999dd" }}>
            {copied ? "✓ Copiato!" : "📋 Copia risposta"}
          </button>
        ) : (
          <span style={{ fontSize: "0.65rem", color: "#3a3020" }}>Risposta non disponibile</span>
        )}

        {subitoLink ? (
          <a
            href={subitoLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnPrimary, background: "#1a1812", color: "#c9a96e", border: "1px solid #c9a96e33", textDecoration: "none", display: "inline-block" }}>
            🔗 Apri Subito
          </a>
        ) : (
          <span style={{ fontSize: "0.63rem", color: "#3a3020", fontStyle: "italic" }}>🔗 Link non disponibile</span>
        )}

        {isActive && (
          <button
            onClick={() => onMarkDone(allIds)}
            style={{ ...btnPrimary, background: "#0a1a0a", color: "#6ec99a", border: "1px solid #6ec99a33", marginLeft: "auto" }}>
            ✓ {isThread ? "Segna trattativa gestita" : "Segna gestito"}
          </button>
        )}
      </div>

      {/* ── Testo ultimo messaggio (collassato) ── */}
      {cleanText && (
        <div style={{ marginTop: "0.45rem" }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ background: "none", border: "none", color: "#3a2a18", fontSize: "0.6rem", cursor: "pointer", padding: 0, fontFamily: "Georgia,serif" }}>
            {showHistory
              ? "▲ Nascondi"
              : isThread
                ? `▼ Storico conversazione (${messageCount} messaggi)`
                : "▼ Messaggio ricevuto"}
          </button>
          {showHistory && (
            <div style={{
              marginTop: "0.4rem",
              paddingTop: "0.4rem",
              borderTop: "1px solid #2a2010",
            }}>
              {/* Messaggi storici — dal più vecchio al più recente */}
              {isThread && historyMessages.length > 0 && (
                <div style={{ marginBottom: "0.5rem" }}>
                  {historyMessages.map(msg => (
                    <HistoryMessageRow key={msg.id} msg={msg} />
                  ))}
                </div>
              )}
              {/* Testo ultimo messaggio */}
              <div style={{
                fontSize: "0.73rem", color: "#8a7a50", lineHeight: "1.45",
                background: "#0d0a07", borderRadius: "6px", padding: "0.4rem 0.6rem",
                whiteSpace: "pre-wrap",
              }}>
                {isThread && <div style={{ fontSize: "0.58rem", color: "#5a4a30", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ultimo messaggio</div>}
                {cleanText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sezione principale ────────────────────────────────────────────────────────

export default function MessaggiSection({ apartments, bookings, inbox, decisions, aptRules, agentLoading, updateInboxStatus, markThreadReplied }) {
  const [tab, setTab] = useState("nuovi");

  const threads  = groupInboxByThread(inbox ?? []);
  const nuovi    = threads.filter(t => t.hasNewMessages);
  const gestiti  = threads.filter(t => !t.hasNewMessages);
  const displayed = tab === "nuovi" ? nuovi : gestiti;

  async function handleMarkDone(ids) {
    if (markThreadReplied) {
      await markThreadReplied(ids);
    } else {
      // fallback per backward compat
      for (const id of ids) await updateInboxStatus(id, "replied");
    }
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
          { id: "nuovi",   label: "Nuovi",       count: nuovi.length   },
          { id: "gestiti", label: "Già gestiti", count: gestiti.length },
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
                padding:      "0.3rem 0.85rem",
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

      {/* Conversation cards */}
      {displayed.map(thread => (
        <ConversationCard
          key={thread.threadId}
          thread={thread}
          apartments={apartments}
          bookings={bookings ?? []}
          aptRules={aptRules}
          decisions={decisions ?? []}
          onMarkDone={handleMarkDone}
        />
      ))}
    </div>
  );
}
