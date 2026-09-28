// Menù della sagra, generato da contenuti/menu.csv durante la build (vedi scripts/menu-plugin.js).
// È incluso nell'app, quindi si legge anche senza rete.

import menu from 'virtual:menu';
import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import porcinoSvg from '../assets/porcino.svg?raw';

// Niente emoji 🍄 per i porcini: sui telefoni è un fungo rosso a puntini (velenoso)
const SYMBOL_DISPLAY = {
  porcini: { icon: porcinoSvg, label: 'Contiene porcini' },
  vegetariano: { icon: '🌱', label: 'Vegetariano' },
  piccante: { icon: '🌶️', label: 'Piccante' },
};

const priceFormat = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function symbolMarkup(key) {
  const { icon, label } = SYMBOL_DISPLAY[key];
  return `<span class="dish__symbol" role="img" aria-label="${label}" title="${label}">${icon}</span>`;
}

// L'ultima parola resta attaccata ai simboli, così un'icona non finisce da sola a capo
function nameWithSymbols(dish) {
  if (!dish.symbols.length) return escapeHtml(dish.name);
  const words = dish.name.split(' ');
  const last = words.pop();
  const head = words.length ? `${escapeHtml(words.join(' '))} ` : '';
  return `${head}<span class="nowrap">${escapeHtml(last)}${dish.symbols.map(symbolMarkup).join('')}</span>`;
}

function dishMarkup(dish) {
  return `
    <li class="dish">
      <div class="dish__head">
        <span class="dish__name">${nameWithSymbols(dish)}</span>
        <span class="dish__price">${priceFormat.format(dish.price)}</span>
      </div>
      ${dish.description ? `<p class="dish__description">${escapeHtml(dish.description)}</p>` : ''}
      ${dish.allergens.length ? `<p class="dish__allergens">Allergeni: ${escapeHtml(dish.allergens.join(', '))}</p>` : ''}
    </li>
  `;
}

function menuMarkup(categories) {
  if (categories.length === 0) {
    return `
      <div class="notice">
        <p class="notice__title">In arrivo</p>
        <p>Il menù sarà disponibile a breve.</p>
      </div>
    `;
  }

  const usedSymbols = Object.keys(SYMBOL_DISPLAY).filter((key) =>
    categories.some((c) => c.dishes.some((d) => d.symbols.includes(key))),
  );

  // Salti rapidi: bottoni (non link #id, perché l'hash dell'indirizzo è usato dal router)
  const jumps =
    categories.length > 1
      ? `<nav class="menu-jumps" aria-label="Categorie">
          ${categories.map((c, i) => `<button type="button" class="menu-jump" data-target="cat-${i}">${escapeHtml(c.name)}</button>`).join('')}
        </nav>`
      : '';

  const sections = categories
    .map(
      (c, i) => `
      <section class="menu-section" id="cat-${i}">
        <h2 class="menu-section__title">${escapeHtml(c.name)}</h2>
        <ul class="dishes">${c.dishes.map(dishMarkup).join('')}</ul>
      </section>`,
    )
    .join('');

  const legend = usedSymbols.length
    ? `<ul class="menu-legend" aria-label="Legenda dei simboli">
        ${usedSymbols.map((key) => `<li>${symbolMarkup(key)} ${SYMBOL_DISPLAY[key].label}</li>`).join('')}
      </ul>`
    : '';

  return jumps + legend + sections;
}

export function renderMenu() {
  const element = html(`
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">🍽️</span>Menù</h1>
      ${menuMarkup(menu.categories)}
    </main>
  `);
  bindTopBar(element);

  element.querySelectorAll('.menu-jump').forEach((button) => {
    button.addEventListener('click', () => {
      element.querySelector(`#${button.dataset.target}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  return { title: 'Menù', element };
}
