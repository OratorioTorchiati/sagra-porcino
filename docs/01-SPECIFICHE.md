# 01 — Specifiche funzionali

## 1. Contesto

- **Evento**: Sagra del Porcino del paese. Dura **2 serate** (date da configurare).
- **Pubblico**: tutte le età (bambini, famiglie, ragazzi, anziani). Molti poco pratici di tecnologia.
- **Connessione**: in piazza il segnale può essere scarso. L'app deve caricarsi in fretta e far giocare anche offline.
- **Accesso**: un QR code stampato (tavoli, stand, cartelloni) apre la home dell'app.
- **Effetto sorpresa**: i minigiochi non vengono annunciati prima. Si assume che la prima sera nessuno sia organizzato per imbrogliare; l'anti-furbetti è quindi proporzionato (vedi §6).
- **Premi**: gadget simbolici ai **primi 10** della classifica finale, consegnati la seconda sera.

## 2. Mappa delle schermate

```
Home
├── 🍽️ Menù                          (libero, senza account)
├── 🍄 Minigiochi
│   ├── Box "Come funziona"
│   ├── 4 giochi (2 aperti, 2 bloccati / chiusi)
│   │   └── Regole del gioco → conferma tentativo → Gioco → Risultato
│   ├── 📷 Scansiona oggetto segreto  + griglia dei 5 oggetti
│   └── 🏆 Classifica
├── 👤 Il mio profilo
│   ├── (se non loggato) Registrati / Accedi
│   └── (se loggato) personaggio, nickname, punti, posizione, oggetti trovati, QR per il premio, Esci
└── 🔒 Staff (non linkato in home, accessibile da #/staff)
```

## 3. Home

Tre box grandi e chiari, uno sotto l'altro, con icona, titolo e **una riga** di descrizione:

| Box | Descrizione (testo indicativo) |
|---|---|
| 🍽️ **MENÙ** | Guarda i piatti e i prezzi |
| 🍄 **MINIGIOCHI** | Gioca, fai punti e vinci un premio! |
| 👤 **IL MIO PROFILO** | I tuoi punti e il codice per il premio |

In alto: titolo della sagra e un'illustrazione a tema porcino (leggera). Nient'altro: la home deve essere leggibile in 3 secondi.

## 4. Menù

- Consultabile **senza account** e **offline** (dati inclusi nell'app).
- Dati in un file `menu.json` modificabile senza toccare il codice (formato in `contenuti/README.md`).
- Struttura: categorie (Antipasti, Primi, Secondi, Contorni, Dolci, Bevande...) → piatti con nome, descrizione breve (facoltativa), prezzo, simboli facoltativi (es. 🍄 contiene porcini, 🌱 vegetariano). Allergeni: campo facoltativo (vedi questioni aperte).
- Layout a lista semplice, categorie come intestazioni fisse o come "salti rapidi" in alto.

## 5. Account

### 5.1 Registrazione

Si chiede alla prima volta che l'utente vuole giocare (o dal Profilo). Passi, **tutti in una schermata** se possibile:

1. **Personaggio**: ne viene proposto uno **a caso già selezionato**; frecce o griglia per cambiarlo. Galleria di 8–12 personaggi originali a tema bosco (elenco in §9).
2. **Nickname**: 3–16 caratteri, lettere/numeri/underscore, unico (senza distinzione maiuscole/minuscole), filtro base per parolacce.
3. **PIN a 5 cifre** (D82: prima 4; niente PIN troppo semplici), da scrivere due volte. Messaggio: "Ricordalo: ti serve per ritirare il premio".
4. **Selfie**: **solo se l'impostazione staff `selfie_enabled` è attiva** (default: disattivata). Vedi §8.
5. Due caselle obbligatorie:
   - "Ho letto l'informativa privacy" (link a una pagina semplice);
   - "Ho almeno 14 anni, oppure ho il permesso di un genitore".
6. Bottone **INIZIA A GIOCARE**.

Il personaggio si sceglie solo in fase di registrazione (non modificabile dopo, salvo decisione diversa).

### 5.2 Accesso

- Nickname + PIN. Serve se l'utente ha cambiato browser, ha cancellato i dati o torna la seconda sera e la sessione è scaduta.
- La sessione deve restare attiva a lungo (almeno per tutta la durata della sagra) per non far rifare il login.
- PIN dimenticato: **nessun recupero automatico**. Si va allo stand e lo staff lo reimposta (vedi pannello staff).

### 5.3 Un account per dispositivo

- Alla prima apertura il browser genera un **ID dispositivo** casuale, salvato in più posti (localStorage, IndexedDB, cookie) per sopravvivere a pulizie parziali.
- Alla registrazione il server lega l'ID dispositivo all'account. **Se l'ID dispositivo ha già un account, la registrazione viene rifiutata** con il messaggio: "Da questo telefono è già stato creato un account (nickname: Mar\*\*\*). Accedi con quello."
- L'accesso a un account esistente da un altro dispositivo è consentito (serve il PIN).
- Viene anche registrata un'**impronta tecnica** del dispositivo (modello/user agent, schermo, lingua, fuso orario). **Non blocca** (molti telefoni dello stesso modello hanno impronte identiche): serve solo allo staff per individuare casi sospetti.

## 6. Minigiochi

### 6.1 Calendario

| Serata | Giochi aperti |
|---|---|
| 1ª sera | 🍄 **Acchiappa il porcino** · ❓ **Quiz del paese** |
| 2ª sera | 🧺 **Porcini che cadono** · 🃏 **Memory del paese** |

- Ogni gioco ha una **finestra di apertura** (`opens_at`, `closes_at`) salvata nel database e modificabile dallo staff. **L'ora usata è quella del server.**
- Il cambio di gioco la seconda sera è quindi automatico.
- Stati di un gioco nella lista:
  - **Aperto**: si può giocare.
  - **Bloccato, apre più tardi**: "🔒 Disponibile domani" (o "Apre alle 19:00" se è lo stesso giorno).
  - **Chiuso**: "Gioco concluso · Il tuo migliore: 820" (i punti restano validi).

### 6.2 Tentativi

- **2 tentativi per gioco** per account.
- **Il tentativo si conta all'avvio**, sul server: chiudere e riaprire la pagina non restituisce il tentativo.
- Per avviare un tentativo serve connessione (una chiamata leggera). Se non c'è rete: messaggio "Serve un attimo di connessione per iniziare. Riprova tra poco."
- **Vale il punteggio migliore** dei due tentativi.
- Una partita avviata e mai conclusa (app chiusa, batteria scarica) conta come tentativo con punteggio 0, salvo ciò che è già stato inviato.

### 6.3 Schermata Minigiochi

Dall'alto in basso:

1. **Box "Come funziona"** (sempre visibile, breve):
   - 2 tentativi per ogni gioco
   - Il tentativo si conta appena premi **GIOCA**
   - Vale il tuo punteggio migliore
   - Ogni sera giochi nuovi: i primi 10 in classifica vincono un premio!
2. **I 4 giochi**, come card con: icona, nome, stato, tentativi usati (es. "Tentativi: 1/2"), miglior punteggio.
3. **📷 Scansiona oggetto segreto** + griglia dei 5 oggetti (vedi §7).
4. **🏆 Classifica** (vedi §6.6).

Se l'utente non è registrato, può vedere tutto ma al tocco su un gioco o sullo scanner gli viene chiesto di registrarsi/accedere.

### 6.4 Schermata regole (prima di ogni gioco)

Al tocco su un gioco aperto si apre una schermata con le regole **molto riassunte** (3–5 righe con icone), il numero di tentativi rimasti e l'avviso esplicito:

> ⚠️ Premendo **GIOCA** usi un tentativo (ti resta 1 tentativo su 2).

Bottoni: **GIOCA** · **Indietro**. I testi delle regole per ogni gioco sono in `03-GIOCHI.md`.

### 6.5 Punteggi e normalizzazione

- Ogni gioco produce un **punteggio grezzo** (regole in `03-GIOCHI.md`).
- Per ogni giocatore e gioco conta il **miglior grezzo** tra i suoi tentativi.
- **Normalizzazione relativa al migliore**: per ogni gioco

  `punti_gioco = round( miglior_grezzo_giocatore / miglior_grezzo_assoluto_del_gioco × 1000 )`

  Chi ha il record di un gioco prende 1000; gli altri in proporzione. Così i 4 giochi pesano **esattamente uguale**. I punti si aggiornano quando qualcuno batte un record: è voluto.
- **Oggetti segreti**: 100 punti fissi ciascuno, **non normalizzati** (max 500).
- **Totale** = somma dei punti dei 4 giochi + punti oggetti segreti. Massimo teorico: 4.500.
- **Pari merito**: vince chi ha trovato più oggetti segreti; se ancora pari, chi ha raggiunto per primo quel totale (orario dell'ultimo punteggio che ha contribuito).

> Punteggio e classifica: vedi **D71** in `05-DECISIONI.md` (niente normalizzazione, primi 20, podio, live).

### 6.6 Classifica

- Dentro la tab Minigiochi.
- Mostra i **primi 10** evidenziati (posizione, personaggio, nickname, punti totali), con una linea che indica "zona premi".
- Sotto, la **riga dell'utente** con la sua posizione ("23° · Tu · 1.640"), se non è nei primi 10.
- Facoltativo: tocco su un giocatore → dettaglio punti per gioco.
- Aggiornamento: all'apertura della tab e ogni ~60 secondi se online. Offline: mostra l'ultima classifica salvata con l'orario ("aggiornata alle 21:14").
- **Mai mostrare selfie** in classifica: solo personaggio e nickname.

## 7. Oggetti segreti

- **5 oggetti** raffigurati su **adesivi** attaccati in punti della sagra. Ogni adesivo ha un'illustrazione dell'oggetto e un **QR code**.
- Nell'app, una **griglia di 5 box** mostra l'immagine (o il nome) di ciascun oggetto: il giocatore sa **cosa** cercare, ma non **dove**. Non esiste una lista delle posizioni.
- Scansione:
  - principale: bottone **📷 Scansiona oggetto segreto** con scanner integrato nell'app (fotocamera del browser);
  - alternativa: il QR contiene un link all'app (`.../#/segreto/<CODICE>`), quindi funziona anche con la fotocamera del telefono. Se l'utente non è loggato, prima accede e poi il codice viene riscattato.
- Valore: **+100 punti** per oggetto, **una volta per account**, valido **per entrambe le serate** (i codici non cambiano).
- Dopo la scansione: animazione di festa con il personaggio e scritta **✅ Trovato! +100 punti**. Il box dell'oggetto diventa verde con "Trovato!".
- Codice già usato da quell'account: "L'avevi già trovato 😉". Codice non valido: "Questo QR non è un oggetto segreto".
- I codici veri sono stringhe casuali salvate **solo nel database**.

## 8. ~~Selfie~~ — tolto per privacy e GDPR (D69): quanto segue non si fa

- Impostazione staff `selfie_enabled`, **default OFF**. Da valutare più avanti.
- Se ON:
  - alla registrazione si scatta un selfie con la fotocamera frontale (niente galleria), con consenso esplicito separato;
  - la foto viene ridotta sul telefono (circa 400px, JPEG compresso) prima dell'invio;
  - è salvata in uno spazio **privato**, visibile **solo allo staff** (al ritiro del premio);
  - viene **cancellata a fine sagra** (funzione staff "Cancella tutti i selfie" + promemoria);
  - gli utenti già registrati prima dell'attivazione possono aggiungerla dal Profilo (se servirà per il premio: vedi questioni aperte).
- Se OFF: il passaggio non compare affatto.

## 9. Personaggi

Galleria di 8–12 personaggi **originali**, disegnati in SVG, semplici e riconoscibili anche a 32px. Proposta:

Porcino classico · Porcino con cappello da montagna · Porcino nero · Castagna · Scoiattolo · Riccio · Cinghialotto · Foglia d'autunno · Abetino · Gufetto · Cestino di funghi · Lumachina

Appaiono in: classifica, profilo, schermata "Trovato!", schermata di fine partita.

## 10. Profilo

- Personaggio grande + nickname.
- **Punti totali** e **posizione** in classifica.
- Dettaglio: punti per ciascun gioco e oggetti trovati (x/5).
- **QR personale per il premio**: contiene un token del giocatore; lo staff lo scansiona per verificare l'identità. Sotto il QR, il nickname in grande.
- Bottone **Esci** (con avviso: "Per rientrare ti serviranno nickname e PIN").
- Se non loggato: bottoni **Registrati** e **Ho già un account**.

## 11. Pannello staff (`#/staff`)

Accesso con un account staff (ruolo impostato a mano nel database). Funzioni:

1. **Ritiro premi**: scansiona il QR personale del giocatore → mostra personaggio, nickname, posizione, punti, (selfie se presente) → bottone "Premio consegnato" (registrato, per non consegnarlo due volte).
2. **Impostazioni**: `selfie_enabled` ON/OFF; finestre orarie dei giochi; eventuale blocco generale dei giochi.
3. **Giocatori**: cerca per nickname; reimposta PIN; disattiva account (furbetti); vedi i dispositivi collegati e le impronte sospette (molti account con la stessa impronta).
4. **Oggetti segreti**: elenco dei 5 oggetti con il QR da stampare (pagina stampabile in formato adesivo) e quante volte è stato trovato ciascuno.
5. **Classifica completa** (tutte le posizioni) ed esportazione CSV.
6. **Privacy**: "Cancella tutti i selfie" (con doppia conferma).

## 12. Privacy (minimo indispensabile)

- Pagina "Informativa" breve e comprensibile: quali dati (nickname, PIN cifrato, ID dispositivo, impronta tecnica, punteggi, selfie se attivo), perché (gioco e premi), chi è il titolare (associazione/Pro Loco organizzatrice, da definire), per quanto tempo (cancellazione entro X giorni dalla fine della sagra), come chiedere la cancellazione.
- Nessun dato di contatto richiesto (niente email, niente telefono).
- Il testo definitivo dell'informativa va verificato dagli organizzatori.

## 13. Fuori ambito (per ora)

- **Contest foto** (caricare N foto con consenso, voto con "mi piace", le 3 più votate in alto, un voto per account). Modulo **opzionale futuro**: non implementare finché non richiesto, ma non fare scelte che lo rendano difficile.
- Ordinazioni o pagamenti dal menù.
- Notifiche push.
