import { useState } from "react";
import { AGENT_PLATFORM_PROFILES } from "../../../constants";
import { runDecisionEngine } from "../../../utils/agentDecisionEngine";
import useAgentData from "../../../hooks/useAgentData";
import MessageComposer from "../../agent/MessageComposer";
import DecisionCard from "../../agent/DecisionCard";

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
    addInboxMessage,
    addDecision,
  } = useAgentData(user);

  const [analyzing, setAnalyzing] = useState(false);
  const [decision,  setDecision]  = useState(null);
  const [inboxId,   setInboxId]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  async function handleAnalyze(formData) {
    setAnalyzing(true);
    setDecision(null);
    setSaved(false);
    setInboxId(null);

    // 1. Salva messaggio in agent_inbox
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

    setInboxId(inboxRow?.id ?? null);

    // 2. Risolvi regole appartamento
    const engineRules = resolveAptRules(formData.aptId, formData.source, aptRules);

    // 3. Commissione piattaforma
    const profile       = AGENT_PLATFORM_PROFILES[formData.source] ?? AGENT_PLATFORM_PROFILES.altro;
    const commissionPct = profile.commissionPct ?? 0;

    // 4. Inquiry per il motore
    const inquiry = {
      aptId:        formData.aptId,
      guestName:    "ospite",
      checkin:      formData.checkin      || null,
      checkout:     formData.checkout     || null,
      guests:       formData.guests,
      offeredPrice: formData.offeredPrice,
      source:       formData.source,
    };

    // 5. Decision engine (puro, nessun side-effect)
    const result = runDecisionEngine(inquiry, bookings, engineRules, commissionPct);
    setDecision(result);
    setAnalyzing(false);
  }

  async function handleSave(editedText) {
    if (!decision) return;
    setSaving(true);
    await addDecision(inboxId, { ...decision, responseText: editedText });
    setSaving(false);
    setSaved(true);
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
          <MessageComposer
            apartments={realApts}
            onAnalyze={handleAnalyze}
            loading={analyzing}
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
