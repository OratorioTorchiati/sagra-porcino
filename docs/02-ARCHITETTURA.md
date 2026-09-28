# 02 — Architettura tecnica

## 1. Panoramica

```
 Telefono (browser)                          Supabase (Free)
┌──────────────────────────┐   HTTPS/RPC   ┌──────────────────────────┐
│ Web app statica (PWA)    │ ────────────▶ │ Auth (sessioni)          │
│ - menù (JSON incluso)    │               │ Postgres + RLS           │
│ - giochi su canvas       │ ◀──────────── │ Funzioni RPC (la logica) │
│ - coda invii offline     │               │ Storage privato (selfie) │
└──────────────────────────┘               └──────────────────────────┘
        ▲
        │ servita da GitHub Pages (deploy con GitHub Actions)
```

**Principio**: il frontend è "stupido e veloce", il server è l'arbitro. Tutto ciò che vale punti passa da una funzione RPC che controlla le regole.

## 2. Frontend

- **Vite + JavaScript vanilla**, ES modules. Nessun framework.
- **Router a hash**: `#/`, `#/menu`, `#/giochi`, `#/giochi/<gameId>`, `#/profilo`, `#/registrati`, `#/accedi`, `#/segreto/<code>`, `#/privacy`, `#/staff`.
- **Giochi** su `<canvas>` con `requestAnimationFrame`, gestione di `devicePixelRatio`, input con Pointer Events. Un **motore comune** (`src/games/engine/`) fornisce: schermata regole, conto alla rovescia 3-2-1, timer, HUD (punti, tempo, vite, moltiplicatore), pausa automatica se la pagina va in background, schermata finale.
  - Pausa in background: il timer si ferma, ma il tentativo resta consumato. Al ritorno: "Tocca per continuare".
- **Grafica**: SVG disegnati a mano nel codice (funghi, personaggi, oggetti), rasterizzati una volta su canvas offscreen per le prestazioni. Palette autunnale (marroni, ocra, verde bosco, crema).
- **Audio**: facoltativo, disattivato di default, con bottone 🔊.
- **PWA**: `vite-plugin-pwa`, precache di HTML/JS/CSS/SVG/font e `menu.json`. L'app deve aprirsi senza rete dopo la prima visita.
- **Prestazioni**: bundle iniziale leggero (obiettivo < 300 KB gzip escluse eventuali foto del memory); i giochi si caricano con `import()` dinamico. Le foto del memory ottimizzate (WebP, ~300px).
- **Accessibilità**: font minimo 18px, contrasto AA, bottoni ≥ 56px, nessuna informazione trasmessa solo dal colore (es. funghi velenosi riconoscibili anche per forma).

### 2.1 ID dispositivo e impronta

- `lib/device.js`:
  - `getDeviceId()`: legge un UUID da localStorage → IndexedDB → cookie (il primo trovato), se manca lo genera con `crypto.randomUUID()` e lo riscrive in tutti e tre.
  - `getFingerprint()`: hash SHA-256 di user agent, dimensioni schermo, `devicePixelRatio`, lingua, fuso orario, `hardwareConcurrency`. Solo informativo, **non bloccante**.

### 2.2 Coda offline (`lib/queue.js`)

- Le operazioni `submit_score` e `claim_secret` vengono prima salvate in una coda in localStorage, poi inviate. In caso di errore di rete si ritenta con backoff (e a ogni evento `online` / apertura app).
- Ogni elemento ha un id di idempotenza (per `submit_score` è l'`attempt_id`), così un reinvio non crea doppioni.
- L'utente vede lo stato: "Punteggio salvato ✅" oppure "Punteggio in attesa di connessione ⏳ (verrà inviato da solo)".

## 3. Backend (Supabase)

### 3.1 Autenticazione

Supabase Auth richiede email + password, quindi si usa un'**email sintetica**:

- email = `<nickname_minuscolo>@giocatori.sagra.invalid` (dominio `.invalid`, mai usato per inviare posta);
- password = `sagra-` + PIN (Supabase richiede almeno 6 caratteri);
- impostazioni Auth: **conferma email disattivata**, registrazione libera attiva, durata sessione lunga (refresh token).

La registrazione avviene tramite `signUp` seguito dall'RPC `complete_registration` (vedi sotto), che crea il profilo e lega il dispositivo. Se `complete_registration` fallisce (dispositivo già usato, nickname preso), l'utente Auth appena creato va eliminato o marcato come orfano (scegliere la soluzione più semplice e documentarla; in alternativa fare tutta la registrazione in una Edge Function).

Limite noto: un PIN di 4 cifre è indovinabile per tentativi. Mitigazioni: rate limit di Supabase Auth sui login + blocco di 15 minuti dopo 5 PIN errati per lo stesso nickname (tabella `login_failures`, controllata da una funzione chiamata prima del login). Per una sagra è sufficiente.

Account staff: normali utenti Auth con email vera, con `role = 'staff'` in `profiles` (impostato a mano).

### 3.2 Schema del database (proposta)

```sql
profiles (
  id uuid pk references auth.users,
  nickname text unique not null,          -- confronto case-insensitive (citext o indice su lower())
  avatar text not null,                    -- id del personaggio
  role text not null default 'player',     -- 'player' | 'staff'
  disabled boolean not null default false,
  selfie_path text,                        -- null se non presente
  prize_token uuid not null default gen_random_uuid(), -- nel QR personale
  prize_given_at timestamptz,
  created_at timestamptz default now()
)

devices (
  device_id uuid pk,
  user_id uuid not null references profiles,
  fingerprint text,
  user_agent text,
  created_at timestamptz default now()
)
-- device_id pk ⇒ un dispositivo = un account creato

settings (key text pk, value jsonb)        -- es. selfie_enabled=false

games (
  id text pk,                              -- 'acchiappa' | 'quiz' | 'cadono' | 'memory'
  name text, night int,
  opens_at timestamptz, closes_at timestamptz,
  max_attempts int default 2,
  duration_s int,                          -- durata prevista (per i controlli)
  max_raw_score int                        -- tetto di plausibilità
)

attempts (
  id uuid pk default gen_random_uuid(),
  user_id uuid references profiles,
  game_id text references games,
  started_at timestamptz default now(),    -- ora del server
  submitted_at timestamptz,
  raw_score int,                           -- null finché non inviato
  stats jsonb,                             -- dettagli (streak max, mosse, ecc.)
  flagged boolean default false,           -- sospetto, per lo staff
  seed int,                                -- seme casuale della partita
  quiz_question_ids int[]                  -- solo quiz
)

quiz_questions (
  id serial pk, text text, options text[4], correct_index int, active boolean default true
)  -- NON leggibile dal client (le risposte non devono uscire)

secrets (
  id int pk,                               -- 1..5
  name text, image text,                   -- cosa mostrare nella griglia
  code text unique not null                -- casuale, 12+ caratteri, solo nel DB
)

secret_claims (
  user_id uuid, secret_id int, claimed_at timestamptz default now(),
  primary key (user_id, secret_id)
)

login_failures (nickname text, failed_at timestamptz)
```

### 3.3 Sicurezza (RLS)

- RLS **attiva su tutte le tabelle**.
- Il client può leggere: il proprio profilo; `games` (senza campi sensibili); `secrets` **senza la colonna `code`** (esporre una vista `secrets_public`); la classifica tramite RPC/vista.
- Il client **non può scrivere direttamente** in `attempts`, `secret_claims`, `profiles`, `devices`: solo tramite funzioni `SECURITY DEFINER`.
- `quiz_questions` e `secrets.code` mai leggibili dal ruolo `anon`/`authenticated`.
- Funzioni staff: controllano `role = 'staff'` all'inizio.
- Selfie: bucket Storage **privato**; policy di lettura solo per lo staff; upload solo del proprio file.

### 3.4 Funzioni RPC

| Funzione | Chi | Cosa fa |
|---|---|---|
| `server_time()` | tutti | Restituisce `now()`. |
| `check_nickname(nick)` | tutti | Disponibile sì/no (per feedback immediato). |
| `complete_registration(nickname, avatar, device_id, fingerprint, user_agent)` | nuovo utente | Verifica che `device_id` non abbia già un account, crea `profiles` e `devices`. Errori chiari: `DEVICE_ALREADY_USED` (con nickname mascherato), `NICKNAME_TAKEN`, `NICKNAME_INVALID`. |
| `get_games_state()` | loggato | Per ogni gioco: stato (aperto/bloccato/chiuso) calcolato con l'ora del server, tentativi usati, miglior grezzo, punti normalizzati. |
| `start_attempt(game_id)` | loggato | Controlla: account attivo, gioco aperto (ora server), tentativi < max. Inserisce `attempts` e restituisce `attempt_id`, `seed` e, per il quiz, le 5 domande **senza risposta corretta**. |
| `submit_score(attempt_id, raw_score, stats)` | loggato | Controlla: tentativo suo, non già inviato, entro 6 ore dall'avvio (coda offline), `raw_score` tra 0 e `max_raw_score`, durata dichiarata coerente. Se qualcosa non torna salva comunque ma `flagged = true`. **Per il quiz ignora `raw_score` e ricalcola lui** da risposte e tempi in `stats`. Idempotente. |
| `claim_secret(code)` | loggato | Trova l'oggetto dal codice, inserisce `secret_claims` se non esiste. Risposte: `FOUND`, `ALREADY_FOUND`, `INVALID`. |
| `get_leaderboard()` | tutti | Top 10 + posizione e totale dell'utente corrente (se loggato). Calcolo in §3.5. |
| `get_my_profile()` | loggato | Profilo, punti per gioco, oggetti trovati, posizione, `prize_token`. |
| `staff_*` | staff | `staff_lookup_prize(token)`, `staff_mark_prize(user_id)`, `staff_reset_pin(nickname, new_pin)` (via Edge Function con service role, perché serve l'API admin di Auth), `staff_disable_user`, `staff_set_setting`, `staff_update_game_window`, `staff_full_leaderboard`, `staff_delete_all_selfies`. |

### 3.5 Calcolo della classifica

Una vista o funzione SQL:

1. `best_raw` = per ogni (utente, gioco) il massimo `raw_score` tra i tentativi inviati e non `flagged` (i flagged restano esclusi finché lo staff non li approva).
2. `record` = per ogni gioco il massimo di `best_raw`.
3. `game_points` = `round(best_raw / record * 1000)` (0 se `record` = 0).
4. `secret_points` = 100 × oggetti trovati.
5. `total` = somma `game_points` + `secret_points`.
6. Ordinamento: `total` desc, oggetti trovati desc, orario dell'ultimo contributo asc.
7. Esclusi gli account `disabled` e `role = 'staff'`.

Con qualche migliaio di giocatori il calcolo al volo è sufficiente; se serve, cache di 30 secondi.

## 4. Deploy

- Repository GitHub pubblico; GitHub Actions: `npm ci && npm run build` nella cartella `app/`, pubblicazione di `app/dist` su GitHub Pages.
- Variabili nel build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (pubbliche, ma tenute nei secrets di Actions per ordine). Configurare `base` di Vite secondo l'URL di Pages (`/<nome-repo>/`).
- Migrazioni SQL applicate con la Supabase CLI (`supabase db push`) o incollate nell'editor SQL: documentare i passaggi nel README tecnico.
- **Attenzione**: i progetti Supabase gratuiti vanno in pausa dopo ~7 giorni di inattività. Riattivarlo qualche giorno prima della sagra e usarlo nei test.
- Dominio personalizzato: facoltativo.

## 5. Test

- Test unitari (Vitest) per: calcolo punteggi dei giochi, normalizzazione, coda offline, device id.
- Test SQL (anche semplici script) per le RPC: tentativi oltre il limite, gioco chiuso, dispositivo già usato, codice segreto ripetuto, quiz ricalcolato lato server.
- Test manuali su telefoni reali: almeno un Android economico, un iPhone, un telefono con schermo piccolo; con rete lenta (throttling) e in modalità aereo dopo il primo caricamento.
