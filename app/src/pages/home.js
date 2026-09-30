import { html } from '../lib/dom.js';
import { EVENT_NAME } from '../config.js';
import porcinoSvg from '../assets/porcino.svg?raw';
import gamepadSvg from '../assets/gamepad.svg?raw';
import { accountLinkMarkup } from '../components/account-link.js';
import { sectionOn, onConfigChange, refreshAppConfig, winnersCount } from '../lib/app-config.js';

// Riquadri della home: si vedono solo quelli delle sezioni accese dall'Admin (D93)
const BOXES = [
  { section: 'menu', href: '#/menu', icon: '🍽️', title: 'Menù', text: 'Guarda i piatti e i prezzi' },
  { section: 'giochi', href: '#/giochi', icon: gamepadSvg, title: 'Minigiochi', text: () => (winnersCount() > 0 ? 'Gioca, fai punti e vinci un premio!' : 'Gioca e fai punti!') },
];

const boxesMarkup = () =>
  BOXES.filter((box) => sectionOn(box.section))
    .map(
      (box) => `
          <a class="home-box" href="${box.href}">
            <span class="home-box__icon" aria-hidden="true">${box.icon}</span>
            <span class="home-box__body">
              <span class="home-box__title">${box.title}</span>
              <span class="home-box__text">${typeof box.text === 'function' ? box.text() : box.text}</span>
            </span>
            <span class="home-box__arrow" aria-hidden="true">›</span>
          </a>`,
    )
    .join('');

export function renderHome() {
  const element = html(`
    <main class="page home">
      <div class="top-bar">${accountLinkMarkup()}</div>
      <header class="home__header">
        <div class="home__illustration">${porcinoSvg}</div>
        <h1 class="home__title">${EVENT_NAME}</h1>
      </header>
      <nav class="home__boxes" aria-label="Sezioni">${boxesMarkup()}</nav>
    </main>
  `);
  const nav = element.querySelector('.home__boxes');
  const stop = onConfigChange(() => (nav.innerHTML = boxesMarkup()));
  refreshAppConfig();
  return { title: '', element, destroy: stop };
}
