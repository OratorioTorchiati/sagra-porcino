import { html } from '../lib/dom.js';
import { EVENT_NAME } from '../config.js';
import porcinoSvg from '../assets/porcino.svg?raw';
import gamepadSvg from '../assets/gamepad.svg?raw';
import { accountLinkMarkup } from '../components/account-link.js';

const BOXES = [
  { href: '#/menu', icon: '🍽️', title: 'Menù', text: 'Guarda i piatti e i prezzi' },
  { href: '#/giochi', icon: gamepadSvg, title: 'Minigiochi', text: 'Gioca, fai punti e vinci un premio!' },
];

export function renderHome() {
  const element = html(`
    <main class="page home">
      <div class="top-bar">${accountLinkMarkup()}</div>
      <header class="home__header">
        <div class="home__illustration">${porcinoSvg}</div>
        <h1 class="home__title">${EVENT_NAME}</h1>
      </header>
      <nav class="home__boxes" aria-label="Sezioni">
        ${BOXES.map(
          (box) => `
          <a class="home-box" href="${box.href}">
            <span class="home-box__icon" aria-hidden="true">${box.icon}</span>
            <span class="home-box__body">
              <span class="home-box__title">${box.title}</span>
              <span class="home-box__text">${box.text}</span>
            </span>
            <span class="home-box__arrow" aria-hidden="true">›</span>
          </a>`,
        ).join('')}
      </nav>
    </main>
  `);
  return { title: '', element };
}
