import { useState, useMemo, useRef, useEffect } from "react";
import { getManagerAgentSnapshot } from "../../../utils/managerAgentSnapshot.js";
import { parseOwnerCommand, validateCommand, planAction } from "../../../utils/managerAgentCommands.js";
import { executeAction } from "../../../utils/managerAgentActions.js";

// ── Style tokens ──────────────────────────────────────────────────────────────

const C = {
  gold:    "#c9a96e",
  goldDim: "#8a7a60",
  bg:      "#120f0a",
  bgDeep:  "#0a0806",
  border:  "#2a2010",
  text:    "#e8d5b0",
  textDim: "#6a5a40",
  green:   "#6ec99a",
  red:     "#c96e6e",
  blue:    "#6ea0c9",
  yellow:  "#c9c06e",
};

const card = (extra = {}) => ({
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: "12px",
  padding: "0.85rem",
  marginBottom: "0.75rem",
  ...extra,
});

const sectionTitle = (color = C.gold) => ({
  fontFamily: "'Playfair Display',serif",
  color,
  fontSize: "0.92rem",
  margin: "0 0 0.6rem",
});

const chip = (color = C.textDim) => ({
  display: "inline-block",
  fontSize: "0.62rem",
  color,
  background: `${color}18`,
  border: `1px solid ${color}44`,
  borderRadius: "10px",
  padding: "0.1rem 0.45rem",
  letterSpacing: "0.04em",
});

// ── Priority badge ────────────────────────────────────────────────────────────

function PriBadge({ priority }) {
  const colors = { 1: C.red, 2: C.yellow, 3: C.green, 4: C.textDim };
  const labels = { 1: "P1", 2: "P2", 3: "P3", 4: "P4" };
  const c = colors[priority] ?? C.textDim;
  return (
    <span style={{ ...chip(c), fontWeight: "700", minWidth: "2rem", textAlign: "center" }}>
      {labels[priority] ?? `P${priority}`}
    </span>
  );
}

// ── Today summary text ────────────────────────────────────────────────────────

function buildTodayText(snapshot) {
  const lines = [snapshot.agent_summary];
  if (snapshot.suggested_actions.length > 0) {
    lines.push("\nAzioni prioritarie:");
    snapshot.suggested_actions.slice(0, 6).forEach((a, i) => {
      lines.push(`${i + 1}. [P${a.priority}] ${a.action}`);
    });
  } else {
    lines.push("\nNessuna azione prioritaria.");
  }
  return lines.join("\n");
}

// ── Chat message component ────────────────────────────────────────────────────

function ChatBubble({ msg, onConfirm, onCancel }) {
  const isUser    = msg.role === "user";
  const isConfirm = msg.role === "confirm";
  const isAgent   = msg.role === "agent";

  const bubbleBg = isUser
    ? "#1e1a12"
    : isConfirm
    ? "#181410"
    : msg.error
    ? `${C.red}14`
    : msg.success === true
    ? `${C.green}12`
    : msg.cancelled
    ? "#181410"
    : "#181410";

  const textColor = msg.error
    ? C.red
    : msg.success === true
    ? C.green
    : C.text;

  return (
    <div style={{ marginBottom: "0.55rem", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "88%",
        background: bubbleBg,
        border: `1px solid ${isUser ? C.border : isConfirm ? C.yellow + "44" : C.border}`,
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        padding: "0.55rem 0.75rem",
      }}>
        {isUser && (
          <div style={{ fontSize: "0.62rem", color: C.goldDim, marginBottom: "0.2rem", fontWeight: "600" }}>TU</div>
        )}
        {(isAgent || isConfirm) && (
          <div style={{ fontSize: "0.62rem", color: C.goldDim, marginBottom: "0.2rem", fontWeight: "600" }}>AGENTE</div>
        )}
        <div style={{ fontSize: "0.82rem", color: textColor, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {msg.text}
        </div>
        {isConfirm && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem" }}>
            <button
              onClick={() => onConfirm(msg.plan)}
              style={{
                background: C.green + "22", border: `1px solid ${C.green}66`,
                borderRadius: "8px", padding: "0.38rem 0.85rem",
                color: C.green, fontSize: "0.75rem", cursor: "pointer", fontFamily: "Georgia,serif",
              }}
            >
              ✓ Conferma
            </button>
            <button
              onClick={onCancel}
              style={{
                background: C.red + "18", border: `1px solid ${C.red}44`,
                borderRadius: "8px", padding: "0.38rem 0.85rem",
                color: C.red, fontSize: "0.75rem", cursor: "pointer", fontFamily: "Georgia,serif",
              }}
            >
              ✕ Annulla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suggested actions list ────────────────────────────────────────────────────

function SuggestedActions({ actions }) {
  if (!actions.length) return null;
  return (
    <div style={card()}>
      <h3 style={sectionTitle()}>⚡ Azioni Consigliate</h3>
      {actions.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.55rem", padding: "0.4rem 0", borderBottom: i < actions.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <PriBadge priority={a.priority} />
          <span style={{ fontSize: "0.8rem", color: C.text, lineHeight: 1.45, flex: 1 }}>{a.action}</span>
        </div>
      ))}
    </div>
  );
}

// ── Messages to review ────────────────────────────────────────────────────────

const DECISION_LABELS = {
  available:        "Disponibile",
  has_alternatives: "Alternative",
  full_month:       "Mese intero",
  outside_rules:    "Fuori regola",
  price_negotiation:"Offerta prezzo",
  manual_review:    "Revisione manuale",
  needs_info:       "Info mancanti",
  no_decision:      "Non analizzato",
};

function MessagesBlock({ messages, opportunities }) {
  const all = [
    ...opportunities.map(o => ({ ...o, _type: "opp" })),
    ...messages.map(m => ({ ...m, _type: "msg" })),
  ];
  if (!all.length) return null;

  return (
    <div style={card()}>
      <h3 style={sectionTitle(C.blue)}>✉️ Messaggi e Richieste ({all.length})</h3>
      {all.map((item, i) => {
        const isOpp = item._type === "opp";
        const label = DECISION_LABELS[item.decisionType] ?? item.decisionType;
        const border = isOpp ? C.green : C.red;
        return (
          <div key={item.inboxId ?? i} style={{
            display: "flex", alignItems: "flex-start", gap: "0.5rem",
            padding: "0.45rem 0", borderBottom: i < all.length - 1 ? `1px solid ${C.border}` : "none",
            borderLeft: `3px solid ${border}`,
            paddingLeft: "0.55rem",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                <span style={chip(isOpp ? C.green : C.red)}>{isOpp ? "💬 Opportunità" : "⚠️ Da gestire"}</span>
                <span style={chip(C.textDim)}>{label}</span>
                {item.aptId && <span style={chip(C.gold)}>{item.aptId}</span>}
              </div>
              {item.guestName && (
                <div style={{ fontSize: "0.78rem", color: C.text, marginTop: "0.2rem", fontWeight: "500" }}>{item.guestName}</div>
              )}
              {item.preview && (
                <div style={{ fontSize: "0.72rem", color: C.textDim, marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.preview}</div>
              )}
              {isOpp && item.pricingTotal && (
                <div style={{ fontSize: "0.72rem", color: C.gold, marginTop: "0.1rem" }}>💶 €{item.pricingTotal}</div>
              )}
            </div>
            <div style={{ fontSize: "0.65rem", color: C.textDim, flexShrink: 0, textAlign: "right" }}>
              {item.source}
              {item.receivedAt && (
                <div>{item.receivedAt?.slice(0, 10)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Upcoming arrivals ─────────────────────────────────────────────────────────

function ArrivalsBlock({ arrivals }) {
  if (!arrivals.length) return null;
  return (
    <div style={card()}>
      <h3 style={sectionTitle(C.blue)}>🔑 Arrivi Imminenti ({arrivals.length})</h3>
      {arrivals.map((a, i) => (
        <div key={a.bookingId} style={{
          display: "flex", alignItems: "center", gap: "0.55rem",
          padding: "0.4rem 0", borderBottom: i < arrivals.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.83rem", color: C.text, fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.guest}</div>
            <div style={{ fontSize: "0.7rem", color: C.textDim }}>{a.apt} · {a.checkin} → {a.checkout} · {a.nights}n</div>
            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.15rem", flexWrap: "wrap" }}>
              <span style={chip(a.depositPaid ? C.green : C.yellow)}>{a.depositPaid ? "✓ Caparra" : "○ Caparra"}</span>
              <span style={chip(a.checkinDone ? C.green : C.textDim)}>{a.checkinDone ? "✓ Check-in" : "○ Check-in"}</span>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "0.78rem", color: C.gold, fontWeight: "600" }}>€{a.price}</div>
            <div style={{ fontSize: "0.68rem", color: a.daysUntil === 0 ? C.red : C.textDim }}>
              {a.daysUntil === 0 ? "OGGI" : `tra ${a.daysUntil}g`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Current guests ────────────────────────────────────────────────────────────

function CurrentGuestsBlock({ guests }) {
  if (!guests.length) return null;
  return (
    <div style={card({ borderColor: C.green + "44" })}>
      <h3 style={sectionTitle(C.green)}>🏠 Ospiti Presenti ({guests.length})</h3>
      {guests.map((g, i) => (
        <div key={g.bookingId} style={{
          display: "flex", alignItems: "center", gap: "0.55rem",
          padding: "0.4rem 0", borderBottom: i < guests.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.83rem", color: C.text, fontWeight: "500" }}>{g.guest}</div>
            <div style={{ fontSize: "0.7rem", color: C.textDim }}>{g.apt} · check-out {g.checkout}</div>
            {!g.checkinDone && (
              <span style={{ ...chip(C.red), marginTop: "0.15rem" }}>⚠ Check-in non registrato</span>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: C.textDim, flexShrink: 0 }}>
            {g.checkoutIn === 0 ? "esce oggi" : `${g.checkoutIn}g rimasti`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Calendar alerts ───────────────────────────────────────────────────────────

function AlertsBlock({ alerts }) {
  if (!alerts.length) return null;
  return (
    <div style={card({ borderColor: C.red + "55" })}>
      <h3 style={sectionTitle(C.red)}>🚨 Alert Calendario ({alerts.length})</h3>
      {alerts.map((a, i) => (
        <div key={`${a.bookingId}-${a.type}`} style={{
          display: "flex", alignItems: "flex-start", gap: "0.5rem",
          padding: "0.35rem 0", borderBottom: i < alerts.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <span style={chip(a.severity === "high" ? C.red : C.yellow)}>
            {a.severity === "high" ? "ALTA" : "MEDIA"}
          </span>
          <span style={{ fontSize: "0.8rem", color: C.text, lineHeight: 1.45, flex: 1 }}>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── Revenue notes ─────────────────────────────────────────────────────────────

function RevenueBlock({ notes }) {
  if (!notes.length) return null;
  return (
    <div style={card()}>
      <h3 style={sectionTitle(C.gold)}>💶 Note Entrate</h3>
      {notes.map((n, i) => (
        <div key={n.type} style={{ fontSize: "0.8rem", color: C.text, padding: "0.25rem 0", borderBottom: i < notes.length - 1 ? `1px solid ${C.border}` : "none" }}>
          {n.note}
        </div>
      ))}
    </div>
  );
}

// ── Chat command help ─────────────────────────────────────────────────────────

const COMMAND_EXAMPLES = [
  "cosa ho oggi",
  "caparra ricevuta di Rossi",
  "check-in fatto di Bianchi",
  "crea prenotazione per Mario Rossi in apt1 dal 5/7 al 12/7 prezzo 800",
  "cancella prenotazione di Verdi",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ManagerAgentSection({
  bookings = [],
  apartments = [],
  inbox = [],
  decisions = [],
  agentLoading = false,
  onAddBooking,
  onUpdateBooking,
}) {
  const today = new Date().toISOString().slice(0, 10);

  const snapshot = useMemo(
    () => getManagerAgentSnapshot({ inbox, decisions, bookings, apartments, today }),
    [inbox, decisions, bookings, apartments, today],
  );

  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput,   setChatInput]   = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  function sendCommand(text) {
    const t = text.trim();
    if (!t || isExecuting) return;
    setChatInput("");
    setShowHelp(false);

    const userMsg = { id: Date.now(), role: "user", text: t };
    setChatHistory(prev => [...prev, userMsg]);

    const parsed    = parseOwnerCommand(t, { apartments });
    const validated = validateCommand(parsed, { bookings, apartments, today });
    const plan      = planAction(parsed, validated);

    if (!plan.canExecute) {
      const errMsg = { id: Date.now() + 1, role: "agent", text: plan.message, error: true };
      setChatHistory(prev => [...prev, errMsg]);
      return;
    }

    if (plan.type === "show_today_tasks") {
      const taskMsg = { id: Date.now() + 1, role: "agent", text: buildTodayText(snapshot) };
      setChatHistory(prev => [...prev, taskMsg]);
      return;
    }

    const confirmMsg = { id: Date.now() + 1, role: "confirm", plan, text: plan.message };
    setChatHistory(prev => [...prev, confirmMsg]);
  }

  async function handleConfirm(plan) {
    setChatHistory(prev => prev.filter(m => m.role !== "confirm"));
    setIsExecuting(true);
    const result = await executeAction(plan, { onAddBooking, onUpdateBooking });
    setIsExecuting(false);
    setChatHistory(prev => [
      ...prev,
      {
        id: Date.now(),
        role: "agent",
        text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
        success: result.success,
        error: !result.success,
      },
    ]);
  }

  function handleCancel() {
    setChatHistory(prev => [
      ...prev.filter(m => m.role !== "confirm"),
      { id: Date.now(), role: "agent", text: "Operazione annullata.", cancelled: true },
    ]);
  }

  const hasPendingConfirm = chatHistory.some(m => m.role === "confirm");

  return (
    <div style={{ fontFamily: "Georgia,serif" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: C.gold, fontSize: "1.15rem", margin: 0 }}>
          🤖 Manager Agent
        </h2>
        {agentLoading && (
          <span style={{ fontSize: "0.7rem", color: C.textDim }}>Caricamento...</span>
        )}
      </div>

      {/* ── Agent summary banner ── */}
      <div style={{
        background: "#0d0a07",
        border: `1px solid ${C.gold}33`,
        borderRadius: "12px",
        padding: "0.8rem 0.95rem",
        marginBottom: "0.85rem",
        whiteSpace: "pre-wrap",
        fontSize: "0.82rem",
        lineHeight: 1.7,
        color: C.text,
      }}>
        {snapshot.agent_summary}
      </div>

      {/* ── Meta strip ── */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        {[
          { label: `${snapshot._meta.active_bookings} prenotazioni`, color: C.gold },
          { label: `${snapshot._meta.active_threads} thread attivi`, color: C.blue },
          { label: `${snapshot.calendar_alerts.length} alert`, color: snapshot.calendar_alerts.length > 0 ? C.red : C.textDim },
        ].map(m => (
          <span key={m.label} style={chip(m.color)}>{m.label}</span>
        ))}
      </div>

      {/* ── Operational blocks ── */}
      <SuggestedActions actions={snapshot.suggested_actions} />
      <AlertsBlock      alerts={snapshot.calendar_alerts} />
      <CurrentGuestsBlock guests={snapshot.current_guests} />
      <ArrivalsBlock    arrivals={snapshot.upcoming_arrivals} />
      <MessagesBlock    messages={snapshot.messages_to_review} opportunities={snapshot.pending_opportunities} />
      <RevenueBlock     notes={snapshot.revenue_notes} />

      {/* ── Chat command interface ── */}
      <div style={{ ...card(), borderColor: C.gold + "33" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
          <h3 style={sectionTitle()}>💬 Comandi Agente</h3>
          <button
            onClick={() => setShowHelp(h => !h)}
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: "6px", padding: "0.15rem 0.5rem",
              color: C.textDim, fontSize: "0.65rem", cursor: "pointer",
            }}
          >
            {showHelp ? "Chiudi" : "Esempi"}
          </button>
        </div>

        {showHelp && (
          <div style={{ marginBottom: "0.65rem", background: "#0d0a07", borderRadius: "8px", padding: "0.55rem 0.7rem" }}>
            <div style={{ fontSize: "0.68rem", color: C.goldDim, marginBottom: "0.35rem", fontWeight: "600" }}>ESEMPI DI COMANDI</div>
            {COMMAND_EXAMPLES.map(ex => (
              <div
                key={ex}
                onClick={() => { setChatInput(ex); setShowHelp(false); }}
                style={{ fontSize: "0.75rem", color: C.blue, padding: "0.2rem 0", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
              >
                {ex}
              </div>
            ))}
          </div>
        )}

        {/* Chat history */}
        {chatHistory.length > 0 && (
          <div style={{
            maxHeight: "320px", overflowY: "auto", marginBottom: "0.65rem",
            padding: "0.5rem 0", borderBottom: `1px solid ${C.border}`,
          }}>
            {chatHistory.map(msg => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
              />
            ))}
            {isExecuting && (
              <div style={{ fontSize: "0.75rem", color: C.textDim, padding: "0.4rem 0" }}>
                Esecuzione in corso...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input row */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCommand(chatInput); } }}
            placeholder="Dai un comando... (es. cosa ho oggi)"
            disabled={hasPendingConfirm || isExecuting}
            style={{
              flex: 1,
              background: "#0d0a07",
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              padding: "0.55rem 0.75rem",
              color: C.text,
              fontSize: "0.82rem",
              fontFamily: "Georgia,serif",
              outline: "none",
            }}
          />
          <button
            onClick={() => sendCommand(chatInput)}
            disabled={!chatInput.trim() || hasPendingConfirm || isExecuting}
            style={{
              background: chatInput.trim() && !hasPendingConfirm ? C.gold + "22" : "transparent",
              border: `1px solid ${C.gold}44`,
              borderRadius: "8px",
              padding: "0.55rem 0.85rem",
              color: chatInput.trim() && !hasPendingConfirm ? C.gold : C.textDim,
              cursor: chatInput.trim() && !hasPendingConfirm ? "pointer" : "default",
              fontSize: "0.82rem",
              fontFamily: "Georgia,serif",
              transition: "background 0.15s",
            }}
          >
            Invia
          </button>
        </div>
        {hasPendingConfirm && (
          <div style={{ fontSize: "0.68rem", color: C.yellow, marginTop: "0.35rem" }}>
            Conferma o annulla l'azione prima di dare un nuovo comando.
          </div>
        )}
      </div>
    </div>
  );
}
