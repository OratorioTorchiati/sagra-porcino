# 03 — I minigiochi

Regole comuni a tutti i giochi:

- Area di gioco a tutto schermo in verticale, con HUD in alto (punti, tempo, e vite/moltiplicatore dove servono).
- Prima di iniziare: schermata regole → conferma tentativo → conto alla rovescia **3, 2, 1, VIA!**
- A fine partita: punteggio grezzo, "Il tuo migliore", stato di invio (✅ salvato / ⏳ in attesa di rete), tentativi rimasti, bottoni **Rigioca** (se c'è ancora un tentativo) e **Torna ai giochi**.
- Tutti i valori numerici qui sotto (durate, velocità, punti) vanno in un **file di configurazione per gioco**, per poterli ritoccare dopo i test senza cambiare la logica.
- Ogni partita usa il `seed` restituito dal server per il generatore casuale (utile per riprodurre e controllare le partite).
- **Modalità prova** (solo sviluppo / staff): ogni gioco giocabile senza account e senza consumare tentativi, attivabile con `?prova=1` solo in build di sviluppo o per gli account staff.

---

## 🍄 Gioco 1 — Acchiappa il porcino (1ª sera)

### Regole mostrate al giocatore
> ⏱️ 1 minuto
> 👆 Tocca i porcini per far crescere il moltiplicatore
> ☠️ Funghi velenosi: si riparte da ×1
> ⏳ Evita anche questi: fanno perdere tempo

### Meccanica
- **Durata fissa**: 60 secondi (configurabile).
- Nel riquadro compaiono elementi che si muovono **in tutte le direzioni**, con **rotazione**, **velocità** e **dimensioni** casuali.
  - Dimensione: da un minimo di **48px** (bersaglio toccabile) a un massimo di **~110px**.
  - Entrano dai bordi e attraversano l'area, oppure spuntano all'interno con una breve animazione di comparsa; spariscono uscendo dai bordi o dopo qualche secondo.
  - Numero di elementi a schermo e velocità **aumentano gradualmente** durante il minuto.
- **Elementi buoni (porcini)**, tutti tipi di porcino con un aspetto diverso:
  - porcino classico (cappello marrone nocciola);
  - porcino nero (cappello bruno scuro, quasi nero);
  - porcino "pinarolo" (cappello bruno-rossiccio);
  - porcino estivo (cappello chiaro, color camoscio).
- **Elementi cattivi**:
  - funghi **palesemente velenosi**: cappello rosso a puntini bianchi; fungo verdastro-giallognolo; eventuale fungo viola "fantasy". Devono essere impossibili da confondere con un porcino, anche per forma (non solo per colore). Con loro anche il **riccio** di castagna, che sembra un virus (D81): 4 velenosi;
  - **oggetti a tema ma sbagliati**: castagna, pigna, foglia secca, lumaca (4).
- **Punti**:
  - porcino toccato: **+5 × moltiplicatore** (era +10 fino al 29/09, D67);
  - fungo velenoso toccato: **la serie si azzera** (moltiplicatore torna ×1), con feedback visivo e vibrazione breve (se disponibile). Nessun punto tolto;
  - oggetto toccato (castagna, pigna, foglia, lumaca): **-2 s al tempo della partita** (D81), con la scritta "-2 s"; il moltiplicatore e la serie non cambiano. Stesso feedback, nessun punto tolto;
  - tocco a vuoto: nessun effetto.
- **Moltiplicatore a timer** (D84):
  - **×1** è fisso (non scende): con **5 porcini di fila** si passa a ×2. L'anello nell'HUD si riempie con la serie (20% a porcino);
  - da **×2** in su l'anello è un **timer** che si consuma: ogni porcino lo ricarica (**×2 +1,5 s, ×3 +1 s, ×4 +0,5 s**). Quando il timer **supera il tempo pieno** del livello (×2 7 s, ×3 6 s, ×4 5 s) si sale al livello successivo, col timer al **25%**. A ×4 il timer si ferma al pieno;
  - **timer a zero**: si scende di un livello col timer al **50%**; tornati a ×1 servono di nuovo 5 porcini di fila;
  - fungo velenoso: subito ×1; oggetto: il moltiplicatore non cambia (-2 s alla partita).
  A ogni cambio di livello piccola animazione; effetto 🔥 quando sale.
- **Sfondo**: poco invasivo, a tema (sottobosco/prato di montagna sfocato, toni tenui), per non disturbare la lettura dei funghi.

### Punteggio grezzo
Somma dei punti. `stats`: porcini presi, errori, serie massima, durata effettiva.

### Controlli di plausibilità (server)
Durata ≈ 60 s (tolleranza per pause); punteggio ≤ `max_raw_score` calcolato come (massimo di spawn possibili × 10 × 4) con margine.

---

## ❓ Gioco 2 — Quiz del paese (1ª sera)

### Regole mostrate al giocatore
> ❓ 5 domande sui funghi
> ✅ Scegli la risposta giusta tra 4
> ⚡ Più sei veloce, più punti fai!

### Meccanica
- Il server sceglie **5 domande a caso** dal pool (`start_attempt`), evitando quelle già capitate nel primo tentativo dello stesso giocatore.
- Ogni domanda: testo grande, **4 risposte** a bottone, **1 sola corretta**. Ordine delle risposte mescolato.
- **Tempo per domanda**: 20 secondi (configurabile), con barra che si svuota. A tempo scaduto conta come sbagliata.
- **Nessun feedback giusto/sbagliato durante il quiz**: le risposte corrette non sono nel client (altrimenti basterebbe leggerle dal codice), quindi si passa subito alla domanda successiva. A fine quiz, dopo l'invio, il server restituisce il punteggio e quante risposte erano giuste. Se si vorrà mostrare anche le soluzioni, vedi questioni aperte.
- Il client registra per ogni domanda: indice scelto e tempo impiegato (ms).

### Punteggio grezzo (calcolato dal server)
Per ogni domanda corretta: **150 + bonus velocità**, con bonus = `round(50 × (1 − tempo / tempo_max))` (da 0 a 50). Sbagliata o scaduta: 0. **Massimo 1000.**
Poi, come tutti gli altri giochi, normalizzato rispetto al migliore.

### Pool di domande
- Il più ampio possibile (**almeno 40–60 domande**) per evitare ripetizioni e passaparola.
- Temi: storia del paese, tradizioni, dialetto, luoghi, personaggi, la sagra stessa, i funghi.
- Formato di consegna in `contenuti/README.md`. Le domande stanno **solo nel database**.

---

## 🧺 Gioco 3 — Porcini che cadono (2ª sera)

### Regole mostrate al giocatore
> 🧺 Muovi il cestino col dito
> 🍄 Prendi i porcini che cadono
> 💣 Evita le bombe: hai 3 vite ❤️❤️❤️
> ⏱️ Massimo 2 minuti

### Meccanica
- **Cestino in basso**, si muove orizzontalmente seguendo il dito (trascinamento ovunque sullo schermo, non solo sul cestino).
- Dall'alto cadono:
  - **porcini** (stesse varietà del gioco 1): +10 punti se presi;
  - **porcino d'oro** (raro, ~1 ogni 30 elementi): +50 punti;
  - **bombe/petardi** (illustrazione tonda nera con miccia accesa, riconoscibilissima): se presi, **−1 vita**, esplosione e breve scossa dello schermo.
- Porcini non presi: nessuna penalità.
- **3 vite**. A 0 vite la partita finisce.
- **Durata massima 120 secondi.** Velocità di caduta e frequenza aumentano nel tempo.
- **Bonus sopravvivenza**: se si arriva alla fine dei 2 minuti, +50 punti per ogni vita rimasta.

### Punteggio grezzo
Punti dei porcini + bonus sopravvivenza. `stats`: porcini presi, porcini d'oro, bombe prese, durata.

---

## 🃏 Gioco 4 — Memory del paese (2ª sera)

### Regole mostrate al giocatore
> 🃏 Gira due carte alla volta
> 🔍 Trova tutte le 8 coppie
> ⚡ Più sei veloce e preciso, più punti fai!

### Meccanica
- Griglia **4 × 4 = 16 carte**, **8 coppie**. Le 8 immagini raffigurano **i luoghi e le cose più importanti del paese** (foto fornite dagli organizzatori, vedi `contenuti/`), con una **didascalia breve** sotto (es. "Il campanile").
- Retro delle carte uguale per tutte, a tema porcino.
- Carte **mescolate a ogni partita** (con il `seed`).
- Si girano due carte: se uguali restano scoperte, se diverse si richiudono dopo ~0,8 s.
- Si gioca finché si trovano tutte le coppie, con un **tempo massimo di 3 minuti** (oltre, fine partita con le coppie trovate).
- Finché le foto vere non ci sono, usare 8 illustrazioni segnaposto.

### Punteggio grezzo
- Completato: `max(200, 1000 − 3 × secondi − 20 × (mosse − 8))`, dove una "mossa" è una coppia di carte girate (minimo teorico 8).
- Non completato nei 3 minuti: `50 × coppie trovate`.
- `stats`: mosse, secondi, coppie trovate.

---

## Riepilogo

| Gioco | Sera | Durata | Punteggio grezzo |
|---|---|---|---|
| Acchiappa il porcino | 1 | 60 s fissi | +5 × moltiplicatore (serie, a tempo) |
| Quiz del paese | 1 | 5 × 20 s max | 150 + fino a 50 di velocità per risposta giusta (max 1000) |
| Porcini che cadono | 2 | max 120 s, 3 vite | +10 porcino, +50 porcino d'oro, bonus vite |
| Memory del paese | 2 | max 180 s | 1000 − tempo − mosse extra (min 200) |

Tutti poi **normalizzati a 0–1000 rispetto al record del gioco** (vedi `01-SPECIFICHE.md` §6.5).
