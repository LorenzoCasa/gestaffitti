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
- M5A-0: chiuso e deployato (PR #35)
- M5A-1: implementata su branch `feat/m5a-1-beta-host-config`, commit `77be101` — in attesa di PR/merge
- M5B: bloccata — aspetta validazione beta host reale end-to-end
- M5C: bloccata — aspetta decisione esplicita Next.js

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

### M5A-1 — Beta Host Config B&B MARE Riccione
- implementata su branch `feat/m5a-1-beta-host-config`, commit `77be101` (2026-06-27)
- in attesa di PR/merge su main — nessun deploy eseguito
- creata `src/config/hostConfig.betaHost.js` — config B&B MARE Riccione (host: Davide, Emilia-Romagna)
- 5 camere (Camera 1–5): letto matrimoniale + divano letto, capienza max 4, bagno privato, angolo cottura, A/C, TV, Wi-Fi; balcone Camera 1/2/3 sì, Camera 4/5 no
- pricing per notte: bassa 80€, media 100€, giugno 120€, luglio 160€, agosto 190€, ferragosto 230€, settembre 130€, capodanno/eventi 160€
- supplemento ospiti: +20€/notte per 3ª e 4ª persona (base fino a 2)
- stayRules: minNights=1, nessun obbligo sabato-sabato, weekendsAllowed=true, check-in qualsiasi giorno
- aggiunta sezione H14 (64 test) in `test-hostConfig.mjs`
- test: 149/149 ✓ · 74/74 npm test ✓ · build ✓
- invariante: DEFAULT_HOST_CONFIG Lorenzo confermato identico
- vincoli rispettati: nessun DB, nessun host_id/tenant_id/owner_id, nessun multi-tenant, nessuna Edge Function modificata, nessun Next.js

## 11. Stato attuale

M5A-0 completato e deployato. M5A-1 implementata su branch, in attesa di PR/merge.

Ultima cosa fatta:
- branch `feat/m5a-1-beta-host-config`, commit `77be101`
- creata `src/config/hostConfig.betaHost.js` — config beta B&B MARE Riccione
- aggiunta sezione H14 (64 test) in `test-hostConfig.mjs`
- 149/149 test verdi, build verde
- nessun deploy, nessuna modifica Edge Functions, nessun DB

## 12. Decisione consigliata M5

M5A-1 è implementata e pronta per PR verso main.

Dopo il merge di M5A-1:
1. smoke test manuale pipeline completa con BETA_HOST_CONFIG (pricing / stay rules / marketing reply)
2. valutare se aprire M5A-2 (test pipeline nightly + stayRules B&B) o passare direttamente a M5B
3. M5B multi-tenant solo dopo validazione beta host reale end-to-end
4. Next.js (M5C) solo con decisione esplicita

## 13. Regole operative fondamentali

- Il DB è la fonte di verità per dati reali.
- ChatGPT/memoria interna non deve essere usata come log tecnico del progetto.
- `docs/PROJECT_STATE.md` deve diventare la fonte di verità dello stato progetto.
- Ogni sessione Claude Code che cambia stato progetto deve aggiornare questo file.
- Ogni PR importante deve aggiornare questo file se modifica milestone, decisioni, stato deploy, architettura o prossimi passi.
- Non fare merge senza conferma esplicita.
- Non fare deploy senza conferma esplicita.
- Non modificare schema DB, secrets o configurazioni sensibili senza conferma esplicita.
- Non iniziare M5B prima di avere un beta host reale validato end-to-end.
- Non iniziare Next.js senza decisione esplicita.
- Prima di proporre task tecnici, leggere sempre questo file.
- Le modifiche devono essere piccole, verificabili e preferibilmente isolate in PR dedicate.
- Diagnosi e fix devono restare separati quando il problema è ambiguo.

## 14. Prossimo passo operativo

Aprire PR per M5A-1 e mergeare su main dopo review.

Stato M5A-1:
- branch `feat/m5a-1-beta-host-config`, commit `77be101`
- `src/config/hostConfig.betaHost.js` creato
- `src/utils/test-hostConfig.mjs` aggiornato con sezione H14 (64 test)
- 149/149 test verdi · 74/74 npm test verdi · build verde

Dopo il merge di M5A-1:
1. smoke test manuale pipeline con BETA_HOST_CONFIG
2. verificare pricing/stay rules/marketing reply con dati B&B MARE
3. valutare M5A-2 o passare direttamente a M5B
4. M5B multi-tenant solo se beta host reale validato end-to-end
5. Next.js (M5C) solo con decisione esplicita

## 15. Rischi aperti

- Costruire multi-tenant troppo presto.
- Migrare a Next.js prima di validare il secondo host reale.
- Confondere BETA_HOST_CONFIG (simulazione interna) con un beta host reale in produzione.
- Usare memoria ChatGPT come fonte dati invece del repo/DB.
- Accumulare modifiche Edge Functions senza deploy controllato.
- Fare PR troppo grandi e difficili da validare.
- `interpretMessage` non è ancora testato con alias "Camera 1", "Camera 2" ecc. — potrebbe richiedere adattamenti nel motore agente per il caso B&B.
- La config beta è solo simulazione interna del motore: nessun flusso UI o DB coinvolto.

## 16. Prompt consigliato per nuove chat ChatGPT

Quando si apre una nuova chat per GestAffitti, incollare:

"Siamo nel progetto GestAffitti. Lo stato tecnico ufficiale è nel file docs/PROJECT_STATE.md del repo. Stato sintetico: M1-M4 completati; M5A-0 completato e deployato; M5A-1 Beta Host Config B&B MARE Riccione implementata su branch feat/m5a-1-beta-host-config, commit 77be101, in attesa di PR/merge. M5B multi-tenant bloccata finché il beta host non è validato end-to-end. Next.js/M5C fermo salvo decisione esplicita. Prima di proporre task, leggere PROJECT_STATE.md e restare in roadmap."

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
