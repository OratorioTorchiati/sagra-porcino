// Menù della sagra: quello pubblicato dall'Admin dal pannello (D96, D120). Resta sul telefono, quindi si legge anche
// senza rete; finché non ce n'è uno, "In arrivo".
// Piatti terminati (D119): un po' spenti, con "Terminato" in rosso; l'Admin li segna con il pulsantino sotto il piatto.

import { currentMenu, uploadedMenu, onMenuChange, refreshMenu, setMenu } from '../lib/menu-data.js';
import { currentPlayer, isAdminRole } from '../lib/account.js';
import { staffRpc } from '../lib/staff.js';
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

// Il pulsantino si vede solo all'Admin
const canMarkSoldOut = () => isAdminRole(currentPlayer()?.role) && uploadedMenu() !== null;

function dishMarkup(dish, category) {
  const soldOut = dish.sold_out === true;
  return `
    <li class="dish${soldOut ? ' dish--sold-out' : ''}">
      <div class="dish__head">
        <span class="dish__name"><span class="dish__label">${nameWithSymbols(dish)}</span>${soldOut ? ' <span class="dish__sold-out">Terminato</span>' : ''}</span>
        <span class="dish__price">${priceFormat.format(dish.price)}</span>
      </div>
      ${dish.description ? `<p class="dish__description">${escapeHtml(dish.description)}</p>` : ''}
      ${dish.allergens.length ? `<p class="dish__allergens">Allergeni: ${escapeHtml(dish.allergens.join(', '))}</p>` : ''}
      ${
        canMarkSoldOut()
          ? `<button type="button" class="dish__toggle" data-sold-out="${soldOut ? 'false' : 'true'}"
              data-category="${escapeHtml(category)}" data-dish="${escapeHtml(dish.name)}">${soldOut ? '↩️ Di nuovo disponibile' : '🚫 Segna terminato'}</button>`
          : ''
      }
    </li>
  `;
}

function menuMarkup(allCategories) {
  const categories = allCategories.filter((c) => c.dishes.length > 0); // categorie ancora vuote: non si vedono (D102)
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
        <ul class="dishes">${c.dishes.map((d) => dishMarkup(d, c.name)).join('')}</ul>
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
      <div class="menu-body">${menuMarkup(currentMenu().categories)}</div>
    </main>
  `);
  bindTopBar(element);
  const body = element.querySelector('.menu-body');
  // Menù aggiornato dal pannello: si ridisegna da solo
  const stop = onMenuChange((menu) => (body.innerHTML = menuMarkup(menu.categories)));
  refreshMenu();

  element.addEventListener('click', async (event) => {
    const button = event.target.closest('.menu-jump');
    if (button) element.querySelector(`#${button.dataset.target}`).scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Admin: piatto terminato / di nuovo disponibile (il menù si ridisegna con la risposta del server)
    const toggle = event.target.closest('.dish__toggle');
    if (!toggle || toggle.disabled) return;
    toggle.disabled = true;
    const label = toggle.textContent;
    toggle.textContent = 'Un attimo…';
    try {
      const res = await staffRpc('set_dish_sold_out', {
        p_category: toggle.dataset.category,
        p_dish: toggle.dataset.dish,
        p_sold_out: toggle.dataset.soldOut === 'true',
      });
      if (res.ok) return setMenu(res.menu);
      toggle.textContent = res.error === 'DISH_NOT_FOUND' ? 'Piatto non trovato: ricarica la pagina' : 'Non riuscito, riprova';
    } catch {
      toggle.textContent = 'Niente rete, riprova';
    }
    setTimeout(() => {
      toggle.textContent = label;
      toggle.disabled = false;
    }, 2500);
  });
  return { title: 'Menù', element, destroy: stop };
}
