import { useState, useRef, useEffect } from "react";
import { buildAgentContext }  from "../../utils/buildAgentContext";
import { generateGuestReply } from "../../utils/generateGuestReply";

const DECISION_LABELS = {
  available:         "Disponibile",
  unavailable:       "Non disponibile",
  has_alternatives:  "Alternative disponibili",
  outside_rules:     "Fuori regola",
  full_month:        "Mese intero",
  price_negotiation: "Negoziazione prezzo",
  needs_info:        "Info mancanti",
  manual_review:     "Revisione manuale",
};

const DECISION_COLORS = {
  available:         "#6ec99a",
  unavailable:       "#c96e6e",
  has_alternatives:  "#c9a96e",
  outside_rules:     "#c9c96e",
  full_month:        "#9ec9a9",
  price_negotiation: "#9e6ec9",
  needs_info:        "#6ea0c9",
  manual_review:     "#8a7a60",
};

export default function AgentChat({
  apartments = [],
  bookings   = [],
  aptRules   = [],
  inbox      = [],
  decisions  = [],
}) {
  const realApts = apartments.filter((a) => a.id !== "all");

  const [selectedApt, setSelectedApt] = useState(realApts[0]?.id ?? "");
  const [messages, setMessages] = useState([
    { role: "agent", text: "Ciao! Sono l'agente interno di GestAffitti.\n\nPosso analizzare richieste di soggiorno: disponibilità sul calendario, prezzi stagionali, regole sabato-sabato e alternative.\n\nIncolla qui il testo di un messaggio cliente per vedere la risposta suggerita, oppure scrivi una richiesta di prova." },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    const formData = {
      aptId:        selectedApt,
      source:       "subito",
      checkin:      "",
      checkout:     "",
      guests:       null,
      offeredPrice: "",
      isFullMonth:  false,
      fullMonthNum: null,
    };

    const context = buildAgentContext({
      rawText:     text,
      rawMetadata: {},
      formData,
      apartments,
      bookings,
      aptRules,
      inbox,
      decisions,
    });

    const reply = generateGuestReply(context);

    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "agent", text: reply, decisionType: context.decision.type },
    ]);
    setInput("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{ padding: "24px", maxWidth: 720, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>Agente GestAffitti</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#888" }}>
          Appartamento
        </label>
        <select
          value={selectedApt}
          onChange={(e) => setSelectedApt(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#1a1a1a",
            color: "#eee",
            fontSize: 14,
            minWidth: 220,
          }}
        >
          {realApts.length === 0 && <option value="">Nessun appartamento</option>}
          {realApts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label ?? a.name ?? a.id}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          background: "#111",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 16,
          height: 400,
          overflowY: "auto",
          marginBottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => {
          const isUser  = m.role === "user";
          const color   = DECISION_COLORS[m.decisionType] ?? null;
          const label   = DECISION_LABELS[m.decisionType] ?? null;
          return (
            <div
              key={i}
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                maxWidth: "80%",
              }}
            >
              <div
                style={{
                  background: isUser ? "#2a4a7f" : "#2a2a2a",
                  color: "#eee",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
              {!isUser && label && (
                <div
                  style={{
                    marginTop: 4,
                    display: "inline-block",
                    background: color + "22",
                    border: `1px solid ${color}66`,
                    color,
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {label}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio… (Invio per inviare)"
          rows={3}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#1a1a1a",
            color: "#eee",
            fontSize: 14,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            padding: "0 20px",
            borderRadius: 6,
            border: "none",
            background: input.trim() ? "#c9a96e" : "#444",
            color: input.trim() ? "#111" : "#777",
            fontWeight: 700,
            fontSize: 14,
            cursor: input.trim() ? "pointer" : "default",
            alignSelf: "flex-end",
            height: 40,
          }}
        >
          Invia
        </button>
      </div>
    </div>
  );
}
