# GestAffitti Backlog

## Completato

### ✅ Orchestratore rentalAgentOrchestrator.js
Parser → risolve appartamento → stay rules → prezzo → disponibilità → alternative → risposta.

### ✅ Priorità calendario nella risposta
Se il calendario dice occupato, la risposta non dice mai disponibile.

### ✅ Alternative reali (agentAlternatives.js)
Priorità: altro apt stesso periodo → stesso apt date alternative → altro apt date alternative.
Ogni alternativa verificata sul calendario. Massimo 3.

### ✅ Alternative distinte nella risposta
Sezione separata "In alternativa possiamo proporle un altro appartamento" con nome esplicito.

### ✅ Mapping appartamenti Subito
apt1 = Appartamento A = "Lungomare Senigallia appartamento estivo 1"
apt2 = Appartamento B = "Lungomare Senigallia appartamento estivo 2"
Nessun fallback silenzioso al primo appartamento.
extractListingTitle() cerca in listing_title → email_subject → subject.

### ✅ Pulizia HTML email / filtro noise
Webhook strip HTML, salva html_body in raw_metadata.
Filtro: solo email con subject "Nuovo messaggio" vengono accettate (email_subject → subject).

### ✅ MessaggiSection MVP completa
- Tab Nuovi / Già gestiti
- Card con: appartamento riconosciuto, periodo, ospiti, disponibilità, prezzo, decision badge
- Risposta suggerita sempre visibile (collassata, espandibile)
- Pulsante Copia risposta
- Pulsante Apri Subito (link da html_body / email_html_body)
- Pulsante Segna come gestito → passa in Già gestiti
- Nessun fallback silenzioso: warning se appartamento non riconosciuto

### ✅ AgentSection = chat interna
Default su chat. "Analisi manuale" nascosta in sezione debug collassata.
MessaggiSection è l'unico centro operativo per richieste Subito.

---

## Sprint attuale — Pratiche e Lead

### 1. Lead/Pratica per ogni richiesta

Struttura futura in DB (nuova tabella `leads`):
- id, created_at, inbox_id (FK)
- nome, telefono, email (se disponibili dal messaggio)
- apt_id, source
- status: in_trattativa | confermata | archiviata | rifiutata
- note owner
- decision_id (FK, risposta approvata)
- booking_id (FK, se prenotazione creata)

UI da costruire: mostrare lead in MessaggiSection o sezione dedicata.
**Richiede migration — fermarsi e chiedere conferma.**

### 2. Salvataggio decisioni completo

- verificare salvataggio completo suggested_text / response_text / was_modified
- outcome: booking_made / rejected / no_response / no_reply
- outcome_updated_at
- usare per futuro LLM

### 3. Caparra e pagamento

In fase trattativa:
- importo caparra da indicare nella risposta
- metodo pagamento (bonifico, PayPal, contanti)
- scadenza pagamento caparra
- tracciamento pagamento ricevuto

---

## Prossimo sprint — LLM e automazione

### 4. Context builder per futuro LLM

Struttura JSON per futuro LLM: messaggio cliente, dati estratti, appartamento, dotazioni,
disponibilità, prezzi, regole soggiorno, alternative, storico decisioni approvate.
Obiettivo: il LLM legge solo questo context, non il DB direttamente.

### 5. LLM verticale GestAffitti

Non implementare prima di avere:
- orchestrator stabile ✅
- messaggi strutturati ✅
- alternative reali ✅
- salvataggio decisioni completo (da fare)
- almeno 50-100 risposte approvate per fine-tuning

Il LLM deve:
- generare testo naturale
- usare solo dati forniti dal context
- non inventare prezzi/disponibilità
- non inviare senza approvazione

### 6. API diretta invio risposte

Futura integrazione con Subito API o automazione browser.
Non implementare prima di avere flusso manuale stabile e testato.

### 7. Prenotazioni automatiche da approvazione

Dopo approvazione owner → crea prenotazione in calendario.
Richiede: Lead/Pratiche completato + dati cliente raccolti.

### 8. Analisi economica via agente

L'agente interno risponde a:
- "Quanto ho incassato questo mese?"
- "Quante prenotazioni ho ad agosto?"
- "Quali caparre sono in attesa?"
- "Quando è il prossimo check-in?"
Richiede context builder + AgentChat esteso con accesso a dati DB.
