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
| D26 | **Punteggi con valori impossibili** (oltre il massimo teorico, dati incoerenti, durate impossibili) → esclusi automaticamente; lo staff può rimetterli. | Partite "strane" (possibile bot) e punteggi falsi: vedi D33. |
| D27 | **Menù**: l'organizzatore compila `contenuti/menu.csv` (separatore `;`, si apre con Excel). Uno script lo converte in automatico durante la build; il menù è incluso nell'app e funziona offline. | Righe che iniziano con `#` = commenti. Prima consegna anche in altri formati (PDF, foto, Word): lo trascrive Claude. |
| D28 | **Selfie** facoltativo: si fa solo se avanza tempo. Se fatto, la foto (compressa, ~40 KB) va nel database, leggibile solo dalle RPC staff. | Senza Supabase Auth le policy di Storage non si applicano. |
| D29 | **Font** inclusi nell'app (funzionano offline, nessuna richiesta a Google): **Atkinson Hyperlegible Next** per i testi (progettato per la massima leggibilità), **Fraunces** per i titoli. | Licenza OFL. |
| D30 | **Sviluppo locale** con Node.js **portatile** (nessuna installazione): `C:\Users\g.giaquinto\tools\node-v24.21.0-win-x64`. | Vedi `docs/SVILUPPO.md`. |
| D31 | **Calendario**: Tappe 0–7 entro il 12/10, pannello staff essenziale il 13–14/10, prova generale il 15–16/10. Selfie solo se avanza tempo. | |
| D32 | **Home con 2 box** (Menù, Minigiochi); **il profilo diventa un'icona in alto a destra, in tutte le pagine** (tranne il profilo stesso): cerchietto con personaggio anonimo e, a sinistra, la scritta "Accedi" (supera D1 e `01-SPECIFICHE.md` §3). | Dopo il login (Tappa 4) diventa il **personaggio scelto** dal giocatore con il suo **nickname**. |
| D33 | **Invio della partita** (risolve Q11): il telefono invia il punteggio calcolato **più la sequenza delle azioni** del giocatore (tocchi, mosse, risposte, con i tempi). Il server **non rigioca la partita** (niente carico sul backend): salva la sequenza e fa un insieme **prefissato di controlli** di validità e coerenza (es. punteggio ricostruibile dalle azioni, tempi di reazione umani, intervalli non troppo regolari, durata coerente). Impossibile → escluso; strano (possibile bot) → contato ma segnalato allo staff. | I controlli per ogni gioco si definiscono alla Tappa 5. Prima dei premi lo staff controlla le prime 15–20 posizioni. |
| D34 | **Quiz**: una sola chiamata a fine partita con risposte e tempi misurati dal telefono; il server calcola il punteggio. | Tempi falsificabili: si accetta (al massimo 250 punti di bonus). |
| D36 | **Aggiornamenti dell'app**: la versione nuova si applica da sola ricaricando la pagina, subito se l'utente non ha ancora toccato né fatto scorrere niente, altrimenti al primo cambio di pagina; **mai durante una partita**. | Nessun bottone "Aggiorna" da premere: il pubblico non lo farebbe. |
| D37 | **QR code principale**: nero su bianco, correzione d'errore alta (Q), in `stampa/` (SVG per la tipografia, PNG). Punta a https://oratoriotorchiati.github.io/sagra-porcino/ | Rigenerabile con `npm run qr`. |
| D38 | **Moltiplicatore di Acchiappa**: la serie indica i porcini già presi di fila; il moltiplicatore vale per il porcino successivo. Quindi i primi 5 porcini valgono 10, dal 6° si prende ×2, dall'11° ×3, dal 21° ×4. | Interpretazione della tabella di `03-GIOCHI.md` (serie 0–4 → ×1...). |
| D39 | **Equità tra partite**: in Acchiappa buoni e cattivi escono da un "mazzo" di 10 con un numero fisso di porcini, poi mescolato. Così il numero di porcini per partita varia poco da un seme all'altro (in simulazione il punteggio massimo possibile varia ~13% invece di >30%). | Stesso principio da applicare agli altri giochi. |
| D40 | Nella schermata regole si mostrano i disegni di **cosa prendere** e **cosa evitare**, **dentro il box bianco della regola** corrispondente ("Tocca i porcini", "Evita…"), non in una sezione a parte: niente ripetizioni e meno spazio. | Acchiappa e Porcini che cadono. |
| D42 | **Punteggio del Memory** (risolve Q13, confermato dall'utente): completato = `max(300, 1000 − 3 × secondi − 20 × (mosse − 8))`; non completato = `30 × coppie` (max 210). Completare vale sempre più che non completare. | Valori in `memory/config.js`. |
| D43 | **Quiz senza pausa** (confermato dall'utente): se si esce dall'app durante il quiz il tempo continua (si potrebbe cercare la risposta a tempo fermo); le uscite vengono registrate. Una sola chiamata a fine quiz (D34). | Gli altri giochi vanno in pausa. |
| D44 | **Porcini che cadono**: elementi da mazzi di 30 con 1 porcino d'oro e una quota fissa di bombe (dal 20% al 35%), per partite eque (come D39). | Valori in `cadono/config.js`. |
| D45 | Icona dei **Minigiochi**: un **gamepad** disegnato apposta (home e titolo della pagina), non più il porcino. | Il porcino resta come illustrazione della home e icona di Acchiappa. |
| D46 | **Memory**: 8 illustrazioni segnaposto (campanile, fontana, chiesa, castagno, ponte, borgo, piazza, bosco) finché non arrivano le foto vere; didascalia piccola sulla carta e **in grande sotto la griglia** quando si trova la coppia. | La didascalia sulla carta è sotto i 18px per motivi di spazio: quella grande è il riferimento. |
| D41 | **Acchiappa più difficile fin dall'inizio** (dopo la prima prova dell'utente): da subito 5 elementi a schermo (fino a 10), comparse più frequenti, più veloci e che restano meno. Circa 130 elementi a partita invece di ~97. | Valori in `acchiappa/config.js`. |
| D47 | **Porcini che cadono dura 1 minuto** (non 2, supera `03-GIOCHI.md`) e parte più difficile: cadono subito più veloci, più fitti e con più bombe (dal 27% al 37%). Bonus sopravvivenza a chi arriva alla fine del minuto. | Circa 150 elementi a partita. |
| D48 | **Memory**: **2 minuti** (non 3). Le coppie trovate restano visibili mezzo secondo e poi **spariscono verso lo sfondo** (resta il posto vuoto). Dopo un errore le due carte si rigirano e, **nello stesso momento, si scambiano di posto** con uno spostamento visibile, senza bordi colorati (più difficile: bisogna seguirle). | Scambio confermato dall'utente. Nel registro azioni: `[ms, 'swap', i, j]`. |
| D50 | **Account (Tappa 4)**: sessione valida 30 giorni; il nickname si confronta senza maiuscole; filtro parolacce di base con elenco modificabile (tabella `banned_words`, confronto "contiene": "porcino" è ammesso); un telefono è legato all'account solo alla **registrazione** (l'accesso da altri telefoni è libero con il PIN); lo staff avrà password lunga invece del PIN (Tappa 8). Le chiamate al server usano `fetch` diretto (nessuna libreria Supabase nel sito). | Setup in `docs/SUPABASE.md`. |
| D51 | **Informativa privacy** provvisoria: titolare "Associazione organizzatrice della Sagra del Porcino", cancellazione entro 30 giorni (Q7). Nella registrazione si apre in una finestra, così il modulo compilato non si perde. | Testo definitivo da verificare con gli organizzatori. |
| D49 | Il bottone **"← Indietro" segue la gerarchia delle pagine**, non la cronologia: gioco → Minigiochi → Home; Menù/Profilo → Home. Se la pagina madre è quella precedente usa il vero "indietro", altrimenti ci va direttamente. | Corregge il bug segnalato (Home > Minigiochi > Memory > Indietro > Acchiappa > Indietro > Indietro riportava al Memory). |
| D52 | **Punteggi di prova separati per giocatore**: il "migliore" delle partite di prova, salvato sul telefono, è distinto per account (e per ospite). Chi entra con il suo account non vede i punteggi fatti da altri o da ospite sullo stesso telefono. | Corregge il bug segnalato. Dalla Tappa 5 il migliore vero arriva dal server, legato all'account. |
| D53 | Le **conferme** (es. "Vuoi davvero uscire?") si mostrano in una **finestra davanti a tutto**, non in fondo alla pagina: visibili su ogni telefono senza scorrere. | |
| D54 | **Nickname senza bestemmie né insulti**, senza censurare parole innocue: regole "contiene" (porco/a, madonn, gesu, bestemm, dioca, dioporc...), "parola intera" (dio, iddio: vieta "SonoDio", ammette "Armadio", "Claudio") e "parola che inizia con" (prete, cristo: ammette "Interprete", "Cristoforo"). Le parole si separano con _, cifre e maiuscole; le cifre si leggono come lettere. Elenchi ed eccezioni nel database (migrazione 002). | Aggirabile da chi si impegna (es. "sonodio" tutto attaccato e minuscolo): lo staff potrà disattivare l'account (Tappa 8). |
| D55 | Lo **staff può cancellare** gli account con nickname offensivi (oltre a disattivare i furbetti). | Pannello staff, Tappa 8. |
| D56 | **Reset del PIN dallo staff, con verifica del telefono**: nella schermata Accedi il bottone **"Ho dimenticato il PIN"** chiede il nickname e mostra, in una finestra, il riquadro **"Mostra questo allo staff"** con il **nickname** e sotto il **codice del telefono** (prime 8 cifre dell'ID dispositivo, es. `EF27-B764`). Il codice NON compare nel Profilo: a chi ha già fatto l'accesso non serve. Nel pannello staff (Tappa 8) si cerca il giocatore, si vedono informazioni, punteggi e codici dei telefoni (quello di creazione e gli altri usati per accedere); se il codice mostrato coincide con quello di creazione, lo staff imposta un nuovo PIN. | Prova di possesso: serve avere in mano il telefono (e il browser) con cui è stato creato l'account. |
| D57 | **Niente calendario per serata** (supera D2, D3, D19 e D20 per quanto riguarda l'apertura dei giochi): **tutti e 4 i giochi sono aperti fin dalla prima sera**. | |
| D58 | **3 tentativi AL GIORNO per ogni gioco** (supera D4 "2 tentativi"), configurabili in `settings.attempts_per_day`; si rinnovano a mezzanotte (ora italiana). Il tentativo si conta all'avvio, sul server. Vale il punteggio migliore tra tutti i tentativi. Ogni giocatore vede i tentativi rimasti (card dei giochi e schermata regole). | |
| D59 | **Finestra generale** facoltativa in `settings`: `games_open_from` (vuota = già aperti; da impostare al 17/10 15:00 prima della sagra) e `games_open_until` (18/10 23:00, chiusura della classifica). Ogni gioco ha un interruttore `enabled` per spegnerlo in caso di problemi. | Serve per chiudere la classifica e consegnare i premi. |
| D60 | **Staff senza limiti**: tentativi illimitati, anche fuori finestra o con gioco spento; i suoi punteggi non vanno in classifica. | |
| D61 | **Controlli del server** (applicazione di D33): punteggio ricalcolato dalla sequenza delle azioni (deve coincidere), tempo di gioco non superiore al tempo reale dall'avvio, durata massima, invio entro 6 ore → altrimenti **escluso**. Segnali da bot → **contato ma segnalato**: Acchiappa reazioni < 150 ms su oltre il 20% dei porcini o tocchi troppo regolari; Porcini che cadono prese troppo precise; Memory perfetto in 8 mosse; Quiz tutte le risposte sotto 0,8 s. Il quiz lo calcola solo il server. L'invio del punteggio richiede solo l'id del tentativo (casuale), così arriva anche se nel frattempo si è usciti dall'account. | Motivi salvati in `attempts.check_notes` per lo staff. |
| D62 | Nomi dei giochi: **"Quiz"** (non "Quiz del paese") e **"Memory Torchiati"** (non "Memory del paese"). Nelle card dei Minigiochi i titoli sono più piccoli (19px) e non in maiuscolo: tutti su una riga anche a 360px. | |
| D35 | Il repository e il sito appartengono all'**organizzazione GitHub `OratorioTorchiati`** (gratuita), così l'indirizzo non mostra l'account personale: **https://oratoriotorchiati.github.io/sagra-porcino/**. | La radice `oratoriotorchiati.github.io` resta libera per futuri progetti dell'oratorio. |

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
| Q11 | ~~Come impedire l'invio di punteggi falsi e riconoscere i bot?~~ | **Risolta** → D33, D34. |
| Q12 | QR degli oggetti segreti condivisibili (link o foto girati su WhatsApp). | L'utente sta pensando a una soluzione; se ne riparla alla Tappa 7. |
| Q15 | ~~PIN dimenticato: come verificare il vero proprietario?~~ | **Risolta** → D56. |
| Q14 | Indirizzo sul dominio dell'oratorio (es. `sagra.oratoriotorchiati.it`) senza toccare il sito esistente: basta un record CNAME nel pannello DNS del dominio. | Rimandato. Da decidere: nome del sottodominio e chi ha accesso al pannello DNS. Se si fa, va rigenerato il QR (prima di stamparlo). |
| Q13 | ~~Punteggio del Memory~~ | **Risolta** → D42. |

## Registro progressi

Aggiungere una riga a fine di ogni tappa.

| Tappa | Stato | Data | Note |
|---|---|---|---|
| — | Specifiche scritte | 2026-09-28 | Pronto per iniziare la Tappa 0. |
| 0 | Completata (da provare sul telefono) | 2026-09-28 | Sito online su https://oratoriotorchiati.github.io/sagra-porcino/ con deploy automatico. Home con 3 box e pagine segnaposto; verificati a 360px navigazione, tasto indietro e assenza di scroll orizzontale. Al posto dell'emoji 🍄 (sui telefoni è un fungo velenoso rosso a puntini) si usa l'illustrazione del porcino. |
| 0 (ritocchi) | Completata | 2026-09-28 | Sito spostato nell'organizzazione OratorioTorchiati; profilo come bottone "Accedi" in alto a destra in tutte le pagine; home con 2 box. |
| 1 | Completata (da provare sul telefono) | 2026-09-28 | Menù da `contenuti/menu.csv` (dati di esempio, da sostituire), con salti rapidi per categoria, simboli e allergeni; errori nel CSV bloccano la build. Offline verificato (server spento → home e menù si aprono). Aggiornamento verificato in entrambi i casi (app appena aperta → subito; app aperta → al cambio pagina). QR di prova in `stampa/`. 10 test automatici, eseguiti anche nel deploy. |
| 2 | Completata (da provare sul telefono e con 2–3 persone) | 2026-09-28 | Motore comune (regole, 3-2-1, HUD, pausa automatica, fine partita, seme, registro azioni) e "Acchiappa il porcino" in modalità prova. 12 disegni originali (porcini a gambo tozzo, velenosi a gambo sottile con anello). 32 test automatici, di cui 7 simulano partite intere. Fluidità a 60 fps da verificare sul telefono (il browser di sviluppo in background rallenta le animazioni). |
| 2 (ritocchi) | Completata | 2026-09-28 | Acchiappa più difficile fin dall'inizio (D41). |
| 3 | Completata (da provare sul telefono) | 2026-09-28 | Porcini che cadono, Memory del paese (illustrazioni segnaposto), Quiz (15 domande di esempio, solo in prova). Minigiochi con le 4 card, icona gamepad. Immagini delle regole dentro i box. Motore esteso ai giochi HTML (quiz, memory). 54 test automatici (simulazioni di partite intere per Acchiappa e Porcini che cadono). |
| 4 | Completata (da provare sul telefono) | 2026-09-28 | Progetto Supabase `fgvpsupzeoizbflwrchn` (Frankfurt) con migrazione 001. Registrazione, accesso, profilo, esci, informativa provvisoria; 12 personaggi. Verificati sul database vero 24/24 controlli (`npm run test:db`): tabelle non leggibili né scrivibili dal client, stesso telefono → secondo account rifiutato, nickname duplicato (maiuscole diverse) rifiutato, accesso da altro telefono con PIN, blocco dopo 10 PIN errati, sessione che sopravvive alla ricarica. Account di prova `zz…` da cancellare prima della sagra (`docs/SUPABASE.md` §5). |
| 5 | Completata (da provare sul telefono) | 2026-09-28 | Migrazione 003 applicata. 3 tentativi al giorno per gioco contati all'avvio, giochi aperti dalla prima sera, staff senza limiti, controlli del server sulle azioni, quiz dal database. Verificati sul database vero 41/41 controlli (4° tentativo rifiutato, punteggio inventato escluso, Memory coerente valido, Memory perfetto segnalato, quiz senza risposte e ricalcolato, niente doppioni). Nel browser: partita salvata, partita senza rete inviata al ritorno della connessione, uscita a metà partita = tentativo consumato, "tentativi finiti per oggi". 75 test automatici. |
| 4 (ritocchi) | Completata | 2026-09-28 | Migrazione 002 applicata: filtro bestemmie e insulti (D54), verificato sul database vero (26/26 controlli: 17 nickname vietati rifiutati, 14 innocui come Armadio e Claudio ammessi). Punteggi di prova separati per giocatore (D52), conferma di uscita in finestra (D53), "Ho dimenticato il PIN" con codice del telefono (D56). |
| 3 (ritocchi) | Completata | 2026-09-28 | Porcini che cadono 1 minuto e più difficile (D47); Memory 2 minuti, coppie che spariscono, scambio dopo errore (D48); bottone Indietro gerarchico (D49); bomba tolta dalle immagini delle regole. 61 test. |
