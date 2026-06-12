import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

export default function useAgentData(user) {
  const [inbox,        setInbox]        = useState([]);
  const [decisions,    setDecisions]    = useState([]);
  const [aptRules,     setAptRules]     = useState([]);
  const [agentLoading, setAgentLoading] = useState(false);

  // ── Load all agent tables ────────────────────────────────────────────────────
  const loadAgentData = useCallback(async () => {
    if (!user) return;
    setAgentLoading(true);
    const [
      { data: ibData },
      { data: dcData },
      { data: arData },
    ] = await Promise.all([
      supabase.from("agent_inbox")     .select("*").order("created_at", { ascending: false }),
      supabase.from("agent_decisions") .select("*").order("created_at", { ascending: false }),
      supabase.from("agent_apt_rules") .select("*").order("apt_id"),
    ]);
    if (ibData) setInbox(ibData);
    if (dcData) setDecisions(dcData);
    if (arData) setAptRules(arData);
    setAgentLoading(false);
  }, [user]);

  useEffect(() => { loadAgentData(); }, [loadAgentData]);

  // ── agent_inbox ──────────────────────────────────────────────────────────────

  const addInboxMessage = async (payload) => {
    const { data, error } = await supabase
      .from("agent_inbox").insert(payload).select().single();
    if (error) { console.error("[agent_inbox] insert:", error.message); return null; }
    if (data) setInbox(prev => [data, ...prev]);
    return data;
  };

  const updateInboxStatus = async (id, status) => {
    const updated_at = new Date().toISOString();
    const { error } = await supabase
      .from("agent_inbox")
      .update({ status, updated_at })
      .eq("id", id);
    if (!error)
      setInbox(prev => prev.map(m => m.id === id ? { ...m, status, updated_at } : m));
  };

  // Marks all messages in a thread as replied in a single DB call.
  const markThreadReplied = async (ids) => {
    if (!ids?.length) return;
    const updated_at = new Date().toISOString();
    const { error } = await supabase
      .from("agent_inbox")
      .update({ status: "replied", updated_at })
      .in("id", ids);
    if (!error)
      setInbox(prev => prev.map(m =>
        ids.includes(m.id) ? { ...m, status: "replied", updated_at } : m
      ));
  };

  // ── agent_decisions ──────────────────────────────────────────────────────────

  const addDecision = async (inboxId, decision) => {
    const row = {
      inbox_id:       inboxId,
      decision_type:  decision.type,
      response_text:  decision.responseText  ?? null,
      suggested_text: decision.suggested_text ?? null,
      was_modified:   decision.was_modified   ?? false,
      payload:        decision.payload        ?? null,
      decision_score: decision.decision_score ?? null,
    };
    const { data, error } = await supabase
      .from("agent_decisions").insert(row).select().single();
    if (error) { console.error("[agent_decisions] insert:", error.message); return null; }
    if (data) setDecisions(prev => [data, ...prev]);
    return data;
  };

  const approveDecision = async (id, ownerNotes = null) => {
    const approved_at = new Date().toISOString();
    const { error } = await supabase
      .from("agent_decisions")
      .update({ approved_at, owner_notes: ownerNotes })
      .eq("id", id);
    if (!error)
      setDecisions(prev => prev.map(d =>
        d.id === id ? { ...d, approved_at, owner_notes: ownerNotes } : d
      ));
  };

  // ── agent_apt_rules ──────────────────────────────────────────────────────────

  const upsertAptRule = async (aptId, source, ruleFields) => {
    const row = {
      apt_id: aptId,
      source,
      ...ruleFields,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("agent_apt_rules")
      .upsert(row, { onConflict: "apt_id,source" })
      .select()
      .single();
    if (error) { console.error("[agent_apt_rules] upsert:", error.message); return null; }
    if (data)
      setAptRules(prev => {
        const exists = prev.some(r => r.apt_id === aptId && r.source === source);
        return exists
          ? prev.map(r => (r.apt_id === aptId && r.source === source) ? data : r)
          : [...prev, data];
      });
    return data;
  };

  const deleteAptRule = async (id) => {
    const { error } = await supabase.from("agent_apt_rules").delete().eq("id", id);
    if (!error) setAptRules(prev => prev.filter(r => r.id !== id));
  };

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    agentLoading,
    inbox,
    decisions,
    aptRules,
    loadAgentData,
    addInboxMessage,
    updateInboxStatus,
    markThreadReplied,
    addDecision,
    approveDecision,
    upsertAptRule,
    deleteAptRule,
  };
}
