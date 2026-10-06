// DOMANDE DI PROVA, solo per la modalità senza server (sviluppo). Volutamente banali e NON presenti nel database:
// questo file finisce nell'app pubblicata, quindi chiunque può leggerne le risposte (D149).
// Le domande vere stanno SOLO nel database. `correct` = indice (da 0) della risposta giusta in `options`.

export const SAMPLE_QUESTIONS = [
  { id: 1, text: 'Domanda di prova: quanto fa 2 + 2?', options: ['3', '4', '5', '22'], correct: 1 },
  { id: 2, text: 'Domanda di prova: quanti giorni ha una settimana?', options: ['5', '6', '7', '8'], correct: 2 },
  { id: 3, text: 'Domanda di prova: di che colore è il cielo sereno?', options: ['Azzurro', 'Verde', 'Rosso', 'Giallo'], correct: 0 },
  { id: 4, text: 'Domanda di prova: quante ruote ha una bicicletta?', options: ['1', '3', '4', '2'], correct: 3 },
  { id: 5, text: 'Domanda di prova: quanto fa 10 − 3?', options: ['6', '7', '8', '13'], correct: 1 },
  { id: 6, text: 'Domanda di prova: quanti mesi ha un anno?', options: ['10', '11', '12', '13'], correct: 2 },
  { id: 7, text: 'Domanda di prova: quale di questi è un numero pari?', options: ['8', '3', '5', '7'], correct: 0 },
  { id: 8, text: 'Domanda di prova: quante ore ha un giorno?', options: ['12', '20', '30', '24'], correct: 3 },
  { id: 9, text: 'Domanda di prova: quanto fa 3 × 3?', options: ['6', '9', '12', '33'], correct: 1 },
  { id: 10, text: 'Domanda di prova: quale lettera viene dopo la A?', options: ['C', 'D', 'B', 'Z'], correct: 2 },
];
