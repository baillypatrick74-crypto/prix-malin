import { products } from './catalog.js';
import { bestComparableOffer, rankOffers } from './offers.js';

const storageKey = 'prix-malin:price-alerts:v1';
const productIds = new Set(products.map(product => product.id));
const validThreshold = value => Number.isSafeInteger(value) && value > 0;

export function parseThreshold(value) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return validThreshold(cents) ? cents : null;
}

function readAlerts() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return new Map(Object.entries(saved).filter(([id, value]) => productIds.has(id) && validThreshold(value)));
  } catch {
    return new Map();
  }
}

export function matchingPriceAlerts(alerts, offers, now) {
  return products.flatMap(product => {
    const threshold = alerts.get(product.id);
    if (!validThreshold(threshold)) return [];
    const best = bestComparableOffer(rankOffers(offers, product.id, now));
    return best && best.total <= threshold ? [{ product, threshold, best }] : [];
  });
}

export function setupPriceAlerts(money) {
  const dialog = document.querySelector('#price-alert-dialog');
  const form = document.querySelector('#price-alert-form');
  const field = document.querySelector('#price-alert-threshold');
  const error = document.querySelector('#price-alert-error');
  const remove = document.querySelector('#delete-price-alert');
  const notifications = document.querySelector('#price-alert-notifications');
  const status = document.querySelector('#price-alert-status');
  let alerts = readAlerts();
  let offers = [];
  let selected;
  let previousMatches = '';
  const lastTotals = new Map();
  const lowered = new Set();

  function updateNotifications() {
    const matches = matchingPriceAlerts(alerts, offers, Date.now());
    const signature = JSON.stringify(matches.map(({ product, threshold, best }) =>
      [product.id, threshold, best.merchant, best.total, best.url, lowered.has(product.id)]));
    if (signature === previousMatches) return;
    previousMatches = signature;
    notifications.replaceChildren();
    for (const { product, threshold, best } of matches) {
      const item = document.createElement('p');
      const reason = lowered.has(product.id) ? 'Baisse de prix · seuil atteint' : 'Seuil atteint';
      item.textContent = `${reason} pour ${product.brand} ${product.model} : ${money(best.total)} chez ${best.merchant}, livraison incluse (seuil : ${money(threshold)}). `;
      const link = document.createElement('a');
      link.href = best.url;
      link.textContent = 'Voir l’offre';
      link.setAttribute('aria-label', `Voir l’offre pour ${product.brand} ${product.model} chez ${best.merchant}`);
      item.append(link);
      notifications.append(item);
    }
  }

  function updateButton(button) {
    const product = products.find(item => item.id === button.dataset.alertProduct);
    const label = alerts.has(product.id) ? 'Modifier l’alerte' : 'Créer une alerte';
    button.textContent = label;
    button.setAttribute('aria-label', `${label} pour ${product.brand} ${product.model}`);
  }

  function persist(threshold) {
    const next = readAlerts();
    if (threshold === null) next.delete(selected.id);
    else next.set(selected.id, threshold);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next)));
    } catch {
      error.textContent = 'Impossible d’enregistrer l’alerte. Vérifiez que le navigateur autorise le stockage local.';
      return;
    }
    alerts = next;
    refresh();
    dialog.close();
    status.textContent = threshold === null ? 'Alerte supprimée.' : 'Alerte enregistrée.';
  }

  function refresh() {
    document.querySelectorAll('[data-alert-product]').forEach(updateButton);
    updateNotifications();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const threshold = parseThreshold(field.value);
    if (threshold === null) {
      error.textContent = 'Saisissez un montant positif en euros, avec deux décimales au maximum.';
      field.focus();
      return;
    }
    persist(threshold);
  });
  field.addEventListener('input', () => { error.textContent = ''; });
  remove.addEventListener('click', () => persist(null));
  document.querySelector('#close-price-alert').addEventListener('click', () => dialog.close());
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    alerts = readAlerts();
    refresh();
  });

  return {
    bindButton(button, product) {
      button.dataset.alertProduct = product.id;
      updateButton(button);
      button.addEventListener('click', () => {
        status.textContent = '';
        selected = product;
        const threshold = alerts.get(product.id);
        document.querySelector('#price-alert-title').textContent = `Alerte de prix · ${product.brand} ${product.model}`;
        field.value = threshold === undefined ? '' : (threshold / 100).toFixed(2).replace('.', ',');
        error.textContent = '';
        remove.hidden = threshold === undefined;
        dialog.showModal();
      });
    },
    updateOffers(next) {
      const now = Date.now();
      for (const product of products) {
        const best = bestComparableOffer(rankOffers(next, product.id, now));
        if (!best) continue;
        const previous = lastTotals.get(product.id);
        if (previous !== undefined && best.total !== previous) {
          if (best.total < previous) lowered.add(product.id);
          else lowered.delete(product.id);
        }
        lastTotals.set(product.id, best.total);
      }
      offers = next;
      updateNotifications();
    },
  };
}
