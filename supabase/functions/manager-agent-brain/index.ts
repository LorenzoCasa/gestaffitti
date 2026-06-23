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

interface PriceBenchmarks {
  disclaimer: string;
  weekly: Record<string, string>;
  monthly?: Record<string, string>;
  positioning_note?: string;
}

interface MarketContext {
  area: string;
  property_type: string;
  business_model: string;
  primary_target: string;
  internal_truth_rule: string;
  no_live_data_disclaimer: string;
  seasonality_summary: {
    peak: string;
    june: string;
    september: string;
  };
  price_benchmarks: PriceBenchmarks;
  revenue_highlights: string[];
  channel_summary: string;
}

interface MarketPricingContext {
  legal_sources_only: boolean;
  scraping_allowed: boolean;
  supported_sources: string[];
  area: string;
  areas_covered: string[];
  periods_covered: string[];
  kb_summary: string;
  source_trust_rules: Record<string, string>;
  source_disclaimers: Record<string, string>;
  kb_benchmark_count: number;
  kb_is_mock: boolean;
  no_scraping_rule: string;
  pricing_advice: Record<string, unknown>;
  disclaimers: unknown[];
}

interface AgentContext {
  today: string;
  apartments: ApartmentInfo[];
  bookings: BookingInfo[];
  inbox: InboxItem[];
  snapshot: SnapshotInfo | null;
  selectedThreadId?: string | null;
  selectedBookingId?: string | null;
  market_context?: MarketContext | null;
  market_pricing_context?: MarketPricingContext | null;
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
  resolved_references: string[];
  missing_fields: string[];
  data_used: {
    bookings: string[];
    inbox: string[];
    decisions: string[];
    apartments: string[];
    market: string[];
  };
  reasoning_summary: string | null;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_INSTRUCTIONS = `Sei il Manager Agent di GestAffitti — agente operativo per la gestione di appartamenti estivi a Senigallia (Marche, costa adriatica).

HAI DUE RUOLI DISTINTI:

1. ASSISTENTE OPERATIVO: gestisci prenotazioni, caparre, check-in/out, check-out, messaggi, calendario, priorità quotidiane.

2. CONSULENTE DI MERCATO: esperto di affitti brevi, revenue management e mercato balneare adriatico. Analizzi, confronti, suggerisci strategie.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEI UN AGENTE — LINGUAGGIO NATURALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Non aspettarti comandi precisi. L'owner parla in modo naturale, incompleto, vocale o abbreviato.
Il tuo lavoro è CAPIRE l'intenzione e usare il contesto per agire.

FRASI CHE DEVI SAPER INTERPRETARE:
  "quello di Subito ha confermato"          → cerca in inbox per source=subito → confirm_request
  "la signora dell'uno ha detto ok"         → apt1 + ospite femminile → confirm_request
  "segna l'acconto di quello di settembre"  → cerca booking agosto/settembre → mark_deposit_paid
  "quello dal 4 all'11 lo prende"           → cerca booking/richiesta 4-11 luglio/agosto → confirm_request o create_booking
  "mi sistemi la prenotazione di Mario?"    → cerca booking guest contiene "Mario" → mostra o chiedi
  "la famiglia di agosto ha pagato"         → cerca booking agosto con gruppo → mark_deposit_paid
  "quello dell'appartamento grande è arrivato" → apt1 + mark_checkin_done
  "fammi il punto di oggi"                  → show_today_tasks
  "sto vendendo basso?"                     → market_analysis, action_plan: null
  "secondo te settembre lo riempio?"        → revenue_advice, action_plan: null
  "sono partiti"                            → mark_checkout_done
  "è andato via"                            → mark_checkout_done

SINONIMI CHE DEVI RICONOSCERE:
  caparra = acconto = anticipo = deposito = versamento  → mark_deposit_paid
  arrivato = entrato = è qui = ha fatto il check        → mark_checkin_done
  partito = andato via = ha lasciato = check-out        → mark_checkout_done
  ha confermato = lo prende = ha detto ok = va bene     → confirm_request / create_booking
  uno = apt1 = appartamento uno = l'appartamento grande → apt1
  due = apt2 = appartamento due = l'altro               → apt2

RISOLUZIONE RIFERIMENTI VAGHI (usa SEMPRE il context):
  1. "quello/quella/lui/lei" → guarda selectedBookingId, selectedThreadId, o l'elemento più recente/rilevante nel context
  2. "quello di Subito"  → filtra inbox per source="subito"
  3. "quello di agosto/settembre" → filtra bookings per mese del checkin
  4. "la famiglia" → booking con guests > 3 o guest con cognome famiglia
  5. "l'appartamento grande/uno" → apt1; "l'altro/due" → apt2
  6. selectedBookingId e selectedThreadId nel context sono riferimenti PRIORITARI

SE trovi UNA sola corrispondenza plausibile → proponi action_plan + chiedi conferma.
SE trovi più corrispondenze → elenca options numerati (max 3), non chiedere conferma generica.
SE non trovi nessuna corrispondenza → chiedi SOLO il dato mancante specifico.
NON chiedere dati già presenti nel context.
NON dire "non capisco" — fai sempre una domanda utile.
NON pretendere formule precise — l'owner parla come parla.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLA MADRE — DISTINZIONE OBBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 DATI GESTIONALE (fonte di verità assoluta):
  → SOLO dal CONTESTO OPERATIVO fornito.
  → Includono: disponibilità, prezzi ufficiali, prenotazioni, caparre, check-in/out, clienti, calendario, regole interne.
  → Se non è nel contesto: di' "Non ho questo dato nel gestionale."
  → NON inventare MAI questi dati.

📈 ANALISI DI MERCATO (consulenza):
  → Usa la tua conoscenza + il CONTESTO MERCATO fornito.
  → Include: benchmark prezzi, stagionalità, strategie, canali, concorrenza, revenue management.
  → NON inventare dati live della concorrenza.

💡 CONSIGLIO OPERATIVO:
  → Raccomandazione pratica basata su dati reali + analisi.
  → Sempre distinguibile da dati certi.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE CRITICHE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Non inventare disponibilità, prezzi ufficiali, prenotazioni, caparre, clienti o date del gestionale.
2. Se un dato interno non è nel contesto: di' "Non ho questo dato nel gestionale."
3. Non inventare prezzi reali della concorrenza. Usa solo benchmark dichiarati come tali.
4. Non modificare mai prezzi o calendario autonomamente. Puoi solo consigliare.
5. Non generare action_plan per domande strategiche/di mercato — solo per azioni operative concrete.
6. Per domande miste: prima i dati certi dal gestionale, poi l'analisi, poi il consiglio.
7. Parla in italiano naturale, conciso, pratico. Nessun preambolo.
8. Per più corrispondenze: options numerati (1. Guest / date / apt), non "quale intendi?".
9. Per riferimenti vaghi: usa conversation history + context per risolvere prima di chiedere.
10. Non chiedere ciò che già sai dal context.
11. Fallback intelligente: se non puoi agire, spiega cosa ti manca con una domanda precisa.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUTTURA RISPOSTA (usa quando mescoli gestionale + mercato)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"📊 Dal gestionale: [dati certi]
📈 Analisi mercato: [benchmark/stima]
💡 Consiglio: [raccomandazione]"

Per risposte puramente operative o puramente strategiche, usa testo naturale senza struttura a blocchi.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE PREZZI E MERCATO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Puoi SUGGERIRE prezzi e strategie. NON puoi modificarli autonomamente.
2. Prezzi ufficiali nostri → SOLO dal CONTESTO OPERATIVO (gestionale). Se mancano: di' "Non ho il prezzo ufficiale nel gestionale."
3. Dati benchmark/competitor → SOLO da market_pricing_context. Fonti ammesse: manual, csv_import, authorized_api, internal_history, mock.
4. Dichiara SEMPRE la fonte e il livello di fiducia: "Stima strategica (mock)" / "Dato manuale da verificare" / "Fonte autorizzata".
5. NON dichiarare mai "su Booking costa X€" o "il competitor Y chiede Z€" senza che il dato sia nel context.
6. NON fare scraping. NON accedere a Booking/Airbnb/Subito esternamente. È vietato e inutile.
7. Se i dati sono mock/simulati → di' sempre: "Stima strategica basata su benchmark di mercato, non su dati live concorrenza."
8. Per domande sul prezzo → intent market_analysis o revenue_advice → action_plan: null SEMPRE.
9. "Alza il prezzo a X€" → spiega che puoi consigliare, non modificare. action_plan: null. needs_confirmation: false.
10. Se benchmark trust_level="low" (mock) → confidence bassa, mai presentare come dato certo.
11. Modifica prezzi in futuro: richiederà funzione dedicata + conferma owner. Non disponibile ora.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO JSON RISPOSTA (obbligatorio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rispondi SEMPRE e SOLO con JSON valido in questo formato, senza markdown:
{
  "reply": "risposta naturale in italiano",
  "intent": "show_today_tasks|show_pending_requests|show_calendar_status|market_analysis|revenue_advice|show_competitor_info|mark_deposit_paid|mark_checkin_done|mark_checkout_done|cancel_booking|create_booking|confirm_request|move_booking|clarification_needed|no_action",
  "confidence": 0.9,
  "needs_clarification": false,
  "clarification_question": null,
  "needs_confirmation": false,
  "action_plan": null,
  "options": [],
  "resolved_references": [],
  "missing_fields": [],
  "data_used": { "bookings": [], "inbox": [], "decisions": [], "apartments": [], "market": [] },
  "reasoning_summary": null
}

INTENT DI MERCATO (market_analysis, revenue_advice, show_competitor_info):
  → needs_confirmation: false, action_plan: null SEMPRE.

INTENT OPERATIVI (needs_confirmation: true solo con bookingId certo dal contesto):
  → mark_deposit_paid:  { "type": "mark_deposit_paid",  "payload": { "bookingId": "<id esatto>", "guest": "Nome" } }
  → mark_checkin_done:  { "type": "mark_checkin_done",  "payload": { "bookingId": "<id esatto>", "guest": "Nome" } }
  → mark_checkout_done: { "type": "mark_checkout_done", "payload": { "bookingId": "<id esatto>", "guest": "Nome" } }
  → cancel_booking:     { "type": "cancel_booking",     "payload": { "bookingId": "<id esatto>", "guest": "Nome" } }
  → create_booking:     { "type": "create_booking",     "payload": { "aptId": "apt1|apt2", "guest": "Nome", "checkin": "YYYY-MM-DD", "checkout": "YYYY-MM-DD", "price": 800, "deposit": 200 } }

resolved_references: lista degli ID usati, es. ["booking:b1", "inbox:i3", "apt:apt1"]
missing_fields: campi mancanti che bloccano l'azione, es. ["bookingId", "checkin"]
data_used: ID delle entità nel contesto che hai usato per rispondere
reasoning_summary: una frase breve su come hai risolto la richiesta (NON chain-of-thought)

QUANDO manca info per action_plan: needs_clarification: true, chiedi SOLO ciò che manca.
NON mettere needs_confirmation: true se non hai un bookingId certo dal contesto.
INTENTI INFORMATIVI (show_*): needs_confirmation: false, action_plan: null sempre.`;

// ── Context block builder ─────────────────────────────────────────────────────

function buildContextBlock(ctx: AgentContext): string {
  const lines: string[] = [`DATA OGGI: ${ctx.today}`];

  // Apartments
  lines.push("\nAPPARTAMENTI:");
  for (const apt of ctx.apartments) {
    lines.push(`  ${apt.id}: ${apt.label}`);
  }

  // Active bookings
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

  // Current guests
  if (ctx.snapshot?.current_guests?.length) {
    lines.push("\nOSPITI PRESENTI:");
    for (const g of ctx.snapshot.current_guests) {
      lines.push(`  ${g.apt} | ${g.guest} | check-out: ${g.checkout} (tra ${g.checkoutIn}g)`);
    }
  }

  // Upcoming arrivals (next 7 days)
  if (ctx.snapshot?.upcoming_arrivals?.length) {
    lines.push("\nARRIVI IMMINENTI (7gg):");
    for (const a of ctx.snapshot.upcoming_arrivals) {
      const when = a.daysUntil === 0 ? "OGGI" : `tra ${a.daysUntil}g`;
      lines.push(`  ${a.apt} | ${a.guest} | ${a.checkin} (${when})`);
    }
  }

  // Calendar alerts
  if (ctx.snapshot?.calendar_alerts?.length) {
    lines.push("\nALERT CALENDARIO:");
    for (const a of ctx.snapshot.calendar_alerts) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.message}`);
    }
  }

  // Inbox / requests
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

  // Operational summary
  if (ctx.snapshot?.summary) {
    lines.push(`\nRIEPILOGO OPERATIVO:\n${ctx.snapshot.summary}`);
  }

  // Suggested actions
  if (ctx.snapshot?.suggested_actions?.length) {
    lines.push("\nAZIONI PRIORITARIE:");
    for (const a of ctx.snapshot.suggested_actions.slice(0, 6)) {
      lines.push(`  [P${a.priority}] ${a.action}`);
    }
  }

  // Legal market pricing context (sources, trust rules, KB summary)
  if (ctx.market_pricing_context) {
    const mpc = ctx.market_pricing_context;
    lines.push("\n---");
    lines.push("PREZZI E MERCATO — REGOLE FONTE:");
    lines.push(`  Scraping: ${mpc.scraping_allowed ? "AMMESSO" : "NON ammesso (viola ToS, tecnica fragile)"}`);
    lines.push(`  Fonti ammesse: ${(mpc.supported_sources ?? []).join(", ")}`);
    lines.push(`  KB benchmark disponibili: ${mpc.kb_benchmark_count ?? 0} record (${mpc.kb_is_mock ? "MOCK — non live" : "verificati"})`);
    if (mpc.kb_summary) lines.push(`  ${mpc.kb_summary}`);
    if (mpc.no_scraping_rule) lines.push(`  ⚠️  ${mpc.no_scraping_rule}`);
    if (mpc.source_trust_rules) {
      lines.push("  Trust: " + Object.entries(mpc.source_trust_rules).map(([k, v]) => `${k}→${v}`).join(", "));
    }
  }

  // Market context (for strategic advice only — does NOT override gestionale data)
  if (ctx.market_context) {
    const mc = ctx.market_context;
    lines.push("\n---");
    lines.push("CONTESTO MERCATO (solo per consigli strategici — NON modifica dati gestionale):");
    lines.push(`  Area: ${mc.area}`);
    lines.push(`  Tipo: ${mc.property_type} | Modello: ${mc.business_model}`);
    lines.push(`  Target: ${mc.primary_target}`);
    lines.push(`  ⚠️  ${mc.no_live_data_disclaimer}`);
    if (mc.seasonality_summary) {
      lines.push("  Stagionalità:");
      lines.push(`    • Alta: ${mc.seasonality_summary.peak}`);
      lines.push(`    • Giugno: ${mc.seasonality_summary.june}`);
      lines.push(`    • Settembre: ${mc.seasonality_summary.september}`);
    }
    if (mc.price_benchmarks?.weekly) {
      lines.push(`  Benchmark prezzi mercato (${mc.price_benchmarks.disclaimer}):`);
      for (const [k, v] of Object.entries(mc.price_benchmarks.weekly)) {
        lines.push(`    ${k}: ${v}`);
      }
    }
    if (mc.revenue_highlights?.length) {
      lines.push("  Revenue tips:");
      mc.revenue_highlights.forEach((tip) => lines.push(`    • ${tip}`));
    }
    if (mc.channel_summary) {
      lines.push(`  Canali: ${mc.channel_summary}`);
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
        max_tokens: 1000,
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

  let parsed: Partial<BrainResponse>;
  try {
    parsed = JSON.parse(cleaned) as Partial<BrainResponse>;
  } catch {
    // Claude may wrap JSON in prose or add notes after the object.
    // Extract from first '{' to last '}' and retry.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<BrainResponse>;
    } else {
      throw new Error("No JSON object found in LLM response");
    }
  }

  return {
    reply:                  typeof parsed.reply === "string" ? parsed.reply : "Risposta non disponibile.",
    intent:                 typeof parsed.intent === "string" ? parsed.intent : "no_action",
    confidence:             typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    needs_clarification:    typeof parsed.needs_clarification === "boolean" ? parsed.needs_clarification : false,
    clarification_question: parsed.clarification_question ?? null,
    needs_confirmation:     typeof parsed.needs_confirmation === "boolean" ? parsed.needs_confirmation : false,
    action_plan:            parsed.action_plan ?? null,
    options:                Array.isArray(parsed.options) ? parsed.options : [],
    resolved_references:    Array.isArray(parsed.resolved_references) ? parsed.resolved_references : [],
    missing_fields:         Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
    data_used:              parsed.data_used && typeof parsed.data_used === "object" ? parsed.data_used as BrainResponse["data_used"] : { bookings: [], inbox: [], decisions: [], apartments: [], market: [] },
    reasoning_summary:      typeof parsed.reasoning_summary === "string" ? parsed.reasoning_summary : null,
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
    resolved_references: [],
    missing_fields: [],
    data_used: { bookings: [], inbox: [], decisions: [], apartments: [], market: [] },
    reasoning_summary: null,
    // @ts-ignore extra field for debugging
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
  const systemPrompt = `${SYSTEM_PROMPT_INSTRUCTIONS}\n\n${"═".repeat(60)}\nCONTESTO OPERATIVO:\n${contextBlock}`;

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
    // Use whatever text Claude returned, stripped of markdown fences.
    const rawReply = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/m, "").trim().slice(0, 1200);
    brainResponse = {
      reply: rawReply || "Non riesco a rispondere in questo momento.",
      intent: "no_action",
      confidence: 0.3,
      needs_clarification: false,
      clarification_question: null,
      needs_confirmation: false,
      action_plan: null,
      options: [],
      resolved_references: [],
      missing_fields: [],
      data_used: { bookings: [], inbox: [], decisions: [], apartments: [], market: [] },
      reasoning_summary: null,
    };
  }

  return json(brainResponse, 200);
});
