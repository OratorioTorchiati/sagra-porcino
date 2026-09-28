# 05 — Decisioni, questioni aperte, progressi

Questo file **ha la precedenza** sugli altri documenti. Aggiornarlo a ogni nuova decisione e a fine tappa.

## Decisioni prese

| # | Decisione | Note |
|---|---|---|
| D1 | Un unico QR apre una home con 3 box: **Menù**, **Minigiochi**, **Il mio profilo**. | Testi chiari, pubblico di tutte le età. |
| D2 | La sagra dura **2 serate**; **2 minigiochi per serata**. | 1ª: Acchiappa il porcino + Quiz. 2ª: Porcini che cadono + Memory. |
| D3 | Il cambio dei giochi è automatico, con **finestre orarie nel database** e **ora del server**. | Modificabili dallo staff. |
| D4 | **2 tentativi per gioco**; il tentativo si conta **all'avvio, sul server**. | Chiudere e riaprire non restituisce il tentativo. |
| D5 | Vale il **miglior punteggio** dei due tentativi. | |
| D6 | Punteggi **normalizzati**: ogni gioco vale 0–1000, **relativo al record** del gioco. | Nessun "punteggio obiettivo" da tarare. I giochi pesano uguale. |
| D7 | Quiz: 5 domande a risposta multipla (4 opzioni, 1 giusta) da un pool ampio, con **bonus velocità**, poi normalizzato. | Domande solo sul server. |
| D8 | **Vincono i primi 10** della classifica finale (gadget). | |
| D9 | Account con **nickname + PIN a 4 cifre** + **personaggio** (uno a caso di default, cambiabile in registrazione). | Nessuna email/telefono. |
| D10 | **Un account per dispositivo**, verificato **sul server** con un ID dispositivo salvato nel browser. | Si accetta che chi usa più telefoni o la navigazione in incognito possa aggirarlo: effetto sorpresa, premi simbolici. |
| D11 | **Nessun codice sullo scontrino**: il gioco resta separato dalla cassa. | |
| D12 | **Selfie**: funzione **attivabile/disattivabile** dallo staff, **spenta di default**. Se attiva, visibile **solo allo staff**, cancellata a fine sagra. | Da valutare più avanti. |
| D13 | **5 oggetti segreti** su adesivi con QR: +100 punti ciascuno, una volta per account, **validi per entrambe le serate**. Nell'app si vede *cosa* cercare, non *dove*. | Scanner integrato nell'app. |
| D14 | La **classifica** sta dentro la tab Minigiochi. | Solo personaggio + nickname, mai selfie. |
| D15 | Il **profilo** permette di dimostrare che l'account è tuo (login con nickname + PIN, QR personale per il ritiro premi). | |
| D16 | Giochi **offline**: la rete serve solo per iniziare un tentativo, inviare il punteggio (con coda) e poche altre azioni. | |
| D17 | **Costo zero**: GitHub Pages + Supabase Free. | |
| D18 | **Contest foto** rimandato: modulo opzionale futuro. | Idea: N foto con consenso, le 3 più votate in alto. |
| D19 | **Date**: sabato **17 ottobre 2026** (solo pomeriggio) e domenica **18 ottobre 2026** (tutto il giorno). La classifica chiude il **18 alle 23:00**. | Finestre di default: giochi del 17 dalle 15:00; giochi del 18 dalle 10:00; tutto chiude il 18 alle 23:00. |
| D20 | I giochi del 17 **restano aperti anche il 18** (supera Q2). **Configurabile**: basta cambiare le finestre orarie in `games`. | Chi arriva solo domenica può giocare a tutti e 4. |
| D21 | **Niente Supabase Auth**, né per i giocatori né per lo staff (supera `02-ARCHITETTURA.md` §3.1). Account in una tabella nostra (`players`) con PIN cifrato (bcrypt, `pgcrypto`); registrazione e accesso tramite RPC che restituiscono una **chiave di sessione** casuale (salvata sul telefono, sul server solo il suo hash). Tutte le RPC che richiedono un utente ricevono la chiave. | Motivi: niente limiti di Supabase Auth per IP (in piazza molti telefoni escono con lo stesso IP), registrazione atomica, blocco PIN reale, reset PIN senza Edge Function. Staff = `role = 'staff'` impostato a mano, con **password lunga** invece del PIN. RLS resta attiva con accesso diretto negato: tutto passa dalle RPC. |
| D22 | **Registrazione atomica**: se non va a buon fine, non viene salvato niente (nessun account orfano, nickname non prenotato). | Il controllo "nickname libero" durante la digitazione è solo informativo. |
| D23 | **Blocco PIN** dopo **10** tentativi errati per lo stesso nickname, per 15 minuti. | Più che altro simbolico: non ci si aspettano attacchi. |
| D24 | **Senza login** si vedono: menù, schermata Minigiochi (Come funziona, stato dei giochi), classifica, griglia oggetti segreti, informativa. Il login serve solo per giocare, scansionare gli adesivi, caricare immagini e vedere il proprio profilo. | Le RPC "pubbliche" funzionano senza chiave di sessione. |
| D25 | **Modalità prova**: fino alla Tappa 5 (giochi collegati al server) i giochi sul sito sono sempre in prova. Dopo, prova solo per lo staff e nelle build di sviluppo. | |
| D26 | **Punteggi con valori impossibili** (oltre il massimo teorico, dati incoerenti, durate impossibili) → esclusi automaticamente; lo staff può rimetterli. | Come gestire le partite "strane" (possibile bot) e l'invio di punteggi falsi: in discussione, vedi Q11. |
| D27 | **Menù**: l'organizzatore compila `contenuti/menu.csv` (separatore `;`, si apre con Excel). Uno script lo converte in automatico durante la build; il menù è incluso nell'app e funziona offline. | Righe che iniziano con `#` = commenti. Prima consegna anche in altri formati (PDF, foto, Word): lo trascrive Claude. |
| D28 | **Selfie** facoltativo: si fa solo se avanza tempo. Se fatto, la foto (compressa, ~40 KB) va nel database, leggibile solo dalle RPC staff. | Senza Supabase Auth le policy di Storage non si applicano. |
| D29 | **Font** inclusi nell'app (funzionano offline, nessuna richiesta a Google): **Atkinson Hyperlegible Next** per i testi (progettato per la massima leggibilità), **Fraunces** per i titoli. | Licenza OFL. |
| D30 | **Sviluppo locale** con Node.js **portatile** (nessuna installazione): `C:\Users\g.giaquinto\tools\node-v24.21.0-win-x64`. | Vedi `docs/SVILUPPO.md`. |
| D31 | **Calendario**: Tappe 0–7 entro il 12/10, pannello staff essenziale il 13–14/10, prova generale il 15–16/10. Selfie solo se avanza tempo. | |

## Questioni aperte

Valori di default già scelti, in modo che il lavoro non si blocchi. Da confermare con gli organizzatori.

| # | Domanda | Default attuale |
|---|---|---|
| Q1 | ~~Date e orari delle due serate?~~ | **Risolta** → D19. |
| Q2 | ~~I giochi della 1ª sera restano giocabili anche la 2ª sera?~~ | **Risolta** → D20 (sì, configurabile). |
| Q3 | Durata di "Acchiappa il porcino": 60 o 90 secondi? | 60 s. Da tarare nei test. |
| Q4 | Quiz: mostrare le soluzioni a fine partita? | No (evita il passaparola delle risposte). |
| Q5 | Allergeni nel menù? | Campo facoltativo previsto, da compilare se forniti. |
| Q6 | Se il selfie viene attivato a sagra iniziata, è obbligatorio per ritirare il premio? | Da decidere. Default: no, basta il login davanti allo staff. |
| Q7 | Nome e ruolo del **titolare del trattamento** per l'informativa privacy; dopo quanti giorni si cancellano i dati? | Segnaposto "Associazione organizzatrice"; cancellazione entro 30 giorni. |
| Q8 | Nome ufficiale della sagra e del paese (per titoli e grafica)? | "Sagra del Porcino". |
| Q9 | Il personaggio si può cambiare dopo la registrazione? | No. |
| Q10 | Dominio personalizzato? | No, URL di GitHub Pages. |
| Q11 | Come impedire l'invio di punteggi falsi (anche solo con gli strumenti per sviluppatori del browser) e riconoscere i bot? | Proposta: il telefono invia la **lista delle azioni** della partita e il server **rigioca la partita** (Edge Function con lo stesso codice del gioco) ricalcolando il punteggio; la stessa lista serve a riconoscere i bot. Da decidere prima della Tappa 2. |
| Q12 | QR degli oggetti segreti condivisibili (link o foto girati su WhatsApp). | L'utente sta pensando a una soluzione; se ne riparla alla Tappa 7. |
| Q13 | Punteggio del Memory: il "non completato" (50 × coppie) può superare il "completato lento" (min 200). | Da ripensare alla Tappa 3: completare deve valere sempre più che non completare. |

## Registro progressi

Aggiungere una riga a fine di ogni tappa.

| Tappa | Stato | Data | Note |
|---|---|---|---|
| — | Specifiche scritte | 2026-09-28 | Pronto per iniziare la Tappa 0. |
| 0 | Completata (da provare sul telefono) | 2026-09-28 | Sito online su https://1997giaquinto.github.io/sagra-porcino/ con deploy automatico. Home con 3 box e pagine segnaposto; verificati a 360px navigazione, tasto indietro e assenza di scroll orizzontale. Al posto dell'emoji 🍄 (sui telefoni è un fungo velenoso rosso a puntini) si usa l'illustrazione del porcino. |
