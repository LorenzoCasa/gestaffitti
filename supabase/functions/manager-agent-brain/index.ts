// ═══════════════════════════════════════════════════════════════════════════
//  manager-agent-brain — GestAffitti Manager Agent LLM Brain
//
//  Riceve: { message, conversation, context }
//  Chiama: Claude API con contesto strutturato e storico conversazione
//  Restituisce: { reply, intent, confidence, needs_clarification,
//                 clarification_question, needs_confirmation, action_plan, options }
//
//  Il frontend passa il contesto (già filtrato da managerAgentLLMContext.js).
//  L'LLM NON scrive nel DB. Restituisce solo action_plan strutturato.
//  Il frontend valida e chiede Conferma al proprietario prima di executeAction.
//
//  Secrets richiesti (già configurati):
//    ANTHROPIC_API_KEY — chiave Anthropic
//    LLM_MODEL         — env var (default: claude-sonnet-4-6)
//
//  Deploy:
//    supabase functions deploy manager-agent-brain \
//      --project-ref rkhxbjrfjwavwhehtavg
// ═══════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Response helpers ──────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface BookingInfo {
  id: string;
  apt: string;
  guest: string;
  checkin: string;
  checkout: string;
  status: string;
  depositPaid: boolean;
  checkinDone: boolean;
  price: number;
  deposit?: number;
}

interface InboxItem {
  id: string;
  apt_id: string | null;
  guest: string | null;
  status: string;
  source: string;
  preview: string;
  received_at: string | null;
  decision: {
    id: string;
    type: string | null;
    checkin: string | null;
    checkout: string | null;
    apt_id: string | null;
    price: number | null;
  } | null;
}

interface ApartmentInfo {
  id: string;
  label: string;
}

interface SnapshotInfo {
  summary: string;
  suggested_actions: Array<{ priority: number; action: string }>;
  pending_opportunities: unknown[];
  messages_to_review: unknown[];
  upcoming_arrivals: Array<{ bookingId: string; apt: string; guest: string; checkin: string; checkout: string; daysUntil: number }>;
  current_guests: Array<{ bookingId: string; apt: string; guest: string; checkout: string; checkoutIn: number }>;
  calendar_alerts: Array<{ severity: string; message: string }>;
}

interface AgentContext {
  today: string;
  apartments: ApartmentInfo[];
  bookings: BookingInfo[];
  inbox: InboxItem[];
  snapshot: SnapshotInfo | null;
  selectedThreadId?: string | null;
  selectedBookingId?: string | null;
}

interface RequestBody {
  message: string;
  conversation: ConversationTurn[];
  context: AgentContext;
}

interface BrainResponse {
  reply: string;
  intent: string;
  confidence: number;
  needs_clarification: boolean;
  clarification_question: string | null;
  needs_confirmation: boolean;
  action_plan: unknown | null;
  options: unknown[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_INSTRUCTIONS = `Sei il Manager Agent di GestAffitti.
Aiuti il proprietario a gestire affitti brevi in modo operativo, pratico e veloce.

Puoi aiutare su:
- richieste da clienti (messaggi Subito, opportunità aperte)
- prenotazioni attive, future, in attesa di pagamento
- calendario, disponibilità, arrivi, partenze
- caparre ricevute o in attesa
- check-in e check-out
- priorità operative di oggi
- fatturato e dati economici
- stato degli appartamenti

REGOLE FONDAMENTALI:
1. Parla SEMPRE in italiano naturale, conciso, pratico. Nessun preambolo.
2. Usa SOLO i dati presenti nel CONTESTO OPERATIVO ricevuto. Non inventare.
3. Se un dato non è nel contesto, dillo chiaramente e chiedi chiarimento.
4. Non inventare disponibilità, prezzi, date, clienti o appartamenti.
5. Non eseguire mai azioni direttamente: restituisci solo un action_plan strutturato.
6. Il proprietario deve sempre confermare prima che vengano eseguite azioni sul DB.
7. Se ci sono più possibilità (es. due ospiti con stesso cognome), proponi opzioni numerate.
8. Quando il proprietario usa un riferimento ambiguo ("quello", "lui"), guarda lo storico.

FORMATO RISPOSTA (obbligatorio):
Rispondi SEMPRE e SOLO con JSON valido in questo formato esatto, senza markdown:
{
  "reply": "risposta naturale in italiano",
  "intent": "show_today_tasks|show_pending_requests|show_calendar_status|mark_deposit_paid|mark_checkin_done|cancel_booking|create_booking|confirm_request|move_booking|clarification_needed|no_action",
  "confidence": 0.9,
  "needs_clarification": false,
  "clarification_question": null,
  "needs_confirmation": false,
  "action_plan": null,
  "options": []
}

QUANDO needs_confirmation è true, action_plan deve contenere:
- mark_deposit_paid: { "type": "mark_deposit_paid", "payload": { "bookingId": "<id esatto dal contesto>", "guest": "Nome Cognome" } }
- mark_checkin_done: { "type": "mark_checkin_done", "payload": { "bookingId": "<id esatto>", "guest": "Nome Cognome" } }
- cancel_booking:    { "type": "cancel_booking",    "payload": { "bookingId": "<id esatto>", "guest": "Nome Cognome" } }
- create_booking:    { "type": "create_booking",    "payload": { "aptId": "apt1|apt2", "guest": "Nome Cognome", "checkin": "YYYY-MM-DD", "checkout": "YYYY-MM-DD", "price": 800, "deposit": 200 } }

QUANDO manca info per action_plan: needs_clarification: true, chiedi SOLO ciò che manca.
NON mettere needs_confirmation: true se non hai un bookingId certo dal contesto.
INTENTI INFORMATIVI (show_*): needs_confirmation: false, action_plan: null sempre.`;

// ── Context block builder ─────────────────────────────────────────────────────

function buildContextBlock(ctx: AgentContext): string {
  const lines: string[] = [`DATA OGGI: ${ctx.today}`];

  lines.push("\nAPPARTAMENTI:");
  for (const apt of ctx.apartments) {
    lines.push(`  ${apt.id}: ${apt.label}`);
  }

  if (ctx.bookings.length > 0) {
    lines.push("\nPRENOTAZIONI ATTIVE:");
    for (const b of ctx.bookings) {
      const dep = b.depositPaid ? "caparra:SI" : "caparra:NO";
      const cin = b.checkinDone ? "check-in:SI" : "check-in:NO";
      const stat = b.status === "pending_payment" ? " [IN ATTESA PAGAMENTO]" : "";
      lines.push(`  [ID:${b.id}] ${b.apt} | ${b.guest} | ${b.checkin}→${b.checkout} | €${b.price} | ${dep} | ${cin}${stat}`);
    }
  } else {
    lines.push("\nPRENOTAZIONI ATTIVE: nessuna");
  }

  if (ctx.snapshot?.current_guests?.length) {
    lines.push("\nOSPITI PRESENTI:");
    for (const g of ctx.snapshot.current_guests) {
      lines.push(`  ${g.apt} | ${g.guest} | check-out: ${g.checkout} (tra ${g.checkoutIn}g)`);
    }
  }

  if (ctx.snapshot?.upcoming_arrivals?.length) {
    lines.push("\nARRIVI IMMINENTI (7gg):");
    for (const a of ctx.snapshot.upcoming_arrivals) {
      const when = a.daysUntil === 0 ? "OGGI" : `tra ${a.daysUntil}g`;
      lines.push(`  ${a.apt} | ${a.guest} | ${a.checkin} (${when})`);
    }
  }

  if (ctx.snapshot?.calendar_alerts?.length) {
    lines.push("\nALERT CALENDARIO:");
    for (const a of ctx.snapshot.calendar_alerts) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.message}`);
    }
  }

  if (ctx.inbox.length > 0) {
    lines.push("\nMESSAGGI E RICHIESTE:");
    for (const item of ctx.inbox) {
      if (item.decision) {
        const d = item.decision;
        const dates = d.checkin ? `${d.checkin}→${d.checkout}` : "date:?";
        const price = d.price ? `€${d.price}` : "";
        lines.push(`  [ID:${item.id}] ${item.apt_id ?? "?"} | ${item.guest ?? "?"} | ${item.source} | ${d.type?.toUpperCase() ?? "?"} | ${dates} ${price}`);
      } else {
        lines.push(`  [ID:${item.id}] ${item.apt_id ?? "?"} | ${item.guest ?? "?"} | ${item.source} | SENZA ANALISI | "${item.preview?.slice(0, 80)}"`);
      }
    }
  } else {
    lines.push("\nMESSAGGI E RICHIESTE: nessuno");
  }

  if (ctx.snapshot?.summary) {
    lines.push(`\nRIEPILOGO OPERATIVO:\n${ctx.snapshot.summary}`);
  }

  if (ctx.snapshot?.suggested_actions?.length) {
    lines.push("\nAZIONI PRIORITARIE:");
    for (const a of ctx.snapshot.suggested_actions.slice(0, 6)) {
      lines.push(`  [P${a.priority}] ${a.action}`);
    }
  }

  return lines.join("\n");
}

// ── Anthropic API call ────────────────────────────────────────────────────────

interface AnthropicResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAnthropic(
  systemPrompt: string,
  messages: ConversationTurn[],
  apiKey: string,
  model: string,
): Promise<AnthropicResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text) throw new Error("Anthropic: risposta vuota");

    return {
      text: text.trim(),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── JSON parse from Claude output ─────────────────────────────────────────────

function parseBrainResponse(raw: string): BrainResponse {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<BrainResponse>;
  return {
    reply:                 typeof parsed.reply === "string" ? parsed.reply : "Risposta non disponibile.",
    intent:                typeof parsed.intent === "string" ? parsed.intent : "no_action",
    confidence:            typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    needs_clarification:   typeof parsed.needs_clarification === "boolean" ? parsed.needs_clarification : false,
    clarification_question: parsed.clarification_question ?? null,
    needs_confirmation:    typeof parsed.needs_confirmation === "boolean" ? parsed.needs_confirmation : false,
    action_plan:           parsed.action_plan ?? null,
    options:               Array.isArray(parsed.options) ? parsed.options : [],
  };
}

// ── Fallback response ─────────────────────────────────────────────────────────

function fallbackResponse(reason: string): BrainResponse {
  return {
    reply: "Non riesco a rispondere in questo momento. Riprova tra qualche secondo.",
    intent: "no_action",
    confidence: 0,
    needs_clarification: false,
    clarification_question: null,
    needs_confirmation: false,
    action_plan: null,
    options: [],
    // @ts-ignore
    _fallback: true,
    _fallback_reason: reason,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { message, conversation = [], context } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return json({ error: "message è obbligatorio" }, 400);
  }
  if (!context || typeof context !== "object") {
    return json({ error: "context è obbligatorio" }, 400);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    console.warn("[manager-agent-brain] ANTHROPIC_API_KEY non configurata");
    return json(fallbackResponse("API key mancante"), 200);
  }
  const model = Deno.env.get("LLM_MODEL") ?? "claude-sonnet-4-6";

  const contextBlock = buildContextBlock(context);
  const systemPrompt = `${SYSTEM_PROMPT_INSTRUCTIONS}\n\n---\nCONTESTO OPERATIVO:\n${contextBlock}`;

  const history: ConversationTurn[] = (conversation ?? [])
    .filter((t) => t.role === "user" || t.role === "assistant")
    .slice(-10);

  const messages: ConversationTurn[] = [
    ...history,
    { role: "user", content: message.trim() },
  ];

  let raw: string;
  try {
    const result = await callAnthropic(systemPrompt, messages, anthropicApiKey, model);
    raw = result.text;
    console.log(`[manager-agent-brain] tokens in:${result.inputTokens} out:${result.outputTokens}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[manager-agent-brain] Anthropic error:", msg);
    return json(fallbackResponse(msg), 200);
  }

  let brainResponse: BrainResponse;
  try {
    brainResponse = parseBrainResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[manager-agent-brain] JSON parse error:", msg, "raw:", raw.slice(0, 300));
    brainResponse = {
      reply: raw.length < 500 ? raw : "Risposta ricevuta ma non strutturata correttamente.",
      intent: "no_action",
      confidence: 0.3,
      needs_clarification: false,
      clarification_question: null,
      needs_confirmation: false,
      action_plan: null,
      options: [],
    };
  }

  return json(brainResponse, 200);
});
