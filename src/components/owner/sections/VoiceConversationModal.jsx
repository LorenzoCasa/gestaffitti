import { useState, useEffect, useRef } from "react";
import { useSpeechRecognition } from "../../../hooks/useSpeechRecognition.js";
import { useSpeechSynthesis }   from "../../../hooks/useSpeechSynthesis.js";
import { interpretMessage }      from "../../../utils/managerAgentBrain.js";
import { executeAction }         from "../../../utils/managerAgentActions.js";
import { buildManagerAgentLLMContext, validateLLMActionPlan } from "../../../utils/managerAgentLLMContext.js";
import { supabase }              from "../../../supabaseClient.js";

const C = {
  gold:    "#c9a96e",
  goldDim: "#8a7a60",
  bg:      "#120f0a",
  border:  "#2a2010",
  text:    "#e8d5b0",
  textDim: "#6a5a40",
  green:   "#6ec99a",
  red:     "#c96e6e",
  yellow:  "#c9c06e",
};

const PULSE_STYLE_ID = "vc-pulse-style";
function ensurePulseStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = PULSE_STYLE_ID;
  s.textContent = `
    @keyframes vc-pulse { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.12);opacity:1} }
    @keyframes vc-spin   { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  `;
  document.head.appendChild(s);
}

function TurnBubble({ turn, onConfirm, onCancel, onOptionSelect, isExecuting }) {
  const isUser = turn.role === "user";
  const bg     = isUser ? "#1e1a12" : turn.error ? `${C.red}14` : turn.success ? `${C.green}12` : "#181410";
  const tc     = turn.error ? C.red : turn.success ? C.green : C.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: "0.55rem" }}>
      <div style={{
        maxWidth: "92%", background: bg,
        border: `1px solid ${isUser ? C.border : turn.needsConfirm ? C.yellow+"55" : C.border}`,
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        padding: "0.55rem 0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.18rem" }}>
          <div style={{ fontSize: "0.58rem", color: C.goldDim, fontWeight: "600", letterSpacing: ".05em" }}>
            {isUser ? "TU" : "AGENTE"}
          </div>
          {turn.isFallback && (
            <span style={{ fontSize: "0.52rem", color: C.textDim, background: `${C.textDim}18`, border: `1px solid ${C.textDim}33`, borderRadius: "6px", padding: "0.05rem 0.3rem" }}>offline</span>
          )}
        </div>
        <div style={{ fontSize: "0.8rem", color: tc, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{turn.text}</div>
        {/* Options (multiple candidates) */}
        {!turn.needsConfirm && turn.options?.length > 0 && (
          <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {turn.options.map((opt, i) => (
              <button key={i} onClick={() => onOptionSelect?.(opt)}
                style={{ background: `${C.gold}14`, border: `1px solid ${C.gold}44`, borderRadius: "8px", padding: "0.32rem 0.7rem", color: C.gold, fontSize: "0.72rem", cursor: "pointer", textAlign: "left", fontFamily: "Georgia,serif" }}>
                {i + 1}. {typeof opt === "string" ? opt : (opt.label ?? opt.guest ?? JSON.stringify(opt))}
              </button>
            ))}
          </div>
        )}
        {turn.needsConfirm && !isExecuting && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem", flexWrap: "wrap" }}>
            <button onClick={() => onConfirm(turn.actionPlan)} style={{ background: C.green+"22", border: `1px solid ${C.green}66`, borderRadius: "8px", padding: "0.38rem 0.85rem", color: C.green, fontSize: "0.73rem", cursor: "pointer", fontFamily: "Georgia,serif" }}>✓ Conferma</button>
            <button onClick={onCancel} style={{ background: C.red+"18", border: `1px solid ${C.red}44`, borderRadius: "8px", padding: "0.38rem 0.85rem", color: C.red, fontSize: "0.73rem", cursor: "pointer", fontFamily: "Georgia,serif" }}>✕ Annulla</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VoiceConversationModal({ open, onClose, bookings=[], apartments=[], inbox=[], decisions=[], snapshot=null, onAddBooking, onUpdateBooking }) {
  const today = new Date().toISOString().slice(0, 10);
  const [turns,       setTurns]       = useState([]);
  const [textInput,   setTextInput]   = useState("");
  const [isThinking,  setIsThinking]  = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [voiceOn,     setVoiceOn]     = useState(true);
  const endRef = useRef(null);

  const { isListening, transcript, error: recError, supported: recSupported, startListening, stopListening } =
    useSpeechRecognition({ lang: "it-IT" });
  const { speak, stop: stopSpeech, supported: synSupported } =
    useSpeechSynthesis({ lang: "it-IT", rate: 0.88 });

  useEffect(() => { ensurePulseStyle(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, isThinking]);
  useEffect(() => { if (transcript) setTextInput(transcript); }, [transcript]);
  useEffect(() => {
    if (!isListening && transcript.trim()) handleSend(transcript.trim());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  const hasPendingConfirm = turns.some(t => t.needsConfirm);

  function buildHistory() {
    return turns
      .filter(t => t.role === "user" || t.role === "agent")
      .slice(-10)
      .map(t => ({ role: t.role === "user" ? "user" : "assistant", content: t.text }));
  }

  async function handleSend(rawText) {
    const t = (rawText ?? textInput).trim();
    if (!t || isThinking || isExecuting || hasPendingConfirm) return;
    setTextInput("");
    stopSpeech();
    setTurns(prev => [...prev, { id: Date.now(), role: "user", text: t }]);
    setIsThinking(true);

    try {
      const context = buildManagerAgentLLMContext({ inbox, decisions, bookings, apartments, snapshot, today });
      const { data, error } = await supabase.functions.invoke("manager-agent-brain", {
        body: { message: t, conversation: buildHistory(), context },
      });

      if (error || !data?.reply) throw new Error(error?.message ?? "Edge Function non disponibile");

      setIsThinking(false);

      let resolvedPlan = null;
      let planError = null;
      if (data.needs_confirmation && data.action_plan) {
        const validation = validateLLMActionPlan(data.action_plan, { bookings, apartments, today });
        if (validation.valid) {
          resolvedPlan = validation.plan;
        } else {
          planError = validation.error;
        }
      }

      const needsConfirm = !planError && !!resolvedPlan;
      const replyText = planError
        ? `${data.reply}\n\n💡 Ho capito l'intenzione, ma non posso procedere: ${planError}`
        : data.reply;

      setTurns(prev => [...prev, {
        id: Date.now()+1, role: "agent",
        text: replyText,
        needsConfirm,
        actionPlan: needsConfirm ? resolvedPlan : null,
        options:    data.options ?? [],
      }]);
      if (voiceOn && synSupported) speak(data.reply);

    } catch {
      setIsThinking(false);
      const ctx = { bookings, apartments, inbox, decisions, snapshot, today };
      const result = interpretMessage(t, ctx);
      setTurns(prev => [...prev, {
        id: Date.now()+1, role: "agent",
        text: result.reply,
        needsConfirm: result.needs_confirmation,
        actionPlan:   result.needs_confirmation ? result.action_plan : null,
        options:      result.options ?? [],
        isFallback:   true,
      }]);
      if (voiceOn && synSupported) speak(result.reply);
    }
  }

  async function handleConfirm(plan) {
    setTurns(prev => prev.map(t => t.needsConfirm ? { ...t, needsConfirm: false } : t));
    setIsExecuting(true);
    stopSpeech();
    const result = await executeAction({ ...plan, canExecute: true }, { onAddBooking, onUpdateBooking });
    setIsExecuting(false);
    const txt = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
    setTurns(prev => [...prev, { id: Date.now(), role: "agent", text: txt, success: result.success, error: !result.success }]);
    if (voiceOn && synSupported) speak(txt);
  }

  function handleCancel() {
    setTurns(prev => [
      ...prev.map(t => t.needsConfirm ? { ...t, needsConfirm: false } : t),
      { id: Date.now(), role: "agent", text: "Operazione annullata.", cancelled: true },
    ]);
  }

  function toggleMic() {
    if (isListening) stopListening();
    else { setTextInput(""); startListening(); }
  }

  function handleClose() { stopListening(); stopSpeech(); onClose(); }

  if (!open) return null;

  const micColor   = isListening ? C.red : C.gold;
  const micAnimate = isListening ? "vc-pulse 1s infinite" : "none";

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{ width: "100%", maxWidth: "540px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "20px 20px 0 0", padding: "1.2rem 1rem 1.4rem", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 -4px 32px rgba(0,0,0,.6)" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <span style={{ fontSize: "1.25rem" }}>🎙</span>
            <span style={{ fontFamily: "'Playfair Display',serif", color: C.gold, fontSize: "1rem", fontWeight: "600" }}>Agente Vocale</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            {synSupported && (
              <button onClick={() => { setVoiceOn(v => !v); if (voiceOn) stopSpeech(); }}
                style={{ background: voiceOn ? C.gold+"22" : "transparent", border: `1px solid ${voiceOn ? C.gold+"55" : C.border}`, borderRadius: "8px", padding: "0.25rem 0.6rem", color: voiceOn ? C.gold : C.textDim, fontSize: "0.7rem", cursor: "pointer" }}>
                {voiceOn ? "🔊 Voce on" : "🔇 Voce off"}
              </button>
            )}
            <button onClick={handleClose} style={{ background: "transparent", border: "none", color: C.textDim, fontSize: "1.1rem", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {turns.length === 0 && !isThinking && (
            <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎙</div>
              <div style={{ fontSize: "0.82rem", color: C.textDim, lineHeight: 1.7 }}>
                {recSupported
                  ? "Premi il microfono e parla, oppure digita un comando.\nEs: \"Fammi il punto\" · \"Rossi ha confermato\" · \"Chi devo richiamare?\""
                  : "Il tuo browser non supporta il riconoscimento vocale.\nDigita un comando qui sotto."}
              </div>
            </div>
          )}
          {turns.map(turn => <TurnBubble key={turn.id} turn={turn} onConfirm={handleConfirm} onCancel={handleCancel} onOptionSelect={(opt) => { const label = typeof opt === "string" ? opt : (opt.label ?? opt.guest ?? JSON.stringify(opt)); setTextInput(label); }} isExecuting={isExecuting} />)}
          {isThinking && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", padding: "0.35rem 0.1rem" }}>
              <div style={{ width: "22px", height: "22px", border: `2px solid ${C.border}`, borderTop: `2px solid ${C.gold}`, borderRadius: "50%", animation: "vc-spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "0.75rem", color: C.textDim }}>Agente sta pensando…</span>
            </div>
          )}
          {isExecuting && <div style={{ fontSize: "0.75rem", color: C.textDim, padding: "0.3rem 0.1rem" }}>Esecuzione in corso…</div>}
          <div ref={endRef} />
        </div>

        {isListening && (
          <div style={{ textAlign: "center", fontSize: "0.72rem", color: C.red, padding: "0.3rem 0", flexShrink: 0 }}>
            {textInput ? `"${textInput}"` : "In ascolto…"}
          </div>
        )}
        {recError && <div style={{ fontSize: "0.7rem", color: C.red, padding: "0.2rem 0", flexShrink: 0 }}>{recError}</div>}

        <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.75rem", alignItems: "center", flexShrink: 0 }}>
          {recSupported && (
            <button onClick={toggleMic} disabled={hasPendingConfirm || isExecuting || isThinking}
              style={{ flexShrink: 0, width: "44px", height: "44px", borderRadius: "50%", background: isListening ? C.red+"22" : C.gold+"18", border: `2px solid ${micColor}66`, color: micColor, fontSize: "1.15rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: (hasPendingConfirm||isExecuting||isThinking) ? "default" : "pointer", animation: micAnimate, transition: "background 0.2s" }}>
              {isListening ? "⬛" : "🎙"}
            </button>
          )}
          <input value={textInput} onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={hasPendingConfirm ? "Conferma o annulla l'azione…" : "Digita o parla…"}
            disabled={hasPendingConfirm || isExecuting || isListening}
            style={{ flex: 1, background: "#0d0a07", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0.55rem 0.75rem", color: C.text, fontSize: "0.82rem", fontFamily: "Georgia,serif", outline: "none", opacity: (hasPendingConfirm||isListening) ? 0.55 : 1 }}
          />
          <button onClick={() => handleSend()} disabled={!textInput.trim() || hasPendingConfirm || isExecuting || isListening || isThinking}
            style={{ flexShrink: 0, background: textInput.trim()&&!hasPendingConfirm ? C.gold+"22" : "transparent", border: `1px solid ${C.gold}44`, borderRadius: "10px", padding: "0.55rem 0.85rem", color: textInput.trim()&&!hasPendingConfirm ? C.gold : C.textDim, cursor: textInput.trim()&&!hasPendingConfirm ? "pointer" : "default", fontSize: "0.8rem", fontFamily: "Georgia,serif" }}>
            Invia
          </button>
        </div>
        {hasPendingConfirm && (
          <div style={{ fontSize: "0.65rem", color: C.yellow, marginTop: "0.35rem", textAlign: "center", flexShrink: 0 }}>
            Conferma o annulla l'azione prima di continuare.
          </div>
        )}
      </div>
    </div>
  );
}
