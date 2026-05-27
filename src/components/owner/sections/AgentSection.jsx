import { useState } from "react";
import { AGENT_PLATFORM_PROFILES } from "../../../constants";
import { runDecisionEngine } from "../../../utils/agentDecisionEngine";
import useAgentData from "../../../hooks/useAgentData";
import MessageComposer from "../../agent/MessageComposer";
import DecisionCard from "../../agent/DecisionCard";
import InboxList from "../../agent/InboxList";

// ── Fallback rules (frontend only, nessuna regola configurata) ────────────────
const FALLBACK_RULES = {
  baseNightlyRate:  80,
  cleaningFee:       0,
  extraGuestFee:     0,
  guestThreshold:    2,
  deposit:           0,
  minNights:         1,
  bufferBeforeDays:  0,
  bufferAfterDays:   0,
  maxDiscountPct:   10,
  minNetTarget:      0,
};

// ── snake_case DB → camelCase motore ──────────────────────────────────────────
function agentRuleToEngineRules(rule) {
  return {
    baseNightlyRate:  rule.base_nightly_rate,
    cleaningFee:      rule.cleaning_fee       ?? 0,
    extraGuestFee:    rule.extra_guest_fee     ?? 0,
    guestThreshold:   rule.guest_threshold     ?? 2,
    deposit:          rule.deposit_amount      ?? 0,
    minNights:        rule.min_nights          ?? 1,
    bufferBeforeDays: rule.buffer_before_days  ?? 0,
    bufferAfterDays:  rule.buffer_after_days   ?? 0,
    maxDiscountPct:   rule.max_discount_pct    ?? 10,
    minNetTarget:     rule.min_net_target      ?? 0,
  };
}

// ── Risoluzione regole: source-specific → default → fallback ──────────────────
function resolveAptRules(aptId, source, aptRules) {
  const specific = aptRules.find(r => r.apt_id === aptId && r.source === source);
  if (specific) return agentRuleToEngineRules(specific);
  const dflt = aptRules.find(r => r.apt_id === aptId && r.source === "default");
  if (dflt) return agentRuleToEngineRules(dflt);
  return { ...FALLBACK_RULES };
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function AgentSection({ apartments, bookings, user }) {
  const realApts = apartments.filter(a => a.id !== "all");

  const {
    aptRules,
    agentLoading,
    inbox,
    addInboxMessage,
    updateInboxStatus,
    addDecision,
  } = useAgentData(user);

  const [analyzing, setAnalyzing] = useState(false);
  const [decision,  setDecision]  = useState(null);
  const [inboxId,   setInboxId]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const [selectedInboxItem, setSelectedInboxItem] = useState(null);

  function handleLoadFromInbox(item) {
    setSelectedInboxItem(item);
    setDecision(null);
    setSaved(false);
    setInboxId(null);
  }

  async function handleAnalyze(formData) {
    setAnalyzing(true);
    setDecision(null);
    setSaved(false);
    setInboxId(null);

    try {
      let currentInboxId;

      if (selectedInboxItem) {
        await updateInboxStatus(selectedInboxItem.id, "processing");
        currentInboxId = selectedInboxItem.id;
      } else {
        const inboxRow = await addInboxMessage({
          source:                formData.source,
          raw_text:              formData.rawText       || null,
          parsed_checkin:        formData.checkin        || null,
          parsed_checkout:       formData.checkout       || null,
          parsed_guests:         formData.guests         || null,
          parsed_offered_price:  formData.offeredPrice != null ? formData.offeredPrice : null,
          parsed_apt_id:         formData.aptId          || null,
          apt_id:                formData.aptId          || null,
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

      const engineRules = resolveAptRules(formData.aptId, formData.source, aptRules);

      const profile       = AGENT_PLATFORM_PROFILES[formData.source] ?? AGENT_PLATFORM_PROFILES.altro;
      const commissionPct = profile.commissionPct ?? 0;

      const inquiry = {
        aptId:        formData.aptId,
        guestName:    "ospite",
        checkin:      formData.checkin      || null,
        checkout:     formData.checkout     || null,
        guests:       formData.guests,
        offeredPrice: formData.offeredPrice,
        source:       formData.source,
      };

      const result = runDecisionEngine(inquiry, bookings, engineRules, commissionPct);
      setDecision(result);
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
      const savedDecision = await addDecision(inboxId, { ...decision, responseText: editedText });

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
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "1.2rem", marginBottom: "0.9rem", marginTop: "0.4rem" }}>
        🤖 Agente Richieste
      </h2>

      {agentLoading && (
        <div style={{ color: "#6a5a40", fontSize: "0.8rem", marginBottom: "0.7rem" }}>
          Caricamento regole appartamento…
        </div>
      )}

      {realApts.length === 0 ? (
        <div style={{ background: "rgba(201,169,110,0.08)", border: "1px solid #c9a96e44", borderRadius: "10px", padding: "0.9rem 1rem" }}>
          <span style={{ color: "#c9a96e", fontSize: "0.85rem" }}>
            ⚠️ Nessun appartamento configurato. Aggiungine uno in <strong>Impostazioni</strong>.
          </span>
        </div>
      ) : (
        <>
          <InboxList inbox={inbox} onLoad={handleLoadFromInbox} />
          <MessageComposer
            apartments={realApts}
            onAnalyze={handleAnalyze}
            loading={analyzing || agentLoading}
            initialValues={selectedInboxItem}
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
  );
}
