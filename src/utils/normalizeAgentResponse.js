/**
 * normalizeAgentResponse — validates and normalises the response from manager-agent-brain.
 *
 * Returns a safe object if data is usable, null if it must fall back to local brain.
 */
export function normalizeAgentResponse(data) {
  if (!data || typeof data !== "object") return null;

  const reply =
    typeof data.reply === "string" && data.reply.trim()
      ? data.reply.trim()
      : null;

  if (!reply) return null;

  return {
    reply,
    intent: typeof data.intent === "string" ? data.intent : "no_action",
    confidence: typeof data.confidence === "number" ? data.confidence : 0.5,
    needs_clarification: data.needs_clarification === true,
    clarification_question: data.clarification_question ?? null,
    needs_confirmation: data.needs_confirmation === true,
    action_plan: data.action_plan ?? null,
    options: Array.isArray(data.options) ? data.options : [],
    resolved_references: Array.isArray(data.resolved_references) ? data.resolved_references : [],
    missing_fields: Array.isArray(data.missing_fields) ? data.missing_fields : [],
  };
}
