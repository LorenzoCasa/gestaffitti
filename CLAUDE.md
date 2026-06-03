# GestAffitti — Claude Code Operating Instructions

## Product Goal

GestAffitti è una web app per gestione affitti brevi.

L'obiettivo è costruire un sistema intelligente per gestire:
- appartamenti
- calendario/prenotazioni
- disponibilità
- prezzi stagionali
- regole di soggiorno
- messaggi arrivati da Subito
- contatti/leads
- risposte suggerite da approvare

GestAffitti non deve diventare un semplice risponditore automatico.
Deve diventare un'app agent-ready con un futuro LLM verticale specializzato in gestione affitti brevi.

## Product Direction

La struttura corretta è:

1. GestAffitti contiene dati certi e regole deterministiche.
2. Il futuro LLM verticale legge un contesto strutturato generato dall'app.
3. Il LLM genera testo naturale e suggerimenti.
4. L'utente approva/modifica prima dell'invio.
5. In futuro l'agente personale generale dell'utente potrà usare GestAffitti come strumento verticale.

## Deterministic Core

Questi elementi sono fonte di verità e non devono essere inventati dall'LLM:
- appartamenti
- dotazioni appartamenti
- calendario/prenotazioni
- disponibilità reale
- prezzi stagionali
- regole soggiorno
- alternative disponibili
- messaggi ricevuti
- decisioni approvate/modificate

Il calendario è fonte di verità.
Prezzo corretto non significa disponibilità.
La disponibilità deve essere verificata sempre tramite calendario/prenotazioni.

## Current Pricing Rules

Prezzi attuali MVP:
- Giugno: 500 €/settimana, 1600 €/mese intero
- Luglio: 800 €/settimana, 2600 €/mese intero
- Agosto: 800 €/settimana, 2600 €/mese intero
- Settembre: 500 €/settimana, 1500 €/mese intero

Per soggiorni di 2 o 3 settimane:
- prezzo = prezzo settimana × numero settimane

## Current Stay Rules

Per giugno, luglio e agosto:
- soggiorni da sabato a sabato
- durate valide: 7, 14, 21 notti
- mese intero valutabile

Settembre è prezzato, ma può essere trattato con maggiore flessibilità salvo istruzioni diverse.

## LLM Rules

Non implementare API LLM senza approvazione esplicita.
Non inserire chiavi API.
Non chiamare LLM dal frontend.
Non lasciare che l'LLM decida:
- prezzo
- disponibilità
- calendario
- appartamento
- creazione prenotazione
- invio messaggi

Il futuro LLM deve ricevere un context strutturato e generare solo una risposta naturale da approvare.

## Autonomy Allowed

Puoi lavorare in autonomia su:
- lettura file
- analisi tecnica
- piano breve
- modifiche codice dentro lo scope approvato (lo scope esplicito dell'utente sovrascrive il limite di 3 file)
- creazione utility in src/utils
- correzione errori build
- esecuzione npm run build
- test node locali
- riepilogo finale

## Must Ask Before

Devi fermarti e chiedere conferma prima di:
- modificare database o creare migration
- aggiungere dipendenze npm
- introdurre API esterne
- collegare LLM
- modificare autenticazione o sicurezza
- modificare Edge Function già funzionanti senza indicazione esplicita
- cambiare architettura generale
- superare lo scope esplicitamente approvato
- fare commit
- fare push
- fare deploy

## Never

Non fare mai senza conferma:
- commit
- push
- deploy
- invio automatico messaggi
- creazione automatica prenotazioni
- chiamate API esterne
- modifiche database non richieste
- riscrittura completa dell'architettura
- spostamento massivo di file
- refactor non richiesti

## Development Protocol

Per ogni task:

1. Leggi i file coinvolti.
2. Proponi piano breve.
3. Se il task è nello scope approvato, procedi.
4. Modifica solo i file necessari.
5. Esegui npm run build.
6. Se la build fallisce, correggi solo l'errore minimo.
7. Mostra riepilogo finale:
   - file modificati
   - build status
   - come testare
   - eventuali decisioni da prendere

## File Writing Rule

Se il tool Write tronca contenuti o produce file corrotti:
- usa Python Path.write_text
- usa patch Python chirurgiche
- evita heredoc lunghi se il contenuto viene troncato
- dopo ogni file importante esegui npm run build

## Apartment Mapping

Appartamenti reali nel database:
- apt1 → Appartamento A → titolo Subito: "Lungomare Senigallia appartamento estivo 1"
- apt2 → Appartamento B → titolo Subito: "Lungomare Senigallia appartamento estivo 2"

Il mapping è in `src/utils/agentListingResolver.js` (SUBITO_TITLE_MAP).
Non usare mai il primo appartamento come fallback silenzioso.
Se l'appartamento non viene riconosciuto: mostrare warning, non generare risposta.

Regola disponibilità:
- se cliente scrive da annuncio 1 → risposta principale riguarda apt1
- se apt1 non disponibile ma apt2 sì → apt2 è alternativa esplicita, mai l'appartamento principale
- stessa logica al contrario

## Current Architecture

L'orchestratore `src/utils/rentalAgentOrchestrator.js` è costruito e stabile.
Responsabilità: ricevere rawText, rawMetadata, apartments, bookings, aptRules →
chiamare parser → risolvere appartamento → applicare stay rules → calcolare prezzo →
verificare disponibilità → calcolare alternative → produrre suggestedResponse.

Il calendario ha sempre priorità. La risposta non può mai dire disponibile se il calendario dice occupato.

**Centro operativo: MessaggiSection**
La sezione Messaggi è il punto operativo principale.
Ogni messaggio Subito mostra direttamente: appartamento riconosciuto, disponibilità reale,
prezzo, risposta suggerita, tasto Copia risposta, tasto Apri Subito, tasto Segna come gestito.

Flusso semi-automatico attuale:
1. Messaggio arriva via Make → webhook → agent_inbox
2. MessaggiSection mostra risposta suggerita
3. Utente copia risposta → apre Subito → incolla → invia manualmente
4. Segna come gestito

**Sezione Agente: chat interna**
AgentSection è la chat interna dell'app per domande su disponibilità, calendario,
messaggi, prezzi, stato dell'app. Non è il passaggio obbligatorio per ogni messaggio.

**Pulizia HTML email**
Il webhook strip HTML dal raw_text e salva html_body in raw_metadata.
Il filtro noise usa raw_metadata.email_subject (fallback: subject).
Solo email con subject contenente "Nuovo messaggio" vengono accettate.

## Current Semi-Automatic Flow

Nessun invio automatico, nessuna Gmail reply, nessuna API Subito, nessuna API LLM.
Il tasto "Rispondi su Subito" apre il link estratto dall'html_body della mail.
Se il link non è disponibile, mostrare "link Subito non disponibile".

Flusso MVP attuale:
1. Messaggio Subito arriva via Make → Gmail → Edge Function → agent_inbox
2. MessaggiSection genera risposta automaticamente (buildAgentContext + generateGuestReply)
3. Utente copia risposta → apre Subito → incolla → invia manualmente
4. Segna come gestito

## Future Vision — Agente Personale Operativo

GestAffitti evolverà in un agente personale operativo per la gestione affitti brevi.
L'agente dovrà essere in grado di:

**Gestione richieste:**
- leggere e classificare richieste arrivate da qualsiasi canale
- riconoscere appartamento, periodo, ospiti, budget
- controllare disponibilità sul calendario reale
- calcolare prezzi e applicare regole di soggiorno
- proporre alternative verificate sul calendario
- generare risposta naturale tramite LLM verticale
- seguire la trattativa (controproposta, domande caparra, dati cliente)

**Gestione pratiche:**
- creare e aggiornare lead/pratiche per ogni richiesta
- chiedere e raccogliere dati cliente (nome, telefono, email)
- indicare importo e metodo pagamento caparra
- creare prenotazione nel calendario dopo conferma
- gestire stato pratica: in_trattativa → confermata → archiviata

**Analisi economica:**
- rispondere a domande su fatturato, occupazione, costi
- stato appartamenti, prenotazioni in corso, caparre attese
- scadenze (pulizie, check-in, pagamenti)

**Integrazione futura:**
- LLM verticale specializzato (addestrato su storico risposte approvate)
- API diretta Subito / WhatsApp per invio risposta senza copia-incolla
- automazione prenotazione dopo approvazione owner
- notifiche push per messaggi urgenti

**Ordine di implementazione:**
1. ✅ MessaggiSection inbox operativa (fatto)
2. Lead/Pratiche (prossimo)
3. Salvataggio decisioni e apprendimento
4. Context builder per LLM
5. LLM verticale (solo dopo dati sufficienti)
6. API diretta invio risposte
