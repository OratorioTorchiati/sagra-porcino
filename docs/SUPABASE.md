# Supabase: configurazione e manutenzione

Il "server" dell'app è un progetto **Supabase gratuito**. Non usiamo Supabase Auth (D21): account, sessioni e regole stanno in tabelle e funzioni nostre, in `supabase/migrations/`.

## 1. Creare il progetto (una volta)

1. https://supabase.com → accedi (va bene con GitHub; **non** serve collegare il repository al progetto).
2. **New project**: piano Free, nome `sagra-porcino`, regione **Central EU (Frankfurt)**, password del database generata e conservata nel gestore di password (non serve all'app). Lasciare attiva la **Data API**.
3. **Authentication → Sign In / Providers**: disattivare **"Allow new users to sign up"** (non usiamo Supabase Auth: così nessuno può crearvi utenti).
4. **Project Settings → API Keys**: copiare **Project URL** e chiave **publishable** (o la vecchia **anon**). Sono pubbliche.
   ⚠️ La chiave **service_role / secret** e la password del database non vanno MAI nel codice, nel repository o in chat.

## 2. Applicare le migrazioni (a ogni tappa che ne aggiunge)

Supabase → **SQL Editor** → **New query** → incollare il contenuto del file → **Run**. In ordine:

| File | Tappa | Contenuto |
|---|---|---|
| `supabase/migrations/001_accounts.sql` | 4 | giocatori, dispositivi, sessioni, blocco PIN, registrazione/accesso |
| `supabase/migrations/002_nickname_filter.sql` | 4 | filtro bestemmie e insulti nei nickname (senza censurare Armadio, Claudio...) |

Per aggiungere una parola vietata o un'eccezione (SQL Editor):

```sql
insert into banned_words (word, kind) values ('parola', 'contains');  -- 'contains' | 'word' | 'word_start'
insert into allowed_words (word) values ('parolainnocua');
```

I file si possono rieseguire senza danni (`create ... if not exists`, `create or replace`).

## 3. Collegare l'app

- **In locale**: copiare `app/.env.example` in `app/.env.local` e inserire URL e chiave (il file non va su git).
- **Sito pubblicato**: GitHub → repository → Settings → Secrets and variables → Actions → *New repository secret*: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Poi rilanciare il deploy (Actions → Run workflow, oppure un push).

## 4. Verificare

`npm run test:db` (dalla cartella `app/`, con `.env.local`) prova il database vero come farebbe un telefono: tabelle non accessibili, registrazione, un telefono = un account, nickname duplicati, accesso da un altro telefono, blocco dopo 10 PIN sbagliati, uscita. Crea giocatori di prova con nickname che iniziano per `zzt`, `zzl`.

## 5. Pulizia dei dati di prova (prima della sagra)

Nel SQL Editor:

```sql
delete from players where nickname like 'zz%';   -- giocatori di prova (sessioni e dispositivi si cancellano da soli)
delete from login_failures;
```

## 6. Attenzione: pausa dopo 7 giorni

I progetti gratuiti vanno **in pausa dopo ~7 giorni senza attività**. Riattivarlo dalla dashboard qualche giorno prima della sagra e usarlo nei test (checklist della Tappa 10).
