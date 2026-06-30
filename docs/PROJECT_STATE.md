# GestAffitti — Project State

## 1. Obiettivo prodotto

GestAffitti nasce come applicazione personale per gestire due appartamenti in affitto breve a Senigallia, ma deve evolvere in software/prodotto vendibile per altri host di affitti brevi.

Obiettivo finale:
creare un agente/gestionale per host di affitti brevi capace di supportare comunicazioni clienti, richieste da portali, prezzi, alternative, trattative, prenotazioni, caparre, check-in, marketing e gestione operativa.

La priorità non è solo tecnica: il progetto deve validare se può diventare prodotto vendibile.

## 2. Stack attuale

- Frontend: React + Vite
- Backend/data: Supabase
- Edge Functions: Supabase Edge Functions
- Deploy frontend: Vercel
- Repository/versionamento: GitHub
- Sviluppo assistito: Claude Code
- Database: Supabase come fonte di verità per dati reali
- LLM/AI: usato per generare risposte e ragionamenti, ma non deve sostituire il DB come fonte dati

Nota:
una migrazione futura a Next.js App Router è stata discussa/approvata come direzione possibile, ma non è ancora avviata. Va pianificata esplicitamente e non deve partire in automatico.

## 3. Dominio attuale

Il sistema oggi gestisce due appartamenti reali a Senigallia:

- apt1 = Appartamento A
- apt2 = Appartamento B

Entrambi sono collegati al flusso di richieste provenienti da Subito.

Regole/prezzi iniziali storici:
- luglio/agosto: 800€/settimana
- giugno: 500€/settimana
- settembre: 500€/settimana
- mese intero luglio/agosto: 2.600€
- mese intero giugno: 1.600€
- mese intero settembre: 1.500€

Regole soggiorno:
- preferenza sabato-sabato
- alternative entro ±30 giorni
- casi fuori regola o ambigui → manual review

Il DB resta la fonte di verità per disponibilità, regole, prenotazioni e configurazioni reali.

## 4. Flusso principale messaggi Subito

Flusso operativo attuale:

1. Il cliente scrive su Subito.
2. Make intercetta/trasmette il messaggio.
3. Il messaggio arriva via Gmail/webhook.
4. Una Edge Function lo elabora.
5. Il messaggio entra in `agent_inbox`.
6. Il sistema genera una decisione/risposta suggerita in `agent_decisions`.
7. L'utente vede la risposta nella sezione Messaggi.
8. L'utente può modificare/approvare.
9. L'invio verso Subito resta manuale/copiaincolla, salvo sviluppi futuri.

Elementi UI già presenti/attesi:
- riconoscimento annuncio Subito
- card con "Apri Subito"
- testo risposta suggerita
- textarea editabile
- bottone Approva
- stato/badge approvazione
- tracking risposta inviata/manuale

## 5. Orchestratore rental agent

Il core logico principale è basato su `rentalAgentOrchestrator.js`.

Principio:
pipeline pura, senza side effects.

Pipeline concettuale:
1. parse richiesta cliente
2. risoluzione appartamento/annuncio
3. applicazione regole soggiorno
4. calcolo prezzo stagionale
5. verifica disponibilità
6. proposta alternative
7. generazione risposta suggerita

La pipeline non deve inventare dati: per disponibilità e regole reali deve usare il DB o configurazioni esplicite.

## 6. Edge Functions principali

Edge Functions rilevanti:

- `llm-reply-generator`
- `manager-agent-brain`

Elementi noti:
- `llm-reply-generator` genera decisioni/risposte per i messaggi.
- Deve creare `agent_decisions` in modo sicuro.
- Sono stati introdotti fallback sicuri.
- `manager-agent-brain` supporta il Manager Agent.
- `_shared/hostConfig.ts` è rilevante per la configurazione host.
- Il deploy delle Edge Functions è manuale.
- I warning Docker già visti non sono necessariamente bloccanti se il deploy Supabase risulta completato correttamente.

## 7. Manager Agent

Il Manager Agent è la chat interna dell'app per domande operative su calendario, appartamenti, regole, prenotazioni, pricing, marketing e gestione.

Caratteristiche:
- chat interna
- supporto voce/Web Speech API
- brain con intent multipli
- contesto LLM separato
- deve leggere dati reali dal DB quando servono dati reali
- non deve affidarsi alla memoria ChatGPT per dati applicativi
- azioni operative richiedono conferma esplicita dell'utente

Principio:
il Manager Agent può ragionare, ma le azioni devono essere controllate e confermate.

## 8. Rental Business Brain / marketing / Subito

Sono stati sviluppati o integrati elementi per:
- Rental Business Brain
- pricing rules
- financials
- derived data
- marketing
- Subito promotion / draft marketing
- repair di risposte marketing incomplete

Caso noto:
è stato corretto un problema in cui il sistema produceva risposte vuote o inutili tipo "Eccolo, copia e incolla" nel flusso marketing/Subito.

## 9. UI e sezioni operative

Sezioni/funzionalità note:

### Messaggi
- gestione messaggi in arrivo
- risposte suggerite
- approvazione risposta
- modifica manuale testo
- tracking invio/manuale

### Prenotazioni
- tab "In arrivo"
- tab "Arrivati"
- logica:
  - "In arrivo" = prenotazioni non ancora check-in done
  - "Arrivati" = check-in già fatto o check-in passato

### Manager Agent
- chat interna
- domande operative
- ragionamento su calendario/prezzi/disponibilità/marketing
- eventuali azioni solo con conferma

## 10. Milestone e PR rilevanti

Stato milestone:

- M1: chiuso
- M2: chiuso
- M3: chiuso e deployato
- M4: chiuso e mergeato con PR #33
- M5: decisione aperta

PR/stati rilevanti noti:

### PR #24 — Agentic Brain v2
- completata e mergeata
- `manager-agent-brain` deployata manualmente su Supabase
- test/build verdi secondo stato precedente

### PR #26 — Rental Business Brain v1
- mergeata su main
- include elementi come pricingRules, financials, derived data e business brain

### PR #27 — marketing/Subito repair
- completata nel flusso storico
- corregge flusso marketing-promo
- introduce/usa logiche di repair per risposte marketing incomplete

### PR #29 — approvazione/invio risposte Subito
- completata e online secondo stato precedente
- include flusso di approvazione, modifica e marcatura invio
- commit noto: `f11652b`

### PR #31 — M2 host config decoupling
- mergeata
- introduce decoupling minimo della configurazione host
- configurazione Lorenzo/Senigallia non deve essere hardcoded come unico caso eterno

### PR #32 — M3 Edge Config Sync
- mergeata e deployata
- dopo merge e deploy manuale, `llm-reply-generator` e `manager-agent-brain` risultano funzionanti
- deploy include anche `_shared/hostConfig.ts`
- warning Docker non bloccante

### PR #33 — M4 Second Host Config Test
- mergeata
- M4 completato
- validazione del motore con host alternativo tramite `testHostConfig.js`/template
- obiettivo: verificare che il sistema possa iniziare a ragionare oltre il singolo host Lorenzo/Senigallia

### PR #34 — docs: PROJECT_STATE.md
- mergeata (commit `5d1a5ac`)
- aggiunto `docs/PROJECT_STATE.md` come fonte di verità ufficiale del progetto

### PR #35 — M5A-0 Beta Host Readiness
- mergeata (commit merge `7484a3f`, 2026-06-26)
- M5A-0 completato e deployato
- rimozione riferimenti hardcoded Lorenzo/Senigallia/Lungomare/Spiaggia di Velluto dalle utility del motore
- file modificati: `manager-agent-brain`, `llm-reply-generator`, `marketingReplyRepair.js`, `marketIntelligenceLayer.js`, `legalMarketPricingEngine.js`, `test-hostConfig.mjs`
- Edge Functions deployate: `manager-agent-brain`, `llm-reply-generator`
- test: 85/85 H01–H13 ✓, 74/74 npm test ✓, 16/16 marketingReplyRepair ✓
- invariante: comportamento Lorenzo con `DEFAULT_HOST_CONFIG` identico a prima

## 11. Stato attuale

M5B audit completato su branch `feat/m5b-multi-tenant-isolation`, PR #38 aperta — in attesa di merge.

Milestone M5:

- M5A-0 — ✅ completato e deployato (PR #35)
- M5A-1 — ✅ implementata su branch `feat/m5a-1-beta-host-config`, commit `77be101` — PR #37 aperta
- M5B — ✅ implementata e auditata (PR #38) — in attesa di merge
- M5C — bloccata — aspetta decisione esplicita Next.js

Ultima cosa fatta (M5B audit — 2026-06-30):
- branch `feat/m5b-multi-tenant-isolation` da main
- migration `supabase/migrations/m5b_multi_tenant_isolation.sql` applicata al DB linked
- `apartments.owner_id` popolato: apt1/apt2/property → Lorenzo (`adf5d712`)
- `agent_inbox.owner_id` aggiunto (ALTER TABLE) e backfillato: 55 messaggi → Lorenzo
- RLS sostituite: zero policy `allow all` su dati operativi
- policy aggiunte: owner per-tenant su bookings/expenses/apartments/inbox/decisions/apt_rules; cleaner full su bookings
- Edge Function `agent-webhook/index.ts`: `owner_id` aggiunto al INSERT
- `_shared/hostConfig.ts`: aggiunto `ownerUUID` a `EDGE_HOST_IDENTITY` (`adf5d712`)
- riga virtuale `property` inserita in `apartments` (active=false) per coprire le 9 spese comuni di Lorenzo
- isolamento verificato: Lorenzo vede 10 booking / 13 spese / 2 apt attivi / 55 inbox; B&B MARE vede 0
- Auth v1 inclusa: reset password via email, cambio password da Impostazioni, ResetPasswordScreen
- build verde (npm run build ✅) · test 74/74 ✅ · PR description corretta · nessun deploy

## 12. Decisione consigliata M5

Prossimo step: M5A-1.

Obiettivo M5A-1:
creare una configurazione reale per un beta host (non Lorenzo), verificare che il motore generi output corretti con quella config, senza DB multi-tenant.

M5B non va iniziata prima di avere un beta host reale confermato.

M5C, cioè piano Next.js, è importante ma non deve precedere automaticamente la validazione prodotto/mercato.

## 13. Regole operative fondamentali

- Il DB è la fonte di verità per dati reali.
- ChatGPT/memoria interna non deve essere usata come log tecnico del progetto.
- `docs/PROJECT_STATE.md` deve diventare la fonte di verità dello stato progetto.
- Ogni sessione Claude Code che cambia stato progetto deve aggiornare questo file.
- Ogni PR importante deve aggiornare questo file se modifica milestone, decisioni, stato deploy, architettura o prossimi passi.
- Non fare merge senza conferma esplicita.
- Non fare deploy senza conferma esplicita.
- Non modificare schema DB, secrets o configurazioni sensibili senza conferma esplicita.
- Non iniziare M5B prima di confermare un beta host reale.
- Non iniziare Next.js senza decisione esplicita.
- Prima di proporre task tecnici, leggere sempre questo file.
- Le modifiche devono essere piccole, verificabili e preferibilmente isolate in PR dedicate.
- Diagnosi e fix devono restare separati quando il problema è ambiguo.

## 14. Prossimo passo operativo

Merge PR #38 (M5B) → main. Deploy Edge Function `agent-webhook` (aggiornata con `owner_id`).

Dopo il merge:
1. deploy manuale `agent-webhook` su Supabase (unica Edge Function modificata in M5B)
2. smoke test: Lorenzo login → vede tutti i suoi dati, B&B MARE login → vede 0 dati
3. test reset password via email e cambio password da Impostazioni
4. test creazione dato B&B MARE (es. appartamento cam1) → Lorenzo non lo vede
5. valutare apertura M5C (Next.js) o altro step prodotto

Gap noti post-M5B da affrontare in M5C+:
- `expense_categories` condivise tra tutti gli owner (catalogo globale — ok per MVP)
- cleaner scoped a tutti gli appartamenti attivi, non solo quelli del suo owner (ok finché un solo cleaner)
- per B&B MARE con webhook proprio: creare Edge Function separata con `EDGE_HOST_IDENTITY.ownerUUID` aggiornato

## 15. Rischi aperti

- Migrare a Next.js prima di validare il secondo host reale end-to-end.
- Usare memoria ChatGPT come fonte dati invece del repo/DB.
- Accumulare modifiche Edge Functions senza deploy controllato.
- Fare PR troppo grandi e difficili da validare.
- `agent-webhook` aggiornata ma non ancora deployata: nuovi messaggi post-M5B ricevuti prima del deploy non avranno `owner_id` → non visibili a Lorenzo via RLS. Deploy urgente dopo merge M5B.
- Gap cleaner multi-owner: il cleaner vede bookings di tutti gli appartamenti attivi (ora solo Lorenzo). Da affrontare se B&B MARE avrà un cleaner separato.

## 16. Prompt consigliato per nuove chat ChatGPT

Quando si apre una nuova chat per GestAffitti, incollare:

"Siamo nel progetto GestAffitti. Lo stato tecnico ufficiale è nel file `docs/PROJECT_STATE.md` del repo. Stato sintetico: M1–M4 completati; M5A-0 Beta Host Readiness completato e deployato (PR #35, commit 7484a3f). Il motore è ora host-config driven. Prossimo step: M5A-1 beta host reale. M5B multi-tenant solo se beta confermato, M5C piano Next.js. Prima di proporre task, ragiona sullo stato e non portarmi fuori roadmap."

## 17. Regola di aggiornamento a fine sessione

A fine sessione Claude Code deve aggiornare questo file se è cambiato qualcosa.

Formato aggiornamento minimo:
- cosa è stato fatto
- branch/PR/commit coinvolti
- file principali modificati
- test/build/deploy eseguiti
- stato finale
- prossimo passo consigliato
- rischi o decisioni aperte

Dopo aver aggiornato il file:
- mostra il diff
- non fare commit finché non confermo
- proponi un commit message
