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
| `supabase/migrations/003_games_attempts.sql` | 5 | giochi, tentativi (3 al giorno), punteggi ricontrollati, domande del quiz di esempio |
| `supabase/migrations/004_reset_ore_9.sql` | 5 | tentativi che si rinnovano alle 9 di mattina, nomi "Quiz" e "Memory Torchiati" |
| `supabase/migrations/005_acchiappa_moltiplicatore_a_tempo.sql` | 5 | Acchiappa: 5 punti a porcino e moltiplicatore a tempo |
| `supabase/migrations/006_acchiappa_tempi_piu_lunghi.sql` | 5 | Acchiappa: moltiplicatori 7/6/5 secondi |
| `supabase/migrations/007_classifica.sql` | 6 | classifica (somma dei migliori + punti extra), aggiornata dai trigger, scheda giocatore |
| `supabase/migrations/008_staff.sql` | 8 | pannello staff: giocatori, reset PIN, disattiva/cancella, punti extra, partite da controllare, impostazioni, registro |
| `supabase/migrations/009_staff_ricerca_replay.sql` | 8 | ricerca, classifica e registro del pannello a pagine (con filtri), dati per "Rivedi partita" |
| `supabase/migrations/010_revisione_staff.sql` | 8 | revisione staff delle partite segnalate ed escluse (Approva / Conferma esclusione / Ban), tentativi contati a parte, segnale "tocchi al centro" |
| `supabase/migrations/011_ban_telefono.sql` | 8 | ban del telefono (da lì non si entra con nessun account), elenco telefoni bloccati |
| `supabase/migrations/012_registro_accessi.sql` | 8 | registro degli accessi (ultimi 20 per giocatore nel pannello) |
| `supabase/migrations/013_accessi_per_telefono.sql` | 8 | ultimi accessi di un solo telefono |
| `supabase/migrations/014_acchiappa_ricarica_tempo.sql` | 8 | Acchiappa: ogni porcino ricarica il tempo del moltiplicatore, ×4 a 15 |
| `supabase/migrations/015_acchiappa_oggetti_tempo.sql` | 8 | Acchiappa: gli oggetti tolgono 2 s alla partita, il riccio è velenoso |
| `supabase/migrations/016_pin_sicurezza.sql` | 8 | PIN di 5 cifre non troppo semplice, 5 tentativi di accesso e blocco che cresce |
| `supabase/migrations/017_blocco_per_ip.sql` | 8 | blocco dei tentativi per nickname + IP, tetto per IP e per nickname |
| `supabase/migrations/018_ip_affidabile.sql` | 8 | IP del telefono solo da fonti affidabili (non falsificabile) |
| `supabase/migrations/019_acchiappa_livelli_a_timer.sql` | 8 | Acchiappa: livelli a timer (sforamento → livello successivo) |
| `supabase/migrations/020_personaggi_velenosi.sql` | 8 | 4 personaggi velenosi, cambio del personaggio dal profilo |
| `supabase/migrations/021_ruoli_e_sezioni.sql` | 8 | ruoli Mod e Admin (l'account "staff" diventa Admin), sezioni dell'app accendibili, Configurazioni e Registro solo Admin |

Impostazioni dei giochi (SQL Editor):

```sql
update settings set value = '3' where key = 'attempts_per_day';                                   -- tentativi al giorno per gioco
update settings set value = '9' where key = 'attempts_reset_hour';                                -- ora in cui tornano i tentativi (0 = mezzanotte)
update settings set value = '"2026-10-17T15:00:00+02:00"' where key = 'games_open_from';          -- apertura (null = già aperti)
update settings set value = '"2026-10-18T23:00:00+02:00"' where key = 'games_open_until';         -- chiusura della classifica
update games set enabled = false where id = 'memory';                                             -- spegnere un gioco
```

Per aggiungere una parola vietata o un'eccezione (SQL Editor):

```sql
insert into banned_words (word, kind) values ('parola', 'contains');  -- 'contains' | 'word' | 'word_start'
insert into allowed_words (word) values ('parolainnocua');
```

I file si possono rieseguire senza danni (`create ... if not exists`, `create or replace`).

## 2b. Account dello staff: Mod e Admin (pannello `#/admin`)

Due ruoli (D93):
- **Mod** (`role = 'staff'`): giocatori (ricerca, reset PIN, ban, punti extra, cancella), partite da controllare con replay, telefoni, classifica.
- **Admin** (`role = 'admin'`): tutto quello del Mod, più **⚙️ Configurazioni** (sezioni dell'app, minigiochi, tentativi, orari…) e **Registro**.

Gli account si creano a mano nel SQL Editor (per un Admin scrivere `'admin'` al posto di `'staff'`). **La password la scrivi tu** al posto di `SCRIVI-QUI-LA-PASSWORD`
(lunga, almeno 12 caratteri; non va mai nel repository né in chat). Il nickname è quello con cui si entra.

```sql
insert into players (nickname, avatar, pin_hash, role)
values ('Staff-Nome', 'gufetto', extensions.crypt('SCRIVI-QUI-LA-PASSWORD', extensions.gen_salt('bf', 10)), 'staff');
```

Cambiare la password di uno staff:

```sql
update players set pin_hash = extensions.crypt('NUOVA-PASSWORD', extensions.gen_salt('bf', 10))
where nickname = 'Staff-Nome' and role = 'staff';
```

Togliere un account staff: `delete from players where nickname = 'Staff-Nome' and role = 'staff';`

Promuovere un Mod ad Admin (o il contrario): `update players set role = 'admin' where nickname = 'Staff-Nome';`

⚠️ Il SQL Editor salva le query: dopo aver creato l'account (o cambiato la password) cancella quella query
dall'elenco delle query salvate/recenti, così la password non resta scritta da nessuna parte.

Si entra da `https://oratoriotorchiati.github.io/sagra-porcino/#/admin` (o dal Profilo → "🛠️ Pannello Admin"; il vecchio `#/staff` porta lì).
Mod e Admin hanno tentativi illimitati e non compaiono in classifica.

## 3. Collegare l'app

- **In locale**: copiare `app/.env.example` in `app/.env.local` e inserire URL e chiave (il file non va su git).
- **Sito pubblicato**: GitHub → repository → Settings → Secrets and variables → Actions → *New repository secret*: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Poi rilanciare il deploy (Actions → Run workflow, oppure un push).

## 4. Verificare

`npm run test:db` (dalla cartella `app/`, con `.env.local`) prova il database vero come farebbe un telefono: tabelle non accessibili, registrazione, un telefono = un account, nickname duplicati, accesso da un altro telefono, blocco dopo 10 PIN sbagliati, uscita. Crea giocatori di prova con nickname che iniziano per `zzt`, `zzl`.

## 5. Pulizia dei dati di prova (prima della sagra)

Nel SQL Editor:

```sql
delete from players where nickname like 'zz%';   -- giocatori di prova (sessioni, dispositivi, tentativi e riga in classifica si cancellano da soli)
delete from login_failures;
delete from login_blocks;
delete from attempts;                              -- TUTTI i tentativi (classifica azzerata): solo prima della sagra!
delete from quiz_questions;                        -- domande di esempio, prima di caricare quelle vere
delete from staff_log;                             -- registro delle azioni dello staff fatte durante le prove
```

## 6. Attenzione: pausa dopo 7 giorni

I progetti gratuiti vanno **in pausa dopo ~7 giorni senza attività**. Riattivarlo dalla dashboard qualche giorno prima della sagra e usarlo nei test (checklist della Tappa 10).
