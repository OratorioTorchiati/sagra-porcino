// Campo PIN a 5 caselle (D90): ogni cifra scritta prende il posto del suo trattino (pallino se il PIN è nascosto),
// le cifre mancanti restano trattini e il cursore lampeggia sul trattino della prossima cifra.
// Sotto c'è il vero <input>, invisibile ma sopra le caselle: tastiera numerica, incolla e riempimento automatico
// funzionano come prima e il modulo legge il valore come sempre.

import { PIN_LENGTH } from '../lib/pin.js';

/** Trasforma in caselle ogni `input.form-field__input--pin` dentro `root` (una volta sola per campo). */
export function enhancePinInputs(root) {
  for (const input of root.querySelectorAll('input.form-field__input--pin')) {
    if (input.closest('.pin-box')) continue;
    const box = document.createElement('span');
    box.className = 'pin-box';
    input.before(box);
    box.append(input);
    const slots = Array.from({ length: PIN_LENGTH }, () => {
      const slot = document.createElement('span');
      slot.className = 'pin-box__slot';
      slot.setAttribute('aria-hidden', 'true');
      box.append(slot);
      return slot;
    });

    const update = () => {
      const clean = input.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
      if (clean !== input.value) input.value = clean;
      slots.forEach((slot, i) => {
        const filled = i < clean.length;
        slot.textContent = filled ? (input.type === 'password' ? '•' : clean[i]) : '–';
        slot.classList.toggle('is-filled', filled);
        slot.classList.toggle('is-active', i === clean.length);
      });
    };
    // Il cursore sta sempre dopo l'ultima cifra: si scrive e si cancella solo in fondo
    const caretToEnd = () => {
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // alcuni browser non lo permettono su certi tipi di campo: nessun problema
      }
    };
    // Solo cifre: una lettera non deve entrare nemmeno per un attimo (occuperebbe un posto dei 5 e la cifra dopo
    // verrebbe rifiutata). Incolla e riempimento automatico passano da update, che toglie ciò che non è cifra.
    input.addEventListener('beforeinput', (event) => {
      if (event.inputType !== 'insertText' || !event.data || !/\D/.test(event.data)) return;
      // Testo con lettere (anche più caratteri insieme, es. suggerimento della tastiera): entrano solo le cifre
      event.preventDefault();
      const digits = event.data.replace(/\D/g, '');
      if (!digits) return;
      input.value = (input.value + digits).slice(0, PIN_LENGTH);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      caretToEnd();
    });
    input.addEventListener('input', update);
    for (const type of ['focus', 'click', 'keyup', 'select']) input.addEventListener(type, caretToEnd);
    update();
  }
}

/** Dopo aver cambiato il valore da codice (es. svuotato dopo un errore) le caselle vanno ridisegnate */
export function refreshPinInput(input) {
  input.dispatchEvent(new Event('input'));
}
