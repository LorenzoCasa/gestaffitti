// ═══════════════════════════════════════════════════════════════════════════
//  agent-webhook — Sprint C1.1
//  Riceve richieste da sorgenti esterne e le scrive in agent_inbox.
//
//  Sicurezza: Bearer token statico (WEBHOOK_SECRET).
//    Header atteso: Authorization: Bearer <secret>
//
//  Idempotenza: SELECT prima di INSERT.
//    Se esiste già (source + source_message_id): 200 { result: "duplicate" }
//    Se INSERT va in race-condition 23505: 200 { result: "duplicate" }
//    Se creato: 201 { result: "created", id }
//
//  Thread ID (C1.1):
//    source_thread_id viene popolato automaticamente dal Conversation ID
//    estratto dai link Subito presenti nell'HTML o nel testo.
//    Formato: "subito_<numericId>"  es. "subito_123456789"
//    Priorità: payload.source_thread_id esplicito → Conv ID da html/text → null
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface WebhookPayload {
  source: string;
  source_message_id: string;
  raw_text: string;
  source_thread_id?: string;
  raw_metadata?: Record<string, unknown>;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Returns true if the email subject looks like a real customer inquiry.
// Blocks system notifications like "Annuncio approvato", "Pubblicato", etc.
function isCustomerMessage(subject: string): boolean {
  const s = subject.toLowerCase();
  return s.includes("nuovo messaggio");
}

function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

// Estrae il Conversation ID Subito da un testo (HTML o plain).
// Riconosce tutti i path usati da Subito nelle email di notifica:
//   /messaggi/<id>/
//   /my-messages/<id>/
//   /il-mio-profilo/messaggi/<id>/
// Restituisce "subito_<id>" oppure null.
const SUBITO_CONV_RE = /subito\.it\/(?:messaggi|my-messages|il-mio-profilo\/messaggi)\/(\d+)/i;
function extractSubitoConvId(html: string | null, text: string): string | null {
  const candidate = html ?? text ?? "";
  const match = candidate.match(SUBITO_CONV_RE);
  return match ? `subito_${match[1]}` : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Handler principale ────────────────────────────────────────────────────────

serve(async (req: Request) => {

  // 1. Solo POST
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // 2. Verifica Bearer token
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("WEBHOOK_SECRET non configurato");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  // 3. Leggi e valida JSON
  let payload: WebhookPayload;
  try {
    const raw = await req.text();
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // 4. Campi obbligatori con trim
  const source          = payload.source?.trim();
  const sourceMessageId = payload.source_message_id?.trim();
  const rawText         = payload.raw_text?.trim();

  if (!source || !sourceMessageId || !rawText) {
    return json(
      { error: "Missing required fields: source, source_message_id, raw_text" },
      400
    );
  }

  // 5. Source: solo "subito" per ora
  if (source !== "subito") {
    return json(
      { error: `Source "${source}" not accepted. Only "subito" is supported.` },
      422
    );
  }

  // 5b. Filtro noise: accetta solo messaggi cliente (subject contiene "Nuovo messaggio")
  const subject = (
    (payload.raw_metadata?.email_subject as string) ??
    (payload.raw_metadata?.subject as string) ??
    ""
  ).trim();
  if (subject && !isCustomerMessage(subject)) {
    console.log(`[webhook] ignored — subject not a customer message: "${subject}"`);
    return json({ result: "ignored", reason: "not_a_customer_message", subject }, 200);
  }

  // 5c. Strip HTML: se raw_text è HTML, lo pulisce e preserva l'originale in raw_metadata
  let cleanText = rawText;
  let htmlBody: string | null = null;
  if (looksLikeHtml(rawText)) {
    htmlBody  = rawText;
    cleanText = stripHtml(rawText);
    console.log(`[webhook] stripped HTML — clean length: ${cleanText.length}`);
  }

  const enrichedMetadata: Record<string, unknown> = {
    ...(payload.raw_metadata ?? {}),
    ...(htmlBody !== null ? { html_body: htmlBody } : {}),
  };

  // 5d. Determina source_thread_id
  //   Priorità: payload esplicito → Conv ID estratto da html/text → null
  const sourceThreadId: string | null =
    payload.source_thread_id?.trim() ||
    extractSubitoConvId(htmlBody, cleanText) ||
    null;
  if (sourceThreadId) {
    console.log(`[webhook] thread_id: ${sourceThreadId}`);
  }

  // 6. Supabase client (service-role — bypassa RLS)
  const supabaseUrl    = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase env vars non configurati");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 7. Deduplicazione: SELECT prima di INSERT
  const { data: existing, error: selectError } = await supabase
    .from("agent_inbox")
    .select("id")
    .eq("source", source)
    .eq("source_message_id", sourceMessageId)
    .maybeSingle();

  if (selectError) {
    console.error("SELECT error:", selectError);
    return json({ error: "Database error", detail: selectError.message }, 500);
  }

  if (existing) {
    return json({ result: "duplicate", id: existing.id }, 200);
  }

  // 8. INSERT
  const { data: inserted, error: insertError } = await supabase
    .from("agent_inbox")
    .insert({
      source,
      source_message_id:     sourceMessageId,
      source_thread_id:      sourceThreadId,
      raw_text:              cleanText,
      raw_metadata:          enrichedMetadata,
      status:                "new",
      owner_action_required: true,
    })
    .select("id")
    .single();

  // Race condition: un altro worker ha inserito nel frattempo
  if (insertError?.code === "23505") {
    return json({ result: "duplicate" }, 200);
  }

  if (insertError) {
    console.error("INSERT error:", insertError);
    return json({ error: "Database error", detail: insertError.message }, 500);
  }

  return json({ result: "created", id: inserted.id }, 201);
});
