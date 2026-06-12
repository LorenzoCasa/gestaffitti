/**
 * Test Sprint C1.2 — groupInboxByThread
 * Run: node src/utils/test-groupInboxByThread.mjs
 */

import { groupInboxByThread } from "./groupInboxByThread.js";

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      got:      ${JSON.stringify(actual)}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    fail++;
  }
}
function checkArr(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); console.log(`      got:      ${a}`); console.log(`      expected: ${e}`); fail++; }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const msgA1 = { id: "a1", source_thread_id: "subito_111", created_at: "2026-06-01T10:00:00Z", status: "new",     source: "subito", apt_id: "apt1", parsed_guest_name: "Mario" };
const msgA2 = { id: "a2", source_thread_id: "subito_111", created_at: "2026-06-01T11:00:00Z", status: "replied", source: "subito", apt_id: "apt1", parsed_guest_name: "Mario" };
const msgA3 = { id: "a3", source_thread_id: "subito_111", created_at: "2026-06-01T12:00:00Z", status: "new",     source: "subito", apt_id: "apt1", parsed_guest_name: "Mario" };

const msgB1 = { id: "b1", source_thread_id: "subito_222", created_at: "2026-06-02T09:00:00Z", status: "new",     source: "subito", apt_id: "apt2", parsed_guest_name: "Laura" };

const msgC1 = { id: "c1", source_thread_id: null, created_at: "2026-05-30T08:00:00Z", status: "replied", source: "subito", apt_id: "apt1", parsed_guest_name: null };
const msgC2 = { id: "c2", source_thread_id: null, created_at: "2026-05-29T08:00:00Z", status: "ignored",  source: "subito", apt_id: null,   parsed_guest_name: null };

// ── CASO 1: thread con 3 messaggi ────────────────────────────────────────────

console.log("\n=== CASO 1: thread subito_111 con 3 messaggi ===");

const result1 = groupInboxByThread([msgA1, msgA2, msgA3]);
const thread1 = result1.find(t => t.threadId === "subito_111");

check("thread trovato",                 !!thread1,              true);
check("isThread = true",                thread1.isThread,       true);
check("messageCount = 3",              thread1.messageCount,   3);
check("latestMessage = a3",            thread1.latestMessage.id, "a3");
check("firstMessage = a1",             thread1.firstMessage.id,  "a1");
check("status = latest (new)",         thread1.status,           "new");
check("hasNewMessages = true",         thread1.hasNewMessages,   true);
check("apt_id = apt1",                 thread1.apt_id,           "apt1");
check("parsed_guest_name = Mario",     thread1.parsed_guest_name, "Mario");
checkArr("messages sorted oldest→newest", thread1.messages.map(m => m.id), ["a1", "a2", "a3"]);
checkArr("allIds contiene tutti",      thread1.allIds.sort(), ["a1", "a2", "a3"].sort());

// ── CASO 2: thread separati (source_thread_id diversi) ───────────────────────

console.log("\n=== CASO 2: due thread separati (111 e 222) ===");

const result2 = groupInboxByThread([msgA1, msgA2, msgB1]);
check("risultato ha 2 thread",          result2.length,          2);

const tA = result2.find(t => t.threadId === "subito_111");
const tB = result2.find(t => t.threadId === "subito_222");
check("thread 111 trovato",             !!tA,                    true);
check("thread 222 trovato",             !!tB,                    true);
check("thread 111 messageCount = 2",   tA.messageCount,         2);
check("thread 222 messageCount = 1",   tB.messageCount,         1);
check("thread 222 isThread = false",   tB.isThread,             false);

// ── CASO 3: messaggi senza source_thread_id → thread standalone ──────────────

console.log("\n=== CASO 3: source_thread_id = null → thread standalone ===");

const result3 = groupInboxByThread([msgC1, msgC2]);
check("risultato ha 2 thread",          result3.length,           2);
const tC1 = result3.find(t => t.threadId === `_solo_${msgC1.id}`);
const tC2 = result3.find(t => t.threadId === `_solo_${msgC2.id}`);
check("tC1 isThread = false",           tC1.isThread,             false);
check("tC2 isThread = false",           tC2.isThread,             false);
check("tC1 messageCount = 1",          tC1.messageCount,         1);

// ── CASO 4: ordinamento per lastActivityAt (newest first) ────────────────────

console.log("\n=== CASO 4: threads ordinati newest first ===");

const result4 = groupInboxByThread([msgA1, msgA2, msgA3, msgB1, msgC1, msgC2]);
check("primo thread = 222 (jun 2)",    result4[0].threadId,      "subito_222");
check("secondo thread = 111 (jun 1)",  result4[1].threadId,      "subito_111");

// ── CASO 5: hasNewMessages — logica OR tra messaggi del thread ────────────────

console.log("\n=== CASO 5: hasNewMessages — basta un messaggio new nel thread ===");

const result5 = groupInboxByThread([msgA1, msgA2, msgA3]);
const t5 = result5.find(t => t.threadId === "subito_111");
// msgA1=new, msgA2=replied, msgA3=new → hasNewMessages=true
check("thread con mix new/replied → hasNewMessages = true", t5.hasNewMessages, true);

const result5b = groupInboxByThread([msgA2]);
const t5b = result5b[0];
// msgA2=replied → hasNewMessages=false
check("thread solo replied → hasNewMessages = false", t5b.hasNewMessages, false);

// ── CASO 6: array vuoto ───────────────────────────────────────────────────────

console.log("\n=== CASO 6: inbox vuoto → array vuoto ===");
check("array vuoto", groupInboxByThread([]).length, 0);

// ── CASO 7: allIds per bulk update ───────────────────────────────────────────

console.log("\n=== CASO 7: allIds per markThreadReplied ===");
const result7 = groupInboxByThread([msgA1, msgA2, msgA3]);
const t7 = result7.find(t => t.threadId === "subito_111");
check("allIds.length = 3", t7.allIds.length, 3);
check("allIds include a1", t7.allIds.includes("a1"), true);
check("allIds include a2", t7.allIds.includes("a2"), true);
check("allIds include a3", t7.allIds.includes("a3"), true);

// ── Risultato ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
