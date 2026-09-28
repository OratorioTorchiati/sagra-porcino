# Sviluppo — guida tecnica

## Indirizzi

- **Sito pubblicato**: https://oratoriotorchiati.github.io/sagra-porcino/
- **Repository**: https://github.com/OratorioTorchiati/sagra-porcino

## Node.js (portatile, nessuna installazione)

Node non è installato nel sistema: si usa la versione portatile ufficiale estratta in

```
C:\Users\g.giaquinto\tools\node-v24.21.0-win-x64
```

Per usarla in un terminale PowerShell, aggiungerla al `PATH` **solo per quella finestra**:

```powershell
$env:Path = "C:\Users\g.giaquinto\tools\node-v24.21.0-win-x64;$env:Path"
node -v   # deve rispondere v24.x
```

Per aggiornarla: scaricare il nuovo zip `node-vXX-win-x64.zip` da https://nodejs.org/dist/, estrarlo in `tools\` e aggiornare il percorso qui e in `.claude/launch.json` (nella cartella superiore). Per toglierla: cancellare la cartella.

## Comandi (dalla cartella `app/`)

| Comando | A cosa serve |
|---|---|
| `npm install` | Scarica le dipendenze (la prima volta o dopo un aggiornamento di `package.json`). |
| `npm run dev` | Avvia il sito in locale su http://localhost:5173 con ricarica automatica. |
| `npm run dev -- --host` | Come sopra, ma raggiungibile anche dal telefono sulla stessa rete Wi-Fi: aprire sul telefono l'indirizzo "Network" mostrato nel terminale (es. `http://192.168.1.20:5173`). |
| `npm run build` | Crea la versione di produzione in `app/dist/` (con percorso base `/sagra-porcino/`). |
| `npm run preview` | Serve `app/dist/` in locale per controllare la build: http://localhost:4173/sagra-porcino/ (qui il service worker è attivo, in `npm run dev` no). |
| `npm test` | Test automatici (Vitest). Girano anche nel deploy: se falliscono, il sito non viene aggiornato. |
| `npm run test:db` | Prova il database Supabase vero (serve `app/.env.local`, vedi `docs/SUPABASE.md`). |
| `npm run qr` | Rigenera il QR code del sito in `stampa/qr-sito.svg` (per la tipografia) e `stampa/qr-sito.png`. |

## Menù

- Si modifica **solo** `contenuti/menu.csv` (con Excel, salvando come "CSV UTF-8"): in cima al file c'è il promemoria delle colonne.
- Il plugin `app/scripts/menu-plugin.js` lo converte durante la build (e in `npm run dev`, dove salvando il CSV la pagina si ricarica). Il menù finisce dentro l'app: si legge offline.
- Se il CSV ha errori (prezzo non valido, piatto senza nome, simbolo sconosciuto...) la build **si ferma** con l'elenco delle righe da correggere: il sito resta alla versione precedente. Simboli ammessi: `porcini`, `vegetariano`, `piccante`.
- Per pubblicare una correzione: modificare il CSV, commit e push. I telefoni prendono la versione nuova da soli (vedi sotto).

## Offline e aggiornamenti (service worker)

- Alla prima visita il service worker (`vite-plugin-pwa`) salva in cache tutto il sito (~95 KB): dalle visite successive l'app si apre anche senza rete.
- Quando viene pubblicata una versione nuova, il telefono la scarica in background (all'apertura, quando si torna sull'app, e ogni 30 minuti) e la applica ricaricando la pagina:
  - subito, se l'utente non ha ancora toccato né fatto scorrere niente (anche se la versione nuova arriva tardi per la rete lenta);
  - altrimenti al primo cambio di pagina, per non interrompere chi sta leggendo;
  - mai durante una partita (`setUpdateBlocked()` in `src/lib/app-update.js`, dalla Tappa 2).
- Per provare l'offline in locale: `npm run build`, `npm run preview`, aprire la pagina, fermare il server e ricaricare.

## Deploy

Automatico: **ogni push sul branch `main`** avvia il workflow `.github/workflows/deploy.yml`, che esegue `npm ci` e `npm run build` in `app/` e pubblica `app/dist` su GitHub Pages. Dopo 1–2 minuti il sito è aggiornato.

- Stato dei deploy: tab **Actions** del repository, oppure `gh run list`.
- Per rilanciare un deploy senza modifiche: Actions → "Deploy su GitHub Pages" → **Run workflow** (oppure `gh workflow run deploy.yml`).
- Se il nome del repository cambia, aggiornare `REPO_NAME` in `app/vite.config.js`.

## Come è stato creato il repository (per rifarlo da zero)

1. Su GitHub, nell'organizzazione **OratorioTorchiati** (gratuita, creata da https://github.com/organizations/plan): nuovo repository **pubblico** `sagra-porcino`, senza README (oppure `gh repo create OratorioTorchiati/sagra-porcino --public --source . --push` dalla cartella del progetto).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions** (oppure `gh api -X POST repos/OratorioTorchiati/sagra-porcino/pages -f build_type=workflow`).
3. Push su `main`: parte il primo deploy.

## Git

- Email dei commit: **solo** quella personale, impostata nel repository (`git config user.email`), mai quella di lavoro.
- Fine riga LF per tutti i file (`.gitattributes`).
- Commit piccoli, messaggi in italiano.

## Giochi

- Elenco in `app/src/games/registry.js`; ogni gioco ha la sua cartella con `config.js` (tutti i numeri da tarare), la logica, i disegni e i test.
- Motore comune in `app/src/games/engine/session.js`: HUD, conto alla rovescia, ciclo di gioco, pausa quando la pagina va in background, registro delle azioni. Durante la partita gli aggiornamenti dell'app sono bloccati.
- Il tempo di gioco avanza solo mentre si gioca e al massimo di 50 ms per frame: su un telefono lentissimo il gioco rallenta invece di "saltare".
- **Registro delle azioni** (D33), inviato al server dalla Tappa 5: lista di righe `[ms, tipo, ...dati]`, con `ms` = tempo di gioco. Per tutti: `start`, `pause`, `resume` (quiz: `hidden`/`visible` quando si esce e si torna nell'app).
  - Acchiappa: `[ms, 'tap', x, y, esito, tipo_elemento, età_elemento_ms, dimensione, distanza_dal_centro]`, esito `good`/`bad`/`none`.
  - Porcini che cadono: `[ms, 'pos', x_cestino]` (ogni 250 ms se cambia), `[ms, 'catch', tipo, x_elemento, x_cestino]`, `[ms, 'miss', tipo, x]`.
  - Memory: `[ms, 'flip', indice_carta, id_carta, esito]`, esito `first`/`match`/`mismatch`.
  - Quiz: `[ms, 'answer', id_domanda, indice_originale_scelto | null, ms_impiegati]` (null = tempo scaduto).
- Giochi HTML (quiz, memory): `canvas: false` nel modulo; il motore passa un elemento `dom`. Il quiz ha `pauseOnHide: false` (D43).
- Disegni in comune tra giochi (porcini) in `app/src/games/shared/`; sfondo morbido in `engine/background.js`.
- In sviluppo (`npm run dev`) la sessione in corso è in `window.__gameSession`, per far avanzare i frame dai test nel browser; nella build non esiste.

## Struttura del frontend

```
app/
├── index.html
├── vite.config.js        # percorso base per GitHub Pages, plugin menù e service worker
├── scripts/              # menù da CSV (con test), generazione QR code
├── public/               # file copiati così come sono (favicon)
└── src/
    ├── main.js           # elenco delle pagine e avvio del router
    ├── router.js         # router a hash (#/menu, #/giochi/:id ...)
    ├── config.js         # nome dell'evento e altri testi generali
    ├── pages/            # una funzione per pagina → { title, element }
    ├── components/       # pezzi riutilizzati (barra in alto, bottone profilo)
    ├── games/            # (dalla Tappa 2)
    ├── lib/              # utilità (dom, e poi device id, coda offline...)
    ├── assets/           # illustrazioni SVG e font (con licenze)
    └── styles/           # tokens.css (variabili), base.css, components.css, fonts.css
```

## Font

Inclusi nell'app, solo caratteri latini (~70 KB in tutto), licenza SIL OFL 1.1:

- **Atkinson Hyperlegible Next** (testi): https://github.com/googlefonts/atkinson-hyperlegible-next
- **Fraunces** (titoli): https://github.com/undercasetype/Fraunces
