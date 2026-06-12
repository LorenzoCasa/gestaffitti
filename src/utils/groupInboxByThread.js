/**
 * Groups agent_inbox messages into conversation threads.
 *
 * Grouping key:
 *   source_thread_id (non-null) → stessa conversazione Subito
 *   null                        → ogni messaggio è una trattativa standalone
 *
 * Returns threads sorted by last activity, newest first.
 *
 * @param {Array} inbox  — rows from agent_inbox
 * @returns {Array<ConversationThread>}
 *
 * ConversationThread shape:
 * {
 *   threadId        string   — source_thread_id | "_solo_<id>"
 *   isThread        boolean  — true if 2+ messages share this threadId
 *   messageCount    number
 *   messages        Array    — sorted oldest→newest (for history display)
 *   latestMessage   object   — newest message (drives agent context + reply)
 *   firstMessage    object   — oldest message
 *   lastActivityAt  string   — ISO datetime of latest message
 *   hasNewMessages  boolean  — true if any message is new/processing
 *   allIds          string[] — all message IDs (for bulk status update)
 *   source          string
 *   status          string   — status of latest message
 *   apt_id          string|null
 *   parsed_guest_name string|null
 * }
 */
export function groupInboxByThread(inbox) {
  const map = new Map();

  for (const msg of inbox) {
    const key = msg.source_thread_id ?? `_solo_${msg.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(msg);
  }

  const threads = [];
  for (const msgs of map.values()) {
    msgs.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

    const latest = msgs[msgs.length - 1];

    threads.push({
      threadId:          latest.source_thread_id ?? `_solo_${latest.id}`,
      isThread:          msgs.length > 1,
      messageCount:      msgs.length,
      messages:          msgs,
      latestMessage:     latest,
      firstMessage:      msgs[0],
      lastActivityAt:    latest.created_at ?? "",
      hasNewMessages:    msgs.some(m => ["new", "processing"].includes(m.status)),
      allIds:            msgs.map(m => m.id),
      source:            latest.source,
      status:            latest.status,
      apt_id:            latest.apt_id,
      parsed_guest_name: latest.parsed_guest_name ?? null,
    });
  }

  return threads.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}
