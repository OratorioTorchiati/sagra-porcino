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
| `npm run preview` | Serve `app/dist/` in locale per controllare la build: http://localhost:4173/sagra-porcino/ |

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

## Struttura del frontend

```
app/
├── index.html
├── vite.config.js        # percorso base per GitHub Pages
├── public/               # file copiati così come sono (favicon)
└── src/
    ├── main.js           # elenco delle pagine e avvio del router
    ├── router.js         # router a hash (#/menu, #/giochi/:id ...)
    ├── config.js         # nome dell'evento e altri testi generali
    ├── pages/            # una funzione per pagina → { title, element }
    ├── games/            # (dalla Tappa 2)
    ├── lib/              # utilità (dom, e poi device id, coda offline...)
    ├── assets/           # illustrazioni SVG e font (con licenze)
    └── styles/           # tokens.css (variabili), base.css, components.css, fonts.css
```

## Font

Inclusi nell'app, solo caratteri latini (~70 KB in tutto), licenza SIL OFL 1.1:

- **Atkinson Hyperlegible Next** (testi): https://github.com/googlefonts/atkinson-hyperlegible-next
- **Fraunces** (titoli): https://github.com/undercasetype/Fraunces
