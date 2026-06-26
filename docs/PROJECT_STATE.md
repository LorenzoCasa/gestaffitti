# GestAffitti — Project State

## Obiettivo prodotto

GestAffitti nasce come applicazione personale per gestire due appartamenti in affitto breve a Senigallia, ma deve evolvere in software/prodotto vendibile per altri host di affitti brevi.

## Stack attuale

- React + Vite
- Supabase
- Supabase Edge Functions
- Vercel
- GitHub
- Claude Code

## Stato milestone

- M1: chiuso
- M2: chiuso
- M3: chiuso e deployato
- M4: chiuso e mergeato con PR #33

## Ultima cosa fatta

PR #33 mergeata.

M4 Second Host Config Test completato: il motore è stato validato con configurazione host alternativa usando testHostConfig.js/template.

## Stato attuale

Si apre la decisione su M5.

Opzioni M5:

- M5A — secondo deploy / beta host reale usando testHostConfig.js come template
- M5B — preparazione multi-tenant DB solo se beta host reale è confermato
- M5C — piano Next.js

## Decisione consigliata

La scelta consigliata è M5A.

Motivo:
prima bisogna validare un secondo host reale/beta host reale. Solo dopo ha senso investire nella preparazione multi-tenant DB. La migrazione Next.js va pianificata, ma non deve precedere la validazione prodotto/mercato se non è strettamente necessaria.

## Regole operative

- Non usare la memoria ChatGPT come log tecnico del progetto.
- Ogni sessione Claude Code che cambia stato progetto deve aggiornare questo file.
- Ogni PR importante deve aggiornare questo file se modifica milestone, decisioni, stato deploy, architettura o prossimi passi.
- Non iniziare M5B prima di confermare un beta host reale.
- Non iniziare una migrazione Next.js senza decisione esplicita.
- Prima di proporre task tecnici, leggere sempre questo file.

## Prossimo passo operativo

Aprire M5A:
secondo deploy / beta host reale, partendo da testHostConfig.js come template.

## Prompt consigliato per nuove chat ChatGPT

Quando si apre una nuova chat per GestAffitti, incollare questo blocco:

"Siamo nel progetto GestAffitti. Lo stato tecnico ufficiale è nel file docs/PROJECT_STATE.md del repo. Stato sintetico: M1, M2, M3 completati; M3 deployato; M4 completato e PR #33 mergeata. Decisione aperta M5: M5A beta host reale consigliato, M5B multi-tenant solo se beta confermato, M5C piano Next.js. Prima di proporre task, ragiona sullo stato e non portarmi fuori roadmap."
