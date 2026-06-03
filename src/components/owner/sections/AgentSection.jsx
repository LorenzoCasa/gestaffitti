import { useState } from "react";
import { parseAgentInquiry }    from "../../../utils/agentParser";
import { resolveListingFromTitle, extractListingTitle } from "../../../utils/agentListingResolver";
import { runRentalAgent }        from "../../../utils/rentalAgentOrchestrator";
import useAgentData from "../../../hooks/useAgentData";
import MessageComposer from "../../agent/MessageComposer";
import DecisionCard from "../../agent/DecisionCard";
import InboxList from "../../agent/InboxList";
import AgentChat from "../../agent/AgentChat";

export default function AgentSection({ apartments, bookings, user }) {
  const realApts = apartments.filter(a => a.id !== "all");
  const [mode, setMode] = useState("chat");
  const [showDebug, setShowDebug] = useState(false);

  const {
    aptRules,
    agentLoading,
    inbox,
    decisions,
    addInboxMessage,
    updateInboxStatus,
    addDecision,
  } = useAgentData(user);

  const [analyzing, setAnalyzing] = useState(false);
  const [decision,  setDecision]  = useState(null);
  const [inboxId,   setInboxId]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const [selectedInboxItem,     setSelectedInboxItem]     = useState(null);
  const [parserResult,          setParserResult]          = useState(null);
  const [composerInitialValues, setComposerInitialValues] = useState(null);
  const [listingWarning,        setListingWarning]        = useState(null);

  function handleLoadFromInbox(item) {
    setSelectedInboxItem(item);
    setDecision(null);
    setSaved(false);
    setInboxId(null);
    setListingWarning(null);
    const parsed        = parseAgentInquiry(item.raw_text ?? "", item.raw_metadata ?? {});
    const candidateTitle = extractListingTitle(item.raw_metadata ?? {});
    const resolvedAptId  = resolveListingFromTitle(candidateTitle, realApts);
    if (candidateTitle && !resolvedAptId) {
      setListingWarning(`Annuncio non riconosciuto: "${candidateTitle}". Seleziona l'appartamento manualmente.`);
    }
    const aptId = resolvedAptId ?? "";
    setParserResult(parsed);
    setComposerInitialValues({
      rawText:      item.raw_text       ?? "",
      source:       item.source         ?? "subito",
      checkin:      parsed.checkin      ?? "",
      checkout:     parsed.checkout     ?? "",
      guests:       parsed.guests       ?? 2,
      aptId,
      offeredPrice: parsed.offeredPrice ?? "",
      isFullMonth:  parsed.isFullMonth  ?? false,
      fullMonthNum: parsed.fullMonthNum ?? null,
    });
  }

  async function handleAnalyze(formData) {
    setAnalyzing(true);
    setDecision(null);
    setSaved(false);
    setInboxId(null);

    try {
      const agentResult = runRentalAgent({
        rawText:     formData.rawText,
        rawMetadata: selectedInboxItem?.raw_metadata ?? {},
        formData,
        apartments:  realApts,
        bookings,
        aptRules,
      });

      const { normalizedFormData } = agentResult;

      let currentInboxId;

      if (selectedInboxItem) {
        await updateInboxStatus(selectedInboxItem.id, "processing");
        currentInboxId = selectedInboxItem.id;
      } else {
        const inboxRow = await addInboxMessage({
          source:                normalizedFormData.source,
          raw_text:              normalizedFormData.rawText       || null,
          parsed_checkin:        normalizedFormData.checkin        || null,
          parsed_checkout:       normalizedFormData.checkout       || null,
          parsed_guests:         normalizedFormData.guests         || null,
          parsed_offered_price:  normalizedFormData.offeredPrice != null ? normalizedFormData.offeredPrice : null,
          parsed_apt_id:         normalizedFormData.aptId          || null,
          apt_id:                normalizedFormData.aptId          || null,
          status:                "processing",
          owner_action_required: true,
        });

        if (!inboxRow) {
          alert("Errore nel salvataggio della richiesta. Controlla Supabase/RLS prima di procedere.");
          return;
        }

        currentInboxId = inboxRow.id;
      }

      setInboxId(currentInboxId);
      setDecision(agentResult.finalDecision);
    } catch (err) {
      console.error("[AgentSection] handleAnalyze:", err);
      alert("Errore durante l'analisi della richiesta.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave(editedText) {
    if (!decision || !inboxId) return;

    setSaving(true);
    try {
      const suggestedText = decision.responseText ?? "";
      const finalText     = editedText;
      const wasModified   = suggestedText.trim() !== finalText.trim();

      const savedDecision = await addDecision(inboxId, {
        ...decision,
        responseText:   finalText,
        suggested_text: suggestedText,
        was_modified:   wasModified,
      });

      if (!savedDecision) {
        alert("Errore nel salvataggio della decisione.");
        return;
      }

      await updateInboxStatus(inboxId, "replied");
      setSaved(true);
      setSelectedInboxItem(null);
    } catch (err) {
      console.error("[AgentSection] handleSave:", err);
      alert("Errore durante il salvataggio della risposta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "1.2rem", marginBottom: "0.6rem", marginTop: "0.4rem" }}>
        🤖 Agente Interno
      </h2>

      {/* Chat — sempre visibile, è l'unica UI principale */}
      <AgentChat
        apartments={apartments}
        bookings={bookings}
        aptRules={aptRules}
        inbox={inbox}
        decisions={decisions}
      />

      {/* Debug / Strumenti — collassato, non presentato come flusso normale */}
      <div style={{ marginTop: "1.2rem" }}>
        <button
          onClick={() => setShowDebug(d => !d)}
          style={{ background: "none", border: "none", color: "#2a2010", fontSize: "0.58rem", cursor: "pointer", padding: 0, fontFamily: "Georgia,serif", letterSpacing: "0.05em" }}>
          {showDebug ? "▲ Nascondi strumenti" : "▼ Strumenti / Debug"}
        </button>

        {showDebug && (
          <div style={{ marginTop: "0.7rem", padding: "0.8rem", background: "#0d0a07", border: "1px solid #1a1510", borderRadius: "10px" }}>
            <div style={{ fontSize: "0.65rem", color: "#4a3a20", marginBottom: "0.7rem", fontFamily: "'Playfair Display',serif" }}>
              Analisi manuale — strumento di debug. La gestione operativa avviene in Messaggi.
            </div>
            {agentLoading && (
              <div style={{ color: "#6a5a40", fontSize: "0.8rem", marginBottom: "0.7rem" }}>
                Caricamento regole appartamento…
              </div>
            )}
            {realApts.length === 0 ? (
              <div style={{ color: "#c9a96e", fontSize: "0.8rem" }}>
                ⚠️ Nessun appartamento configurato.
              </div>
            ) : (
              <>
                <InboxList inbox={inbox} onLoad={handleLoadFromInbox} />
                {listingWarning && (
                  <div style={{ background: "rgba(201,110,110,0.08)", border: "1px solid #c96e6e55", borderRadius: "8px", padding: "0.55rem 0.75rem", marginBottom: "0.7rem", fontSize: "0.73rem", color: "#c96e6e" }}>
                    ⚠️ {listingWarning}
                  </div>
                )}
                {parserResult && (
                  <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "10px", padding: "0.65rem 0.9rem", marginBottom: "0.7rem", fontSize: "0.73rem" }}>
                    <div style={{ color: "#8a7a60", fontFamily: "'Playfair Display',serif", marginBottom: "0.3rem" }}>🧠 Parser</div>
                    {parserResult.isFullMonth && <div style={{ color: "#c9a96e" }}>📅 Richiesta mese intero (mese {parserResult.fullMonthNum})</div>}
                    {parserResult.missingFields.length > 0 && <div style={{ color: "#c96e6e" }}>⚠️ Da completare: {parserResult.missingFields.join(", ")}</div>}
                    {parserResult.warnings.length > 0 && <div style={{ color: "#c9c96e" }}>⚠️ {parserResult.warnings.join(", ")}</div>}
                    {!parserResult.isFullMonth && parserResult.missingFields.length === 0 && <div style={{ color: "#6ec99a" }}>✓ Date e ospiti riconosciuti</div>}
                  </div>
                )}
                <MessageComposer
                  apartments={realApts}
                  onAnalyze={handleAnalyze}
                  loading={analyzing || agentLoading}
                  initialValues={composerInitialValues}
                />
                {decision && (
                  <DecisionCard
                    decision={decision}
                    onSave={handleSave}
                    saving={saving}
                    saved={saved}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
