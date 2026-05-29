# GestAffitti Backlog

## Sprint attuale — Subito Auto Reply MVP

### 1. Consolidare rentalAgentOrchestrator.js

Creare un orchestratore centrale che riceve:
- rawText
- rawMetadata
- apartments
- bookings
- aptRules

E restituisce:
- parsed
- resolvedApartment
- stayRuleResult
- seasonalPrice
- availabilityResult
- alternatives
- responseContext
- suggestedResponse

Obiettivo: spostare logica fuori da AgentSection.

### 2. Correggere priorità calendario nella risposta

La risposta deve rispettare sempre la disponibilità reale.

Se il calendario dice non disponibile:
- non dire disponibile
- proporre alternative se esistono
- altrimenti chiedere se il cliente valuta altri periodi

### 3. Completare agentAlternatives.js

Implementare alternative reali:
- stesso appartamento stesso periodo
- stesso appartamento date alternative sabato-sabato
- altro appartamento stesso periodo
- altro appartamento date alternative sabato-sabato
- massimo 3 alternative totali
- usare calendario reale

### 4. Integrare alternative nella risposta suggerita

La risposta deve proporre solo alternative coerenti:
- compatibili con regole soggiorno
- compatibili con calendario
- con prezzo corretto

### 5. Ridurre logica dentro AgentSection

AgentSection deve:
- ricevere input
- chiamare orchestrator
- mostrare risultato
- salvare decisione

Non deve contenere tutta la logica agente.

### 6. Salvare dati per apprendimento futuro

Già avviato:
- suggested_text
- response_text
- was_modified
- outcome

Prossimo:
- verificare salvataggio completo
- outcome booking_made / rejected / no_response
- usare questi dati per futuro LLM

### 7. Creare sezione Messaggi

Sezione separata con:
- tutti i messaggi arrivati
- source
- contatto
- appartamento
- periodo
- stato
- risposta suggerita
- risposta approvata
- esito

### 8. Creare Contatti/Lead

Struttura futura:
- nome
- telefono/email se disponibili
- source
- richieste passate
- appartamento richiesto
- tag
- do_not_contact
- marketing_consent futuro
- last_contacted_at

### 9. Context builder per futuro LLM

Creare context strutturato per futuro LLM:
- messaggio cliente
- dati estratti
- appartamento
- dotazioni
- disponibilità
- prezzi
- regole soggiorno
- alternative
- storico decisioni approvate

### 10. Solo dopo: valutare LLM verticale GestAffitti

Il LLM deve:
- generare testo naturale
- usare solo dati forniti dal context
- non inventare prezzi/disponibilità
- non inviare senza approvazione

Non implementare LLM prima di avere:
- orchestrator stabile
- messaggi strutturati
- alternative reali
- salvataggio decisioni completo
