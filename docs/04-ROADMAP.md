# 04 — Roadmap a tappe

Ogni tappa produce qualcosa **di funzionante e provabile sul telefono**. Si completa una tappa, si verificano i criteri di accettazione, si aggiorna il registro in `05-DECISIONI.md` e ci si ferma per il via libera.

Legenda: 🎯 obiettivo · 🔨 da fare · ✅ criteri di accettazione · 🚫 da non fare in questa tappa

---

## Tappa 0 — Fondamenta e primo deploy

🎯 Un sito vuoto ma vero, online su GitHub Pages, apribile dal telefono.

🔨
- Inizializzare il repository git con la struttura cartelle di `CLAUDE.md`.
- Progetto Vite in `app/`, router a hash, stile base (palette autunnale, font leggibili, variabili CSS).
- Home con i 3 box (Menù, Minigiochi, Il mio profilo) che portano a pagine segnaposto.
- GitHub Actions per il deploy su GitHub Pages.
- README tecnico con i comandi (`npm run dev`, build, deploy) e i passi per creare il repo su GitHub.

✅
- L'URL di GitHub Pages si apre sul telefono e mostra la home.
- I 3 box navigano e il tasto "indietro" del telefono funziona.
- Leggibile a 360px di larghezza, senza scroll orizzontale.

🚫 Supabase, giochi, account.

---

## Tappa 1 — Menù + offline (PWA)

🎯 L'app è già utilizzabile come **QR menù**, anche senza rete.

🔨
- Pagina Menù da `menu.json` (dati di esempio finché non arrivano quelli veri; formato in `contenuti/README.md`).
- Service worker con precache: dopo la prima visita l'app si apre in modalità aereo.
- Generare un QR code di prova che punta all'URL di Pages.

✅
- Il menù si legge bene sul telefono, categorie ben separate.
- Modalità aereo dopo la prima visita: home e menù si aprono.
- Modificando `menu.json` e ripubblicando, il menù si aggiorna (gestione dell'aggiornamento del service worker).

🚫 Account, giochi.

---

## Tappa 2 — Motore di gioco + "Acchiappa il porcino" (in prova)

🎯 Il primo gioco completo e divertente, giocabile senza account.

🔨
- Motore comune (`src/games/engine/`): schermata regole, 3-2-1, timer, HUD, pausa in background, schermata finale, RNG con seed, configurazione per gioco.
- Grafica SVG: 4 varietà di porcino, funghi velenosi, oggetti (castagna, riccio, pigna, foglia, lumaca), sfondo.
- Gioco completo come da `03-GIOCHI.md`.
- Pagina Minigiochi provvisoria con il gioco in **modalità prova** (nessun tentativo consumato).

✅
- Fluido (≈60 fps) su un telefono di fascia media.
- Tutti gli elementi sono toccabili (min 48px) e i velenosi si distinguono anche per forma.
- Moltiplicatore e azzeramento della serie funzionano e sono ben visibili.
- Test unitari del calcolo punti.
- Prova "sul campo": farlo giocare a 2–3 persone di età diverse e raccogliere impressioni.

🚫 Server, account.

---

## Tappa 3 — Gli altri 3 giochi (in prova)

🎯 Tutti e 4 i giochi completi, in modalità prova.

🔨
- **Porcini che cadono**.
- **Memory del paese** (immagini segnaposto se le foto non ci sono).
- **Quiz**: interfaccia completa con domande di esempio **solo in locale e solo in modalità prova** (in produzione arriveranno dal server alla tappa 5).
- Pagina Minigiochi con le 4 card (ancora senza stati reali).

✅
- I 4 giochi si giocano dall'inizio alla fine su telefono.
- Punteggi grezzi calcolati come da `03-GIOCHI.md`, con test unitari.
- Ogni gioco ha la sua schermata regole con i testi di `03-GIOCHI.md`.

🚫 Server, account.

---

## Tappa 4 — Supabase: account, personaggi, dispositivo

🎯 Ci si registra con personaggio, nickname e PIN; un telefono = un account.

🔨
- Guida passo passo per l'utente: creare il progetto Supabase, impostare Auth (conferma email OFF), inserire le chiavi.
- Migrazioni: `profiles`, `devices`, `settings`, `login_failures` con RLS.
- RPC `check_nickname`, `complete_registration`, `get_my_profile`; blocco dopo 5 PIN errati.
- `lib/device.js` (ID dispositivo + impronta).
- Galleria di 8–12 personaggi SVG originali; il primo è scelto a caso.
- Pagine Registrati, Accedi, Profilo (senza punti per ora), Esci, Informativa privacy (testo provvisorio).

✅
- Registrazione e login funzionano; la sessione sopravvive alla chiusura del browser.
- Stesso telefono, secondo account → rifiutato con messaggio chiaro.
- Stesso account da un altro telefono → accesso consentito con il PIN.
- Nickname duplicato (anche con maiuscole diverse) → rifiutato.
- Dal client non si riesce a scrivere direttamente nelle tabelle (provato).

🚫 Tentativi, punteggi, classifica.

---

## Tappa 5 — Tentativi e punteggi sul server

🎯 Si gioca "sul serio": 2 tentativi per gioco, contati all'avvio, calendario per serata.

🔨
- Migrazioni: `games` (con finestre orarie), `attempts`, `quiz_questions`.
- RPC `server_time`, `get_games_state`, `start_attempt`, `submit_score` (controlli di plausibilità, `flagged`, ricalcolo quiz lato server).
- Coda offline per gli invii (`lib/queue.js`) con stato visibile all'utente.
- Pagina Minigiochi definitiva: box "Come funziona", card con stati (aperto / "🔒 Disponibile domani" / chiuso), tentativi usati, miglior punteggio; conferma "usi un tentativo".
- Seed con domande quiz di esempio.

✅
- Terzo tentativo impossibile, anche ricaricando la pagina o cancellando i dati del browser.
- Chiudere l'app a metà partita consuma il tentativo.
- Un gioco fuori dalla sua finestra oraria non si può avviare, anche cambiando l'ora del telefono.
- Punteggio fatto offline arriva al server appena torna la rete, senza doppioni.
- Le risposte del quiz non sono presenti nel codice del sito né nelle risposte di rete durante la partita.
- Vale il migliore dei due tentativi.

🚫 Classifica, oggetti segreti.

---

## Tappa 6 — Classifica e normalizzazione

🎯 Classifica unica, con i 4 giochi che pesano uguale.

🔨
- Funzione SQL della classifica come da `02-ARCHITETTURA.md` §3.5.
- RPC `get_leaderboard`; sezione Classifica nella tab Minigiochi (top 10 con "zona premi" + riga dell'utente); cache offline con orario.
- Profilo completo: punti totali, posizione, punti per gioco.

✅
- Test con dati finti (es. 200 giocatori generati): normalizzazione corretta, record = 1000, pari merito risolti come da specifiche.
- Classifica leggibile e aggiornata ogni ~60 s.

🚫 Oggetti segreti, staff.

---

## Tappa 7 — Oggetti segreti (rimandata, D70)

🎯 5 adesivi da trovare, +100 punti l'uno.

🔨
- Migrazioni `secrets`, `secret_claims`, vista `secrets_public`; RPC `claim_secret`.
- Scanner QR integrato (API `BarcodeDetector` dove disponibile, altrimenti libreria leggera tipo `jsQR`), con richiesta permesso fotocamera spiegata in modo semplice.
- Rotta `#/segreto/<code>` per le scansioni fatte con la fotocamera del telefono (login prima, se serve, poi riscatto).
- Griglia dei 5 oggetti con stato "Trovato!"; animazione di festa.
- I punti segreti entrano nella classifica.

✅
- Scansione dall'app e dalla fotocamera del telefono funzionano entrambe.
- Stesso oggetto due volte → nessun punto in più.
- I codici non compaiono nel codice del sito.

🚫 Pannello staff.

---

## Tappa 8 — Pannello staff

🎯 Gli organizzatori gestiscono la sagra dal telefono.

🔨
- Rotta `#/staff`, accesso solo `role = 'staff'`.
- Ritiro premi (scansione QR personale, "Premio consegnato").
- Impostazioni (tentativi al giorno, ora del reset, chiusura dei giochi, giochi accesi/spenti).
- Giocatori: ricerca, reset PIN (Edge Function), disattiva account, vista impronte sospette, approvazione/scarto dei punteggi `flagged`.
- Oggetti segreti: pagina stampabile degli adesivi con QR, conteggio ritrovamenti.
- Classifica completa ed export CSV.

✅
- Un giocatore normale non vede né usa nessuna funzione staff (verificato anche chiamando le RPC a mano).
- Flusso premio completo provato su due telefoni.

---

## ~~Tappa 9 — Selfie~~ (cancellata per privacy e GDPR, D69)

🎯 Funzione pronta, spenta di default.

🔨
- Passo selfie nella registrazione (fotocamera frontale, niente galleria), consenso separato, compressione sul telefono.
- Bucket privato + policy; visualizzazione solo nel pannello staff al ritiro premi.
- Aggiunta del selfie dal Profilo per chi si è registrato prima dell'attivazione.
- "Cancella tutti i selfie" per lo staff.

✅
- Con `selfie_enabled` OFF il passo non compare.
- Con ON, il selfie non è accessibile da un altro giocatore (provato con l'URL diretto).

---

## Tappa 10 — Contenuti veri, rifinitura e prove generali

🎯 Pronti per la sagra.

🔨
- Caricare menù, domande del quiz (40–60), foto del memory, nomi/immagini dei 5 oggetti segreti, testi definitivi dell'informativa.
- Tarare difficoltà e durate dopo le prove con persone reali.
- Test su più telefoni (Android economico, iPhone, schermo piccolo), rete lenta, modalità aereo.
- Test di carico leggero (es. 300 registrazioni e partite simulate).
- Stampa: QR principale per tavoli/stand, adesivi degli oggetti segreti.
- Checklist del giorno prima: Supabase attivo (non in pausa), date dei giochi corrette, account staff funzionanti, classifica azzerata dai dati di prova.

✅
- Prova generale completa con 5–10 persone che simulano le due serate (anche accelerando le finestre orarie).

---

## Tappa futura (opzionale) — Contest foto

Solo se richiesto: caricamento di N foto con consenso, moderazione staff prima della pubblicazione, "mi piace" (uno per account per foto), le 3 foto più votate in alto, proiezione nella serata finale.
