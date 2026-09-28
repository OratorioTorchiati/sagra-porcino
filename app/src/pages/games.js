import { placeholderPage } from './placeholder.js';
import porcinoSvg from '../assets/porcino.svg?raw';

export function renderGames() {
  return placeholderPage({
    icon: porcinoSvg,
    title: 'Minigiochi',
    text: 'Qui potrai giocare, fare punti e vedere la classifica.',
  });
}
