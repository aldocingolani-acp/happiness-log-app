# Setup rapido Supabase

## 1. Crea il progetto

- crea un nuovo progetto Supabase
- abilita Email OTP in Authentication
- imposta il redirect URL del sito dove ospiterai la PWA

## 2. Esegui lo schema SQL

- apri SQL Editor
- incolla [`schema.sql`](./schema.sql)
- esegui

## 3. Compila `config.js`

Nel frontend, apri [`../config.js`](../config.js) e inserisci:

- `supabaseUrl`
- `supabaseAnonKey`
- `authRedirectTo`
- `webPushPublicKey`

Non mettere mai la `service_role` nel frontend.

## 4. Genera le chiavi VAPID

Puoi usare `web-push generate-vapid-keys` da una macchina con Node, oppure un generatore equivalente.

Ti servono:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`

La chiave pubblica va in `config.js`.

## 5. Deploy edge function

Function pronta: [`functions/send-reminders/index.ts`](./functions/send-reminders/index.ts)

Env richieste:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_SUBJECT`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `APP_BASE_URL`

## 6. Schedula il reminder

Esegui la edge function ogni 10 o 15 minuti.

Esempio logico:

- ogni 15 minuti chiami `send-reminders`
- la funzione seleziona i profili dovuti tramite `due_push_subscriptions`
- se l'entry del giorno esiste gia, non invia nulla
- se il reminder e gia stato inviato oggi, non duplica

## 7. Deploy frontend

Serve un hosting statico HTTPS:

- Netlify
- Vercel
- Supabase Hosting/Storage con dominio

Apri il sito dal telefono, installa la PWA e abilita notifiche.
