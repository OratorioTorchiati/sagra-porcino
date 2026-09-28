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

## Questioni aperte

Valori di default già scelti, in modo che il lavoro non si blocchi. Da confermare con gli organizzatori.

| # | Domanda | Default attuale |
|---|---|---|
| Q1 | Date e orari delle due serate? | Configurabili nella tabella `games`; valori di prova. |
| Q2 | I giochi della 1ª sera restano giocabili anche la 2ª sera? | **No**: ogni gioco solo nella sua serata. Svantaggio: chi arriva solo la 2ª sera parte da metà punti. Alternativa: tenerli aperti entrambe le sere (basta cambiare le finestre). |
| Q3 | Durata di "Acchiappa il porcino": 60 o 90 secondi? | 60 s. Da tarare nei test. |
| Q4 | Quiz: mostrare le soluzioni a fine partita? | No (evita il passaparola delle risposte). |
| Q5 | Allergeni nel menù? | Campo facoltativo previsto, da compilare se forniti. |
| Q6 | Se il selfie viene attivato a sagra iniziata, è obbligatorio per ritirare il premio? | Da decidere. Default: no, basta il login davanti allo staff. |
| Q7 | Nome e ruolo del **titolare del trattamento** per l'informativa privacy; dopo quanti giorni si cancellano i dati? | Segnaposto "Associazione organizzatrice"; cancellazione entro 30 giorni. |
| Q8 | Nome ufficiale della sagra e del paese (per titoli e grafica)? | "Sagra del Porcino". |
| Q9 | Il personaggio si può cambiare dopo la registrazione? | No. |
| Q10 | Dominio personalizzato? | No, URL di GitHub Pages. |

## Registro progressi

Aggiungere una riga a fine di ogni tappa.

| Tappa | Stato | Data | Note |
|---|---|---|---|
| — | Specifiche scritte | 2026-09-28 | Pronto per iniziare la Tappa 0. |
