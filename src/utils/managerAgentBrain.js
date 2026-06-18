/**
 * managerAgentBrain.js — GestAffitti Manager Agent Brain
 *
 * Natural-language interpretation + context resolution + reply generation.
 * Pure functions: no I/O, no async, no side effects.
 *
 * Entry point: interpretMessage(text, context)
 * Returns: BrainResponse { reply, intent, confidence, needs_clarification,
 *   clarification_question, needs_confirmation, action_plan, options }
 */

import { checkAvailability } from "./agentAvailability.js";
import { groupInboxByThread } from "./groupInboxByThread.js";

// ── Italian helpers ───────────────────────────────────────────────────────────

const MONTHS_IT = {
  gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6,
  luglio:7,  agosto:8,  settembre:9, ottobre:10, novembre:11, dicembre:12,
  gen:1, feb:2, mar:3, apr:4, mag:5, giu:6,
  lug:7, ago:8, set:9, ott:10, nov:11, dic:12,
};
const MONTH_LABEL = {
  1:"gennaio",2:"febbraio",3:"marzo",4:"aprile",5:"maggio",6:"giugno",
  7:"luglio",8:"agosto",9:"settembre",10:"ottobre",11:"novembre",12:"dicembre",
};
const MONTH_PAT = Object.keys(MONTHS_IT).sort((a,b)=>b.length-a.length).join("|");

function inferYear(month) {
  const now = new Date(); const cur = now.getMonth()+1;
  return month < cur ? now.getFullYear()+1 : now.getFullYear();
}
function iso(d,m,y){ return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function addDays(isoDate,n){
  const d=new Date(isoDate+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function itDate(iso){ if(!iso) return "?"; const [,m,d]=iso.split("-"); return `${parseInt(d,10)}/${parseInt(m,10)}`; }
function monthOf(isoDate){ return parseInt(isoDate?.split("-")[1]??0,10); }

// ── Date extraction ───────────────────────────────────────────────────────────

function extractDates(text) {
  const t = text.toLowerCase();
  const rNum=/(?:dal\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:-|–|—|al)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i;
  const mNum=t.match(rNum);
  if(mNum){
    const yI=mNum[3]?Number(mNum[3]):inferYear(Number(mNum[2]));
    const yO=mNum[6]?Number(mNum[6]):inferYear(Number(mNum[5]));
    if(Number(mNum[2])>=1&&Number(mNum[2])<=12&&Number(mNum[5])>=1&&Number(mNum[5])<=12)
      return{checkin:iso(Number(mNum[1]),Number(mNum[2]),yI),checkout:iso(Number(mNum[4]),Number(mNum[5]),yO)};
  }
  const rSame=new RegExp("(\\d{1,2})\\s*(?:-|al)\\s*(\\d{1,2})\\s+("+MONTH_PAT+")(?:\\s+(\\d{4}))?","i");
  const mSame=t.match(rSame);
  if(mSame){ const month=MONTHS_IT[mSame[3].toLowerCase()]; if(month){ const y=mSame[4]?Number(mSame[4]):inferYear(month); return{checkin:iso(Number(mSame[1]),month,y),checkout:iso(Number(mSame[2]),month,y)}; } }
  const rTwo=new RegExp("(\\d{1,2})\\s+("+MONTH_PAT+")(?:\\s+(\\d{4}))?\\s*(?:-|–|al)\\s*(\\d{1,2})\\s+("+MONTH_PAT+")(?:\\s+(\\d{4}))?","i");
  const mTwo=t.match(rTwo);
  if(mTwo){ const mI=MONTHS_IT[mTwo[2].toLowerCase()]; const mO=MONTHS_IT[mTwo[5].toLowerCase()]; if(mI&&mO){ const yI=mTwo[3]?Number(mTwo[3]):inferYear(mI); const yO=mTwo[6]?Number(mTwo[6]):inferYear(mO); return{checkin:iso(Number(mTwo[1]),mI,yI),checkout:iso(Number(mTwo[4]),mO,yO)}; } }
  return{checkin:null,checkout:null};
}

function extractMonth(text) {
  const t=text.toLowerCase();
  const r=new RegExp("("+MONTH_PAT+")","i"); const m=t.match(r);
  return m?MONTHS_IT[m[1].toLowerCase()]??null:null;
}

// ── Apartment detection ───────────────────────────────────────────────────────

function detectApartment(text,apartments=[]) {
  const l=text.toLowerCase();
  if(/sull['']?uno\b|nell['']?uno\b|\bl['']?uno\b|appart\.?\s*1\b|apt\s*1\b/i.test(l)) return "apt1";
  if(/sull['']?due\b|nell['']?due\b|\bl['']?due\b|appart\.?\s*2\b|apt\s*2\b/i.test(l)) return "apt2";
  for(const apt of apartments.filter(a=>a.id!=="all")){
    if(new RegExp("\\b"+apt.id+"\\b").test(l)) return apt.id;
    if(apt.label&&l.includes(apt.label.toLowerCase())) return apt.id;
  }
  return null;
}

// ── Relative time ─────────────────────────────────────────────────────────────

function parseRelativeShift(text) {
  if(/settimana\s+(?:dopo|successiva|prossima)/i.test(text)) return 7;
  if(/settimana\s+prima/i.test(text)) return -7;
  if(/mese\s+(?:dopo|successivo|prossimo)/i.test(text)) return 30;
  const m=text.match(/(\d+)\s+giorni\s+(dopo|avanti)/i); if(m) return Number(m[1]);
  const m2=text.match(/(\d+)\s+giorni\s+prima/i); if(m2) return -Number(m2[1]);
  return null;
}

// ── Price/guest extraction ────────────────────────────────────────────────────

function extractPrice(text) {
  const m=text.match(/prezzo[:\s]+€?\s*(\d+(?:[.,]\d+)?)|(?<![a-zA-Z])€\s*(\d+(?:[.,]\d+)?)/i);
  return m?Number((m[1]??m[2]).replace(",",".")):null;
}
function extractDeposit(text) {
  const m=text.match(/(?:caparra|deposito|acconto)[:\s]+€?\s*(\d+(?:[.,]\d+)?)/i);
  return m?Number(m[1].replace(",",".")):null;
}
function extractGuestCount(text) {
  const m=text.match(/(\d+)\s*(?:ospiti|persone|adulti|pers\.?|pax)/i); return m?Number(m[1]):null;
}

// ── Guest name extraction ─────────────────────────────────────────────────────

function extractGuestRef(text) {
  const clean=text
    .replace(/ha\s+confermato|ha\s+pagato|è\s+arrivat[ao]|check.?in|caparra|deposito/gi,"")
    .trim();
  const mDi=clean.match(/\bdi\s+([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2})/i); if(mDi) return mDi[1].trim();
  const mPer=clean.match(/\bper\s+([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2})(?:\s|$)/i);
  if(mPer){ const c=mPer[1].trim(); if(!/^apt/i.test(c)&&!/appart/i.test(c)) return c; }
  const mLead=text.match(/^([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)\s+(?:ha|è|fa|si)/);
  if(mLead) return mLead[1].trim();
  // Loose: any capitalized word that isn't a month
  const skip=new Set([
    ...Object.keys(MONTHS_IT).map(s=>s.charAt(0).toUpperCase()+s.slice(1)),
  ]);
  const mCap=text.match(/\b([A-ZÀ-Ÿ][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)\b/);
  if(mCap&&!skip.has(mCap[1])) return mCap[1].trim();
  return null;
}

// ── Fuzzy guest matching ──────────────────────────────────────────────────────

function scoreName(nameRef, fullName) {
  if(!nameRef||!fullName) return 0;
  const r=nameRef.toLowerCase().trim(); const n=fullName.toLowerCase();
  const parts=n.split(/\s+/);
  if(n===r) return 10;
  if(n.startsWith(r)||r.startsWith(n)) return 8;
  if(parts.some(p=>p===r)) return 7;
  if(parts.some(p=>p.startsWith(r)||r.startsWith(p))) return 5;
  if(r.split(/\s+/).some(w=>w.length>2&&n.includes(w))) return 3;
  return 0;
}

function fuzzyFindBookings(nameRef, bookings) {
  if(!nameRef) return [];
  return bookings
    .map(b=>({b, score: scoreName(nameRef, b.guest??"")}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .map(x=>x.b);
}

function latestDecisionForIds(ids, index) {
  return ids.map(id=>index[id]).filter(Boolean)
    .sort((a,b)=>(b.created_at??"")<(a.created_at??"")?-1:1)[0]??null;
}

function fuzzyFindThreads(nameRef, inbox, decisions) {
  const threads=groupInboxByThread(inbox);
  const decIdx=Object.fromEntries(decisions.map(d=>[d.inbox_id,d]));
  if(!nameRef) return threads.map(t=>({t,d:latestDecisionForIds(t.allIds,decIdx),score:1}));
  return threads
    .map(t=>{
      const d=latestDecisionForIds(t.allIds,decIdx);
      const raw=t.messages.map(m=>(m.raw_text??m.raw_metadata?.email_subject??"").toLowerCase()).join(" ");
      const s=Math.max(
        scoreName(nameRef,t.parsed_guest_name??""),
        raw.includes(nameRef.toLowerCase())?4:0,
      );
      return{t,d,score:s};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score);
}

// ── Context extraction from decision ─────────────────────────────────────────

function bookingDataFromDecision(decision) {
  if(!decision?.payload?.context_snapshot) return null;
  const cs=decision.payload.context_snapshot;
  const inq=cs.inquiry??{};
  const pricing=cs.pricing??{};
  const apartment=cs.apartment??{};
  return {
    aptId:    inq.aptId??apartment.id??null,
    aptLabel: apartment.label??null,
    checkin:  inq.checkin??null,
    checkout: inq.checkout??null,
    guests:   inq.guests??null,
    price:    pricing.totalPrice??null,
  };
}

// ── Intent detection ──────────────────────────────────────────────────────────

const INTENT_PATTERNS = [
  ["show_today_tasks", [
    /cosa\s+(?:ho|devo|c[e'è]|ci\s+(?:ho|sono))\s+(?:(?:da\s+)?fare\s+)?oggi/i,
    /fammi\s+il\s+punto/i,
    /punto\s+della\s+situazione/i,
    /riepilogo\s+(?:di\s+)?oggi/i,
    /riassunto\s+(?:di\s+)?oggi/i,
    /come\s+siamo\s+messi\s+oggi/i,
    /che\s+succede\s+oggi/i,
  ]],
  ["show_pending_requests", [
    /chi\s+devo\s+richiamare/i,
    /richieste?\s+(?:ancora\s+)?aperte?/i,
    /richieste?\s+in\s+attesa/i,
    /chi\s+(?:aspetta\s+)?(?:ancora\s+)?risposta/i,
    /cosa\s+[eèe]\s+(?:ancora\s+)?pendente/i,
    /messaggi\s+da\s+(?:gestire|rispondere)/i,
    /opportunit/i,
  ]],
  ["show_calendar_status", [
    /com[e'è]\s+(?:siamo\s+messi|messo)/i,
    /disponibilit[aà]/i,
    /buchi?\s+(?:liberi?|vuoti?|disponibili?)/i,
    /settimane?\s+libere?/i,
    /periodi?\s+(?:liberi?|vuoti?)/i,
    /che\s+(?:libero|posto)\s+(?:ho|c[e'è])/i,
  ]],
  ["confirm_request", [
    /ha\s+confermato/i,
    /(?:vuole?|vogliono)\s+prenotare/i,
    /conferm(?:a|ano|no)(?:\s+la\s+prenotazione)?/i,
    /procedi\s+con/i,
    /vai\s+avanti\s+con/i,
    /prenota(?:gli|le|lo|glielo)/i,
    /(?:ok|si|sì|va\s+bene)\s+(?:per\s+)?(?:la\s+)?prenotazione/i,
  ]],
  ["mark_deposit_paid", [
    /ha\s+pagato/i,
    /(?:caparra|deposito|acconto)\s+(?:ricevut[ao]|arrivat[ao]|pagat[ao]|ok)/i,
    /(?:caparra|deposito|acconto)\s+(?:\w+\s+){1,4}(?:ricevut[ao]|arrivat[ao]|pagat[ao]|ok)/i,
    /ha\s+versato/i,
    /bonifico\s+(?:ricevuto|arrivato)/i,
    /bonifico\s+(?:\w+\s+){1,4}(?:ricevuto|arrivato)/i,
    /pagamento\s+(?:ricevuto|arrivato|fatto)/i,
    /segna\s+(?:la\s+)?caparra/i,
  ]],
  ["mark_checkin_done", [
    /[eè]\s+arrivat[ao]/i,
    /check.?in\s+(?:fatto|ok|confermato|registrato|done)/i,
    /(?:ha\s+)?fatto\s+check.?in/i,
    /fa\s+check.?in/i,
    /[eè]\s+(?:qui|in\s+appartamento|entrat[ao])/i,
    /registra\s+(?:l['']?\s*)?arrivo/i,
    /segna\s+(?:l['']?\s*)?arrivo/i,
    /segna\s+(?:il\s+)?check.?in/i,
  ]],
  ["cancel_booking", [
    /cancella(?:\s+la\s+prenotazione)?/i,
    /disdici/i,
    /annulla\s+(?:la\s+)?prenotazione/i,
    /elimina\s+(?:la\s+)?prenotazione/i,
  ]],
  ["move_booking", [
    /sposta/i,
    /cambia\s+(?:le\s+)?date/i,
    /posticipa/i,
    /anticipa/i,
    /la\s+settimana\s+(?:dopo|successiva|prossima)/i,
    /\d+\s+giorni\s+(?:dopo|prima|avanti)/i,
  ]],
  ["create_booking", [
    /crea\s+prenotazione/i,
    /nuova\s+prenotazione/i,
    /(?:prenota|aggiungi\s+prenotazione)/i,
    /metti\s+\w+(?:\s+\w+)?\s+(?:sull|nell)['']?(?:uno|due|appartamento|apt)/i,
    /(?:metti|aggiungi)\s+\w+(?:\s+\w+)?\s+(?:in|su|sull)['']?\s*apt/i,
    /dal\s+\d{1,2}\/\d{1,2}.*al\s+\d{1,2}\/\d{1,2}.*(?:apt\d|appartamento|l[''](?:uno|due)|prezzo|€)/i,
  ]],
];

const INFORMATIVE_INTENTS = new Set([
  "show_today_tasks","show_pending_requests","show_calendar_status","no_action",
]);

function detectIntent(text) {
  for(const [intent, patterns] of INTENT_PATTERNS) {
    if(patterns.some(p=>p.test(text))) return intent;
  }
  return "no_action";
}

function computeConfidence(text, intent) {
  if(intent==="no_action") return 0.3;
  const patterns=INTENT_PATTERNS.find(([i])=>i===intent)?.[1]??[];
  const matched=patterns.filter(p=>p.test(text)).length;
  return Math.min(0.95, 0.6 + matched*0.15);
}

// ── Entity extraction ─────────────────────────────────────────────────────────

function extractEntities(text, {apartments=[], today=""}={}) {
  return {
    guestRef:     extractGuestRef(text),
    aptId:        detectApartment(text, apartments),
    dates:        extractDates(text),
    month:        extractMonth(text),
    price:        extractPrice(text),
    deposit:      extractDeposit(text),
    guests:       extractGuestCount(text),
    relativeShift:parseRelativeShift(text),
  };
}

// ── Context resolution ────────────────────────────────────────────────────────

function resolveContext(intent, entities, {bookings=[], inbox=[], decisions=[], today=""}={}) {
  const {guestRef, month, dates, relativeShift} = entities;

  if(INFORMATIVE_INTENTS.has(intent)) return {ok:true};

  const hasMonthRef = !guestRef && month && !dates.checkin;

  if(guestRef || !hasMonthRef) {
    if(intent==="confirm_request") {
      const threads = fuzzyFindThreads(guestRef, inbox, decisions);
      const availThreads = threads.filter(x=>
        ["available","has_alternatives","full_month"].includes(
          x.d?.payload?.raw_decision_type ?? x.d?.decision_type
        )
      );
      if(availThreads.length===1) {
        const data=bookingDataFromDecision(availThreads[0].d);
        const guestName=availThreads[0].t.parsed_guest_name??guestRef??"Ospite";
        return {ok:true, source:"inbox", thread:availThreads[0].t, decision:availThreads[0].d, bookingData:{...data, guest:guestName}};
      }
      if(availThreads.length>1) {
        return {ok:false, ambiguous:true, options:availThreads.map(x=>({
          label:`${x.t.parsed_guest_name??"?"} · ${x.t.source} · ${x.d?.payload?.context_snapshot?.inquiry?.checkin??"?"}`,
          thread:x.t, decision:x.d,
        }))};
      }
      const bks=fuzzyFindBookings(guestRef, bookings.filter(b=>b.status==="pending_payment"));
      if(bks.length===1) return{ok:true, source:"booking", booking:bks[0]};
      if(bks.length>1) return{ok:false, ambiguous:true, options:bks.map(b=>({label:`${b.guest} · ${b.apt} · ${b.checkin}`, booking:b}))};
      if(!guestRef) return{ok:false, missing:"nome ospite o richiesta"};
      return{ok:false, notFound:true, searched:guestRef};
    }

    const bks=fuzzyFindBookings(guestRef, bookings);
    if(bks.length===0) {
      if(!guestRef) return{ok:false, missing:"nome ospite"};
      return{ok:false, notFound:true, searched:guestRef};
    }
    if(bks.length===1) return{ok:true, source:"booking", booking:bks[0]};
    const active=bks.filter(b=>!["cancelled","rejected"].includes(b.status));
    if(active.length===1) return{ok:true, source:"booking", booking:active[0]};
    return{ok:false, ambiguous:true, options:active.slice(0,4).map(b=>({
      label:`${b.guest} · ${b.apt} · ${b.checkin}→${b.checkout}`, booking:b,
    }))};
  }

  const mBks=bookings.filter(b=>monthOf(b.checkin)===month&&!["cancelled"].includes(b.status));
  const mThreads=fuzzyFindThreads(null, inbox, decisions).filter(x=>
    monthOf(x.d?.payload?.context_snapshot?.inquiry?.checkin)===month
  );
  const total=[...mBks, ...mThreads];
  if(total.length===0) return{ok:false, notFound:true, searched:`richieste/prenotazioni in ${MONTH_LABEL[month]}`};
  if(mBks.length===1&&mThreads.length===0) return{ok:true, source:"booking", booking:mBks[0]};
  if(mThreads.length===1&&mBks.length===0) {
    const data=bookingDataFromDecision(mThreads[0].d);
    return{ok:true, source:"inbox", thread:mThreads[0].t, decision:mThreads[0].d, bookingData:{...data, guest:mThreads[0].t.parsed_guest_name??guestRef??"Ospite"}};
  }
  const opts=[
    ...mBks.map(b=>({label:`${b.guest} · ${b.apt} · prenotazione ${b.checkin}`, booking:b})),
    ...mThreads.map(x=>({label:`${x.t.parsed_guest_name??"?"} · richiesta via ${x.t.source}`, thread:x.t, decision:x.d})),
  ];
  return{ok:false, ambiguous:true, options:opts.slice(0,4)};
}

// ── Informative response builders ─────────────────────────────────────────────

function buildInformativeReply(intent, entities, {snapshot, bookings, today}={}) {
  if(intent==="show_today_tasks") {
    if(!snapshot) return "Snapshot non disponibile al momento.";
    const lines=[snapshot.agent_summary];
    if(snapshot.suggested_actions.length>0) {
      lines.push("\nAzioni prioritarie:");
      snapshot.suggested_actions.slice(0,5).forEach((a,i)=>lines.push(`${i+1}. ${a.action}`));
    }
    return lines.join("\n");
  }

  if(intent==="show_pending_requests") {
    if(!snapshot) return "Snapshot non disponibile.";
    const opps=snapshot.pending_opportunities;
    const msgs=snapshot.messages_to_review;
    if(opps.length===0&&msgs.length===0) return "Nessuna richiesta aperta al momento. Tutto gestito.";
    const lines=[];
    if(opps.length>0){
      lines.push(`Hai ${opps.length} opportunità da confermare:`);
      opps.slice(0,4).forEach((o,i)=>lines.push(`  ${i+1}. ${o.guestName??"?"} · ${o.source} · ${o.aptId??""}`))
    }
    if(msgs.length>0){
      lines.push(`\nHai ${msgs.length} messaggio/i da revisionare manualmente:`);
      msgs.slice(0,3).forEach((m,i)=>lines.push(`  ${i+1}. ${m.guestName??"?"} · ${m.decisionType}`));
    }
    return lines.join("\n");
  }

  if(intent==="show_calendar_status") {
    const month=entities.month;
    const aptId=entities.aptId;
    if(month){
      const mLabel=MONTH_LABEL[month]??"";
      const mBks=bookings.filter(b=>monthOf(b.checkin)===month&&!["cancelled"].includes(b.status));
      if(mBks.length===0) return `${mLabel.charAt(0).toUpperCase()+mLabel.slice(1)} è completamente libero${aptId?` per ${aptId}`:""}. `;
      const lines=[`${mLabel.charAt(0).toUpperCase()+mLabel.slice(1)}: ${mBks.length} prenotazione/i.`];
      mBks.forEach(b=>lines.push(`  • ${b.guest} · ${b.apt} · ${itDate(b.checkin)}–${itDate(b.checkout)}`));
      return lines.join("\n");
    }
    if(snapshot) return snapshot.agent_summary;
    return "Non ho una data o mese di riferimento. Prova: 'com'è messo agosto?'";
  }

  return "Capito. Non ho azioni specifiche da eseguire.";
}

// ── Operative response builders ───────────────────────────────────────────────

function buildOperativePlan(intent, entities, resolution, {bookings=[], apartments=[], today=""}={}) {
  const {guestRef, aptId, dates, price, deposit, guests, relativeShift} = entities;

  if(intent==="confirm_request"||intent==="create_booking") {
    const rd=resolution.bookingData??{};
    const finalAptId    = entities.aptId  ?? rd.aptId  ?? null;
    const finalCheckin  = dates.checkin   ?? rd.checkin ?? null;
    const finalCheckout = dates.checkout  ?? rd.checkout?? null;
    const finalGuest    = rd.guest        ?? guestRef   ?? null;
    const finalPrice    = entities.price  ?? rd.price   ?? null;
    const finalDeposit  = entities.deposit?? null;
    const finalGuests   = entities.guests ?? rd.guests  ?? null;

    const missing=[];
    if(!finalGuest)   missing.push("nome ospite");
    if(!finalAptId)   missing.push('appartamento ("apt1" o "apt2")');
    if(!finalCheckin) missing.push("data check-in");
    if(!finalCheckout)missing.push("data check-out");
    if(finalPrice==null) missing.push("prezzo");

    if(missing.length>0) return{type:"clarification", question:`Per creare la prenotazione mi manca: ${missing.join(", ")}. Puoi indicarmi questi dati?`};

    const avail=checkAvailability({aptId:finalAptId,checkin:finalCheckin,checkout:finalCheckout},bookings);
    if(!avail.available) {
      const who=avail.conflictingBooking?.guest??"altra prenotazione";
      return{type:"blocked", message:`Non posso procedere: il periodo ${itDate(finalCheckin)}–${itDate(finalCheckout)} per ${finalAptId} è occupato da "${who}".`};
    }

    const aptLabel=apartments.find(a=>a.id===finalAptId)?.label??finalAptId;
    return{
      type:"action",
      intent:"create_booking",
      payload:{guest:finalGuest, aptId:finalAptId, checkin:finalCheckin, checkout:finalCheckout, price:finalPrice, deposit:finalDeposit, guests:finalGuests},
      summary:`Crea prenotazione:\n• Ospite: ${finalGuest}\n• Appartamento: ${aptLabel}\n• Periodo: ${itDate(finalCheckin)} → ${itDate(finalCheckout)}\n• Prezzo: €${finalPrice}${finalDeposit?"\n• Caparra: €"+finalDeposit:""}`,
      confirmText:`Ho tutto. Vuoi che crei la prenotazione di ${finalGuest} (${aptLabel}, ${itDate(finalCheckin)}–${itDate(finalCheckout)}, €${finalPrice})?`,
    };
  }

  if(intent==="mark_deposit_paid") {
    const booking=resolution.booking;
    if(!booking) return{type:"clarification", question:"Non ho trovato la prenotazione. Di chi si tratta?"};
    if(!!(booking.deposit_paid??booking.depositPaid)) return{type:"blocked", message:`La caparra di ${booking.guest} risulta già ricevuta.`};
    return{
      type:"action", intent:"mark_deposit_paid",
      payload:{booking},
      summary:`Segna caparra ricevuta:\n• Ospite: ${booking.guest}\n• Appartamento: ${booking.apt}\n• Check-in: ${itDate(booking.checkin)}\n• Caparra: €${booking.deposit??0}`,
      confirmText:`Segno la caparra di ${booking.guest} come ricevuta?`,
    };
  }

  if(intent==="mark_checkin_done") {
    const booking=resolution.booking;
    if(!booking) return{type:"clarification", question:"Non ho trovato la prenotazione. Di chi si tratta?"};
    if(!!(booking.checkin_done??booking.checkinDone)) return{type:"blocked", message:`Il check-in di ${booking.guest} risulta già registrato.`};
    return{
      type:"action", intent:"mark_checkin_done",
      payload:{booking},
      summary:`Registra check-in:\n• Ospite: ${booking.guest}\n• Appartamento: ${booking.apt}\n• Data: ${itDate(booking.checkin)}`,
      confirmText:`Registro il check-in di ${booking.guest}?`,
    };
  }

  if(intent==="cancel_booking") {
    const booking=resolution.booking;
    if(!booking) return{type:"clarification", question:"Non ho trovato la prenotazione. Di chi si tratta?"};
    if(booking.status==="cancelled") return{type:"blocked", message:`La prenotazione di ${booking.guest} è già cancellata.`};
    return{
      type:"action", intent:"cancel_booking",
      payload:{booking},
      summary:`Cancella prenotazione:\n• Ospite: ${booking.guest}\n• Appartamento: ${booking.apt}\n• Periodo: ${itDate(booking.checkin)}–${itDate(booking.checkout)}`,
      confirmText:`Cancello la prenotazione di ${booking.guest}?`,
    };
  }

  if(intent==="move_booking") {
    const booking=resolution.booking;
    if(!booking) return{type:"clarification", question:"Non ho trovato la prenotazione. Di chi vuoi spostare le date?"};

    let newCheckin=dates.checkin, newCheckout=dates.checkout;
    if(!newCheckin&&relativeShift!==null) {
      newCheckin  = addDays(booking.checkin,  relativeShift);
      newCheckout = addDays(booking.checkout, relativeShift);
    }
    if(!newCheckin) return{type:"clarification", question:`Dove vuoi spostare la prenotazione di ${booking.guest}? Indica il nuovo periodo o "la settimana dopo".`};

    const bksWithout=bookings.filter(b=>b.id!==booking.id);
    const avail=checkAvailability({aptId:booking.apt,checkin:newCheckin,checkout:newCheckout},bksWithout);
    if(!avail.available) {
      const who=avail.conflictingBooking?.guest??"altra prenotazione";
      return{type:"blocked", message:`Non posso spostare: il periodo ${itDate(newCheckin)}–${itDate(newCheckout)} per ${booking.apt} è occupato da "${who}".`};
    }

    return{
      type:"action", intent:"move_booking",
      payload:{booking, newCheckin, newCheckout},
      summary:`Sposta prenotazione:\n• Ospite: ${booking.guest}\n• Da: ${itDate(booking.checkin)}–${itDate(booking.checkout)}\n• A: ${itDate(newCheckin)}–${itDate(newCheckout)}\n• Appartamento: ${booking.apt}`,
      confirmText:`Sposto ${booking.guest} da ${itDate(booking.checkin)}–${itDate(booking.checkout)} a ${itDate(newCheckin)}–${itDate(newCheckout)}?`,
    };
  }

  return{type:"blocked", message:"Non so come gestire questa richiesta."};
}

// ── Main export ───────────────────────────────────────────────────────────────

export function interpretMessage(text, {
  bookings=[], apartments=[], inbox=[], decisions=[], snapshot=null,
  today = new Date().toISOString().slice(0,10),
}={}) {
  if(!text?.trim()) return _reply("no_action", 0.1, "Non ho sentito nulla. Ripeti?");

  const intent     = detectIntent(text);
  const confidence = computeConfidence(text, intent);
  const entities   = extractEntities(text, {apartments, today});

  if(INFORMATIVE_INTENTS.has(intent)) {
    const reply=buildInformativeReply(intent, entities, {snapshot, bookings, today});
    return _reply(intent, confidence, reply);
  }

  if(intent==="no_action") {
    return _reply("no_action", 0.3,
      "Non ho capito cosa vuoi fare. Prova: 'fammi il punto', 'Rossi ha confermato', 'Bianchi ha pagato', 'è arrivato Verdi', 'sposta Rossi la settimana dopo'.");
  }

  const resolution = resolveContext(intent, entities, {bookings, inbox, decisions, today});

  if(resolution.ambiguous) {
    const opts=(resolution.options??[]).map((o,i)=>`${i+1}. ${o.label}`).join("\n");
    const q=`Ho trovato più corrispondenze. Quale intendi?\n${opts}`;
    return{reply:q, intent, confidence, needs_clarification:true, clarification_question:q, needs_confirmation:false, action_plan:null, options:resolution.options??[]};
  }

  if(!resolution.ok) {
    const searched=resolution.searched??" dati necessari";
    const missing=resolution.missing??null;
    const q=missing
      ?`Per procedere ho bisogno di: ${missing}. Puoi indicarmelo?`
      :`Non ho trovato "${searched}". Puoi essere più specifico?`;
    return{reply:q, intent, confidence, needs_clarification:true, clarification_question:q, needs_confirmation:false, action_plan:null, options:[]};
  }

  const plan = buildOperativePlan(intent, entities, resolution, {bookings, apartments, today});

  if(plan.type==="clarification") {
    return{reply:plan.question, intent, confidence, needs_clarification:true, clarification_question:plan.question, needs_confirmation:false, action_plan:null, options:[]};
  }
  if(plan.type==="blocked") {
    return _reply(intent, confidence, plan.message);
  }

  return{
    reply:                plan.confirmText,
    intent,
    confidence,
    needs_clarification:  false,
    clarification_question: null,
    needs_confirmation:   true,
    action_plan: {
      type:    plan.intent,
      payload: plan.payload,
      summary: plan.summary,
    },
    options: [],
  };
}

function _reply(intent, confidence, reply) {
  return{reply, intent, confidence, needs_clarification:false, clarification_question:null, needs_confirmation:false, action_plan:null, options:[]};
}
