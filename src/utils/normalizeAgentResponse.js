/**
 * normalizeAgentResponse — validates and normalises the response from manager-agent-brain.
 *
 * Reply path priority: data.reply → data.result.reply → data.data.reply → data.message
 * Returns a safe object with all required fields, or null to trigger local brain fallback.
 */
export function normalizeAgentResponse(data) {
  if (!data || typeof data !== "object") return null;

  // Resolve the source object that contains reply + other fields.
  let src;
  if (typeof data.reply === "string" && data.reply.trim()) {
    src = data;
  } else if (data.result && typeof data.result === "object" && typeof data.result.reply === "string" && data.result.reply.trim()) {
    src = data.result;
  } else if (data.data && typeof data.data === "object" && typeof data.data.reply === "string" && data.data.reply.trim()) {
    src = data.data;
  } else if (typeof data.message === "string" && data.message.trim()) {
    src = { ...data, reply: data.message };
  } else {
    return null;
  }

  const reply = src.reply.trim();
  if (!reply) return null;

  return {
    reply,
    intent:                 typeof src.intent === "string"  ? src.intent  : "no_action",
    confidence:             typeof src.confidence === "number" ? src.confidence : 0.5,
    needs_clarification:    src.needs_clarification === true,
    clarification_question: src.clarification_question ?? null,
    needs_confirmation:     src.needs_confirmation === true,
    action_plan:            src.action_plan ?? null,
    options:                Array.isArray(src.options) ? src.options : [],
    resolved_references:    Array.isArray(src.resolved_references) ? src.resolved_references : [],
    missing_fields:         Array.isArray(src.missing_fields) ? src.missing_fields : [],
    data_used:              src.data_used && typeof src.data_used === "object"
                              ? src.data_used
                              : { bookings: [], inbox: [], decisions: [], apartments: [], market: [] },
    reasoning_summary:      typeof src.reasoning_summary === "string" ? src.reasoning_summary : null,
    fallback:               src.fallback === true || src._fallback === true,
  };
}
