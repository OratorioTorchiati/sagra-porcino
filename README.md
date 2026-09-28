# 🍄 Sagra del Porcino — Web app QR

Un solo QR code ai tavoli e agli stand apre una web app con:

- 🍽️ **Menù** della sagra
- 🍄 **Minigiochi**: 2 giochi per serata, 2 tentativi per gioco, classifica unica
- 🔍 **Oggetti segreti**: 5 adesivi nascosti nella sagra da scansionare (+100 punti l'uno)
- 👤 **Profilo**: punti, posizione e QR personale per ritirare il premio

Alla fine della sagra i **primi 10 in classifica** vincono un gadget.

## Costi

Zero: sito su **GitHub Pages**, dati su **Supabase** (piano gratuito).

## Come è organizzata questa cartella

| File | Contenuto |
|---|---|
| `CLAUDE.md` | Istruzioni per Claude Code (da leggere per primo) |
| `docs/01-SPECIFICHE.md` | Cosa fa l'app, schermata per schermata |
| `docs/02-ARCHITETTURA.md` | Tecnologie, database, sicurezza, offline |
| `docs/03-GIOCHI.md` | I 4 minigiochi nel dettaglio |
| `docs/04-ROADMAP.md` | Il lavoro diviso in tappe incrementali |
| `docs/05-DECISIONI.md` | Decisioni prese, questioni aperte, avanzamento |
| `contenuti/` | Cosa devono fornire gli organizzatori (menù, domande, foto) |

## Come partire con Claude Code

Apri questa cartella con Claude Code e scrivi:

> Leggi CLAUDE.md e i documenti in docs/, poi proponimi la prima tappa della roadmap.

Si procede una tappa alla volta: alla fine di ognuna si prova l'app sul telefono e si dà il via libera alla successiva.
