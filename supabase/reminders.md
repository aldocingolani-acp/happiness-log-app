# Reminder e multiutente con Supabase

## Obiettivo pratico

Vuoi una PWA condivisibile che:

- mandi un reminder alle 23
- salvi i dati nel cloud
- permetta a ogni amico di configurare i propri pesi

## Architettura consigliata

1. Frontend statico
   - questa cartella PWA
   - hosting statico

2. Auth
   - Supabase Auth per identificare ogni utente
   - ogni utente ha uno o piu profili

3. Dati
   - `happiness_profiles`
   - `happiness_entries`
   - `push_subscriptions`

4. Reminder
   - il frontend chiede il permesso notifiche
   - il browser crea una `push subscription`
   - la subscription viene salvata in `push_subscriptions`
   - una job schedulata gira ogni 10 o 15 minuti
   - la job chiama la edge function `send-reminders`
   - la edge function usa `due_push_subscriptions(...)`
   - se la giornata esiste gia o il reminder e gia stato inviato oggi, non invia nulla

## Onboarding per amici

Alla prima apertura:

1. chiedi il nome
2. chiedi "quanto pesa per te?" da 0 a 10 per:
   - relazionale
   - espressivo-creativa
   - riflessiva
   - virtuosa
3. normalizza automaticamente a 100%
4. salva i pesi nel profilo

L'app che ho costruito fa gia questo lato frontend.

## Nota importante sulle notifiche web

Le notifiche push web su telefono sono realistiche, ma non vanno pianificate solo lato browser. Per averle in modo affidabile serve una job lato backend.

Se vuoi la massima affidabilita su iPhone e Android, le strade pragmatiche sono:

- PWA + backend push
- wrapper nativo leggero con Capacitor
- in alternativa reminder via Telegram o email

## RLS da aggiungere quando colleghi Auth

Quando colleghi Supabase Auth, aggiungi policy che limitino:

- accesso ai profili del solo proprietario
- accesso alle entry dei soli profili del proprietario
- accesso alle push subscription del proprietario

Nel progetto questa parte e gia prevista nello schema aggiornato.
