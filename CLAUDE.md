# CLAUDE.md — Istruzioni per Claude Code

Leggi questo file per primo, a ogni sessione.

## Il progetto in una frase

Web app per smartphone per la **Sagra del Porcino** del paese, raggiungibile da un **QR code** esposto ai tavoli e agli stand. Contiene il **menù** e una sezione **minigiochi** con classifica: i primi 10 vincono un gadget alla fine della sagra.

## Documenti da leggere (in ordine)

1. `docs/01-SPECIFICHE.md`: cosa deve fare l'app (schermate, regole, account, punteggi)
2. `docs/02-ARCHITETTURA.md`: stack, database, sicurezza, offline
3. `docs/03-GIOCHI.md`: specifiche dettagliate dei 4 minigiochi
4. `docs/04-ROADMAP.md`: **le tappe di lavoro**. Si lavora una tappa alla volta.
5. `docs/05-DECISIONI.md`: decisioni prese, questioni aperte e registro dei progressi

Se qualcosa nei documenti è in conflitto: `05-DECISIONI.md` vince su tutto, poi `01-SPECIFICHE.md`.

## Come lavorare

- **Una tappa alla volta.** Prima di iniziare, individua in `docs/05-DECISIONI.md` (sezione "Registro progressi") l'ultima tappa completata e proponi la successiva della roadmap.
- All'inizio di ogni tappa, riassumi in breve cosa farai e chiedi conferma all'utente se ci sono punti ambigui. **Non inventare requisiti**: se manca un'informazione, chiedi o usa un valore configurabile e segnalalo.
- Alla fine di ogni tappa:
  1. verifica i **criteri di accettazione** della tappa, uno per uno;
  2. spiega all'utente come provare la tappa sul telefono;
  3. aggiorna il "Registro progressi" in `docs/05-DECISIONI.md`;
  4. **fermati** e aspetta il via libera prima della tappa successiva.
- Non anticipare lavoro delle tappe successive, a meno che non serva a non dover rifare codice.
- Se l'utente prende una nuova decisione durante il lavoro, registrala in `docs/05-DECISIONI.md`.
- Fai commit piccoli e frequenti, con messaggi chiari in italiano.

## Regole tecniche non negoziabili

- **Costo zero**: GitHub Pages (frontend statico) + Supabase piano Free (backend). Nessun altro servizio a pagamento.
- **Il server decide**: tentativi, punteggi, classifica, oggetti segreti e account sono validati su Supabase tramite funzioni RPC. Il client non scrive mai direttamente nelle tabelle di gioco (Row Level Security attiva ovunque).
- **Niente segreti nel repository** (il repo è pubblico): risposte del quiz, codici degli oggetti segreti e chiavi `service_role` non devono mai finire nel codice frontend. La chiave `anon` di Supabase invece è pubblica per definizione, quindi va bene.
- **Ora del server**, mai quella del telefono, per decidere quali giochi sono aperti.
- **Offline first**: i giochi devono funzionare con segnale debole. Serve la rete solo per registrazione/login, avvio di un tentativo, invio del punteggio (con coda di reinvio), scansione degli oggetti segreti e classifica.
- **Utenti di tutte le età**: testi grandi (min 18px), bottoni grandi (min 56px di altezza, bersagli touch min 48px), alto contrasto, frasi brevi, niente gergo.
- **Lingua**: interfaccia in italiano. Codice (nomi di variabili, funzioni, tabelle) in inglese. Commenti in italiano o inglese, ma coerenti.
- **Mobile first**: progettato per telefoni in verticale (360–430px di larghezza). Su desktop basta che sia usabile, centrato.
- **Grafica originale**: tutte le illustrazioni (funghi, personaggi, oggetti) disegnate da zero in SVG/Canvas. Niente immagini prese dal web, niente personaggi o marchi esistenti.

## Stack

- Frontend: **Vite + JavaScript vanilla** (ES modules), nessun framework. Giochi su `<canvas>`.
- Router: basato su hash (`#/menu`, `#/giochi`...), perché GitHub Pages non gestisce le route SPA.
- PWA: service worker con precache di tutti gli asset (`vite-plugin-pwa`).
- Backend: **Supabase** (Postgres + Auth + Storage + RPC in PL/pgSQL). SQL versionato in `supabase/migrations/`.
- Deploy: GitHub Actions → GitHub Pages.

Dettagli in `docs/02-ARCHITETTURA.md`.

## Struttura cartelle prevista

```
sagra-porcino/
├── CLAUDE.md
├── README.md
├── docs/                 # specifiche (questa cartella)
├── contenuti/            # dati forniti dagli organizzatori (menù, domande quiz, foto memory)
├── app/                  # progetto Vite (frontend)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.js
│       ├── router.js
│       ├── pages/        # home, menu, giochi, profilo, staff...
│       ├── games/        # un modulo per gioco + motore comune
│       ├── lib/          # supabase client, device id, coda offline...
│       └── styles/
└── supabase/
    ├── migrations/       # schema, RLS, funzioni RPC
    └── seed/             # dati di prova
```
