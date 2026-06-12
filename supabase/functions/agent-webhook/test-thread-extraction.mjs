/**
 * Test Sprint C1.1 — extractSubitoConvId logic
 * Run: node supabase/functions/agent-webhook/test-thread-extraction.mjs
 *
 * Replica la stessa logica del webhook (TypeScript → JS per testabilità Node).
 * Non richiede Deno, non tocca il database.
 */

// ── Logica da testare (speculare al webhook) ──────────────────────────────────

const SUBITO_CONV_RE = /subito\.it\/(?:messaggi|my-messages|il-mio-profilo\/messaggi)\/(\d+)/i;

function extractSubitoConvId(html, text) {
  const candidate = html ?? text ?? "";
  const match = candidate.match(SUBITO_CONV_RE);
  return match ? `subito_${match[1]}` : null;
}

/**
 * Simula il calcolo di sourceThreadId esattamente come fa il webhook:
 *   payload.source_thread_id esplicito → Conv ID da html/text → null
 */
function resolveThreadId(payloadThreadId, htmlBody, cleanText) {
  return (
    (payloadThreadId?.trim() || undefined) ??
    extractSubitoConvId(htmlBody, cleanText) ??
    null
  );
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// ── CASO 1: email con link Subito in html_body ────────────────────────────────
// Situazione reale: Make manda email HTML, il webhook lo salva come htmlBody.
// Il Conv ID deve essere estratto dall'HTML.

console.log("\n=== CASO 1: link Subito in html_body ===");

const htmlWithMsgLink = `
  <html><body>
  <p>Hai ricevuto un nuovo messaggio da Mario Rossi.</p>
  <a href="https://www.subito.it/messaggi/123456789/">Rispondi su Subito</a>
  </body></html>
`;
check(
  "path /messaggi/ → subito_123456789",
  resolveThreadId(undefined, htmlWithMsgLink, ""),
  "subito_123456789"
);

const htmlWithMyMessages = `
  <a href="https://www.subito.it/my-messages/987654321/tipo">Vai ai messaggi</a>
`;
check(
  "path /my-messages/ → subito_987654321",
  resolveThreadId(undefined, htmlWithMyMessages, ""),
  "subito_987654321"
);

const htmlWithProfilePath = `
  <a href="https://www.subito.it/il-mio-profilo/messaggi/555000111/dettaglio">Risposta</a>
`;
check(
  "path /il-mio-profilo/messaggi/ → subito_555000111",
  resolveThreadId(undefined, htmlWithProfilePath, ""),
  "subito_555000111"
);

const htmlWithWww = `
  <a href="https://www.subito.it/messaggi/777888999/">Link</a>
`;
check(
  "URL con www. → subito_777888999",
  resolveThreadId(undefined, htmlWithWww, ""),
  "subito_777888999"
);

const htmlWithoutWww = `
  <a href="https://subito.it/messaggi/111222333/">Link</a>
`;
check(
  "URL senza www. → subito_111222333",
  resolveThreadId(undefined, htmlWithoutWww, ""),
  "subito_111222333"
);

// ── CASO 1b: link nel testo plain (htmlBody = null) ───────────────────────────

console.log("\n=== CASO 1b: link Subito in plain text (no HTML) ===");

check(
  "URL plain nel cleanText → subito_444555666",
  resolveThreadId(undefined, null, "Vai su https://subito.it/messaggi/444555666/ per rispondere"),
  "subito_444555666"
);

check(
  "URL plain in cleanText uppercase-insensitive → subito_123",
  resolveThreadId(undefined, null, "link: https://SUBITO.IT/messaggi/123/"),
  "subito_123"
);

// ── CASO 2: email senza link Subito → comportamento invariato ─────────────────

console.log("\n=== CASO 2: email senza link Subito → source_thread_id = null ===");

check(
  "HTML senza link Subito → null",
  resolveThreadId(undefined, "<p>Ciao, sono interessato all'appartamento.</p>", "Ciao, sono interessato"),
  null
);

check(
  "testo plain senza link Subito → null",
  resolveThreadId(undefined, null, "Vorrei informazioni sull'appartamento"),
  null
);

check(
  "htmlBody = null, cleanText vuoto → null",
  resolveThreadId(undefined, null, ""),
  null
);

check(
  "htmlBody = null, cleanText = null → null",
  resolveThreadId(undefined, null, null),
  null
);

// ── CASO 3: payload.source_thread_id già presente → non viene sovrascritto ───

console.log("\n=== CASO 3: payload.source_thread_id esplicito → non sovrascritto ===");

check(
  "payload esplicito ha priorità su Conv ID estratto",
  resolveThreadId("gmail_thread_abc123", htmlWithMsgLink, ""),
  "gmail_thread_abc123"
);

check(
  "payload esplicito ha priorità anche se html ha ID diverso",
  resolveThreadId("custom_thread_xyz", htmlWithMyMessages, ""),
  "custom_thread_xyz"
);

check(
  "payload esplicito con spazi viene trimmed",
  resolveThreadId("  my_thread_id  ", null, ""),
  "my_thread_id"
);

check(
  "payload stringa vuota NON blocca l'estrazione da HTML",
  resolveThreadId("", htmlWithMsgLink, ""),
  "subito_123456789"
);

// ── CASO 3b: payload stringa vuota → usa Conv ID estratto ────────────────────
// payload.source_thread_id = "" (stringa vuota) è trattato come assente.

console.log("\n=== CASO 3b: payload vuoto/undefined → usa Conv ID se disponibile ===");

check(
  "payload = undefined → estrae da HTML",
  resolveThreadId(undefined, htmlWithMsgLink, ""),
  "subito_123456789"
);

check(
  "payload = null → estrae da HTML",
  resolveThreadId(null, htmlWithMsgLink, ""),
  "subito_123456789"
);

// ── Risultato ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Risultato: ${pass} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
