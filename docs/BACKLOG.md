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

### ✅ Pulizia HTML email / filtro noise
Webhook strip HTML, salva html_body in raw_metadata.
Filtro: solo email con subject "Nuovo messaggio" vengono accettate.

### ✅ MessaggiSection base
Sezione Messaggi con lista inbox, badge stato, testo pulito.

---

## Sprint attuale — MessaggiSection come centro operativo

### 1. MessaggiSection: card completa con analisi e azioni

Ogni messaggio Subito deve mostrare:
- testo cliente pulito (no HTML)
- appartamento riconosciuto (da listing_title)
- periodo e ospiti se estratti
- disponibilità reale sul calendario corretto
- prezzo
- risposta suggerita
- pulsante Copia risposta
- pulsante Apri Subito (se link disponibile)
- pulsante Segna come gestito

Tab: Nuovi / Già gestiti

### 2. Link "Apri Subito"

Estrarre link dalla mail (raw_metadata.html_body).
Se disponibile → tasto attivo.
Se non disponibile → "link Subito non disponibile".
Futura integrazione Make: aggiungere raw_metadata.subito_url come campo diretto.

### 3. Sezione Agente → chat interna

AgentSection diventa chat interna per domande su disponibilità, calendario, messaggi, prezzi.
Non è più il passaggio obbligatorio per ogni messaggio.
Default: tab Chat.

---

## Prossimo sprint

### 4. Salvare dati per apprendimento futuro

- verificare salvataggio completo suggested_text / response_text / was_modified
- outcome: booking_made / rejected / no_response
- usare per futuro LLM

### 5. Creare Contatti/Lead

- nome, telefono/email se disponibili, source
- richieste passate, appartamento richiesto, tag
- do_not_contact, marketing_consent futuro, last_contacted_at

### 6. Context builder per futuro LLM

Struttura per futuro LLM: messaggio cliente, dati estratti, appartamento, dotazioni,
disponibilità, prezzi, regole soggiorno, alternative, storico decisioni approvate.

### 7. Solo dopo: valutare LLM verticale GestAffitti

Non implementare LLM prima di avere:
- orchestrator stabile ✅
- messaggi strutturati ✅
- alternative reali ✅
- salvataggio decisioni completo
