import { html } from '../lib/dom.js';
import { EVENT_NAME } from '../config.js';
import porcinoSvg from '../assets/porcino.svg?raw';
import gamepadSvg from '../assets/gamepad.svg?raw';
import { accountLinkMarkup } from '../components/account-link.js';
import { sectionOn, onConfigChange, refreshAppConfig, winnersCount, orderedSections, sponsorColumns } from '../lib/app-config.js';
import { SPONSORS } from '../lib/sponsors.js';

// Riquadri della home: si vedono solo quelli delle sezioni accese dall'Admin (D93)
const BOXES = [
  { section: 'menu', href: '#/menu', icon: '🍽️', title: 'Menù', text: 'Guarda i piatti e i prezzi' },
  { section: 'giochi', href: '#/giochi', icon: gamepadSvg, title: 'Minigiochi', text: () => (winnersCount() > 0 ? 'Gioca e vinci un premio!' : 'Gioca e fai punti!') },
  { section: 'feedback', href: '#/feedback', icon: '💬', title: 'Feedback', text: 'Dicci cosa ne pensi' },
];

const boxesMarkup = () =>
  // nell'ordine deciso dall'Admin (Aspetto, D108)
  orderedSections()
    .map((s) => BOXES.find((box) => box.section === s.id))
    .filter((box) => box && sectionOn(box.section))
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

// Sponsor (D126): sempre in fondo, solo da guardare (niente link); ogni immagine riempie il suo quadrato
const sponsorsMarkup = () =>
  sectionOn('sponsor') && SPONSORS.length
    ? `<section class="home-sponsors" aria-labelledby="home-sponsors-title">
        <h2 class="home-sponsors__title" id="home-sponsors-title">I nostri sponsor:</h2>
        <ul class="home-sponsors__grid" style="--sponsor-columns: ${sponsorColumns()}">
          ${SPONSORS.map((s) => `<li class="home-sponsors__cell"><img src="${s.url}" alt="" loading="lazy" decoding="async" draggable="false"></li>`).join('')}
        </ul>
      </section>`
    : '';

export function renderHome() {
  const element = html(`
    <main class="page home">
      <div class="top-bar">${accountLinkMarkup()}</div>
      <header class="home__header">
        <div class="home__illustration">${porcinoSvg}</div>
        <h1 class="home__title">${EVENT_NAME}</h1>
      </header>
      <nav class="home__boxes" aria-label="Sezioni">${boxesMarkup()}</nav>
      <div class="home__sponsors">${sponsorsMarkup()}</div>
    </main>
  `);
  const nav = element.querySelector('.home__boxes');
  const sponsors = element.querySelector('.home__sponsors');
  const stop = onConfigChange(() => {
    nav.innerHTML = boxesMarkup();
    sponsors.innerHTML = sponsorsMarkup();
  });
  refreshAppConfig();
  return { title: '', element, destroy: stop };
}
