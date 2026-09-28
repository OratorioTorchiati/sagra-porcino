# Contenuti da fornire (organizzatori)

Questa cartella raccoglie i materiali "veri" della sagra. Finché mancano, l'app usa dati di esempio.

## 1. Menù → `menu.csv`

Si apre e si modifica con **Excel** (salvare come "CSV UTF-8"). Una riga per piatto, colonne separate da `;`:

```csv
categoria;piatto;descrizione;prezzo;simboli;allergeni
Primi;Tagliatelle ai porcini;Pasta fresca fatta a mano;9,00;porcini;glutine, uova
```

`descrizione`, `simboli` (`porcini`, `vegetariano`, `piccante`...) e `allergeni` sono facoltativi. Le righe che iniziano con `#` sono commenti (in cima al file c'è il promemoria delle colonne). Durante la build uno script lo converte nel formato usato dall'app: non serve toccare altro.

Per la prima consegna va bene anche un altro formato (PDF, foto del volantino, Word): verrà trascritto nel CSV.

## 2. Domande del quiz → `domande-quiz.csv`

Almeno **40–60 domande**. Una riga per domanda; la colonna `giusta` indica il numero (1–4) della risposta corretta.

```csv
domanda;risposta1;risposta2;risposta3;risposta4;giusta
In che anno si è tenuta la prima edizione della sagra?;1975;1982;1990;2001;2
```

⚠️ Questo file contiene le soluzioni: **non va pubblicato** nel repository pubblico. Va importato direttamente nel database e tenuto fuori da git (è già previsto in `.gitignore`).

## 3. Foto del memory → `memory/`

8 foto dei luoghi e delle cose più importanti del paese, **quadrate** (o ritagliabili al centro), almeno 600×600 px, ognuna con una didascalia breve (max 20 caratteri) in `memory/didascalie.txt`:

```
campanile.jpg;Il campanile
fontana.jpg;La fontana vecchia
```

Usare solo foto proprie o di cui si hanno i diritti.

## 4. Oggetti segreti → `oggetti-segreti.txt`

5 oggetti, con nome e breve descrizione dell'illustrazione (le illustrazioni per app e adesivi le disegna l'app). I **posti** in cui verranno attaccati **non vanno scritti qui**.

```
1;Il porcino con gli occhiali
2;Lo scoiattolo cuoco
...
```

## 5. Testi

- Nome ufficiale della sagra e del paese.
- Titolare del trattamento per l'informativa privacy (nome dell'associazione).
- Descrizione dei premi (facoltativa, per la schermata Minigiochi).
