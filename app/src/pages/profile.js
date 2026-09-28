import { placeholderPage } from './placeholder.js';

export function renderProfile() {
  return placeholderPage({
    icon: '👤',
    title: 'Il mio profilo',
    text: 'Qui vedrai i tuoi punti e il codice per ritirare il premio.',
    showAccount: false,
  });
}
