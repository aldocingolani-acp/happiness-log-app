# Laboratorio della Felicita

PWA statica, mobile-first, pensata per misurare `eta` e `iota` ogni giorno.

## Cosa fa gia

- Chiede i 4 voti giornalieri: relazionale, espressivo-creativa, riflessiva, virtuosa.
- Calcola `eta` come media pesata configurabile.
- Calcola `iota` come combinazione di:
  - oggi
  - memoria breve
  - memoria media
  - memoria lunga
- Permette di modificare pesi, finestre temporali e baseline storiche.
- Supporta piu profili, con onboarding che traduce domande sui pesi in percentuali.
- Esporta e importa profili in JSON.
- Funziona come PWA installabile.
- Supporta login email via magic link e sync con Supabase quando configuri `config.js`.

## Seed iniziale del brief

Configurazione iniziale:

- ETA: relazionale 35%, espressiva 25%, riflessiva 15%, virtuosa 25%
- IOTA: oggi 60%, ultimi 2 giorni 25%, 3-45 giorni 10%, 46-548 giorni 5%
- Baseline: breve 9, media 6.5, lunga 8
- Oggi: 9 / 7 / 7.5 / 8.5

Risultato:

- `eta = 8.15`
- `iota = 8.19`

## Assunzione implementativa

Per evitare doppio conteggio, l'app usa finestre storiche disgiunte:

- `oggi`
- `1-2 giorni fa`
- `3-45 giorni fa`
- `46-548 giorni fa`

Quando mancano dati reali, riempie i giorni mancanti con le baseline configurate.

## Come aprirla

Serve un hosting statico qualunque:

- Supabase Storage + custom domain
- Netlify
- Vercel static deploy
- GitHub Pages

Una volta online:

1. apri la pagina dal telefono
2. usa "Aggiungi a schermata Home"
3. abilita notifiche quando richiesto

## Come attivare il cloud

1. crea il progetto Supabase
2. esegui [`supabase/schema.sql`](./supabase/schema.sql)
3. compila [`config.js`](./config.js)
4. deploya la function [`supabase/functions/send-reminders/index.ts`](./supabase/functions/send-reminders/index.ts)
5. schedula la function ogni 10 o 15 minuti

Guida rapida: [`supabase/setup.md`](./supabase/setup.md)

## Reminder alle 23

La PWA include service worker e gestione `push`, ma per una notifica vera a schermo spento serve un backend schedulato.

Nel folder [`supabase/schema.sql`](./supabase/schema.sql) c'e lo schema dati per:

- profili
- giornate
- subscription push

Nel folder [`supabase/reminders.md`](./supabase/reminders.md) c'e la proposta architetturale per fare:

- reminder alle 23
- multiutente
- condivisione con amici
- edge function di invio reminder

## File principali

- `index.html`
- `styles.css`
- `config.js`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
