import { searchProducts } from './catalog.js';
import { availability, bestComparableOffer, loadOffers, merchants, rankOffers } from './offers.js';
import { setupPriceAlerts } from './price-alerts.js';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = cents => euros.format(cents / 100);
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const priceAlerts = setupPriceAlerts(money);
const unavailable = 'Prix indisponible';

const search = document.querySelector('#search');
const filters = [...document.querySelectorAll('[data-category]')];
const catalog = document.querySelector('#products');
const empty = document.querySelector('#empty');
const count = document.querySelector('#count');
const template = document.querySelector('#product-template');
const comparison = document.querySelector('#comparison');
const offerList = document.querySelector('#offers');
let category = '';

let offers = [];
let selectedProduct = null;

function offerRow(merchant, offer) {
  const row = document.createElement('div');
  row.className = 'offer';
  const details = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = merchant;
  const summary = document.createElement('small');
  details.append(heading, summary);

  if (!offer) {
    summary.textContent = unavailable;
    row.append(details);
    return row;
  }

  const shipping = offer.shipping === null ? 'Livraison inconnue' : `Livraison : ${money(offer.shipping)}`;
  summary.textContent = `Prix : ${money(offer.price)} · ${shipping}`;
  const stock = document.createElement('small');
  stock.textContent = availability.get(offer.availability);
  const source = document.createElement('small');
  source.textContent = `${offer.source} · Relevé le ${date.format(offer.observed)} (Paris)`;
  details.append(stock, source);

  const actions = document.createElement('div');
  actions.className = 'offer-actions';
  const total = document.createElement('strong');
  total.textContent = offer.total === null ? 'Total indisponible' : `Total : ${money(offer.total)}`;
  const link = document.createElement('a');
  link.href = offer.url;
  link.textContent = 'Voir l’offre';
  link.setAttribute('aria-label', `Voir l’offre chez ${merchant}`);
  actions.append(total, link);
  row.append(details, actions);
  return row;
}

function renderComparison(product) {
  document.querySelector('#comparison-title').textContent = `${product.brand} ${product.model}`;
  const ranked = rankOffers(offers, product.id);
  const missing = merchants.filter(merchant => !ranked.some(offer => offer.merchant === merchant));
  offerList.replaceChildren(
    ...ranked.map(offer => offerRow(offer.merchant, offer)),
    ...missing.map(merchant => offerRow(merchant)),
  );
}

function showComparison(product) {
  selectedProduct = product;
  renderComparison(product);
  comparison.showModal();
}

function render() {
  const now = Date.now();
  const matches = searchProducts(search.value, category).map(product => {
    const ranked = rankOffers(offers, product.id, now);
    const best = bestComparableOffer(ranked);
    return { product, ranked, best };
  }).sort((first, second) => {
    const firstTotal = first.best?.total ?? Number.MAX_SAFE_INTEGER;
    const secondTotal = second.best?.total ?? Number.MAX_SAFE_INTEGER;
    return firstTotal - secondTotal;
  });
  const hasOffers = offers.some(offer => offer.expires > now);
  document.querySelector('#source-status').textContent = hasOffers ? 'Offres marchandes' : unavailable;
  document.querySelector('#source-note').textContent = hasOffers
    ? 'Les prix et stocks sont ceux du dernier relevé valide. Vérifiez les conditions de livraison chez le marchand.'
    : 'Aucun prix marchand n’est disponible actuellement. Vous pouvez toujours parcourir le catalogue.';

  for (const filter of filters) {
    filter.setAttribute('aria-pressed', String(category === filter.dataset.category));
  }

  catalog.replaceChildren();
  empty.hidden = matches.length !== 0;
  count.textContent = `${matches.length} produit${matches.length === 1 ? '' : 's'}`;
  for (const { product, ranked, best } of matches) {
    const card = template.content.cloneNode(true);
    const picture = card.querySelector('.product-image');
    picture.classList.add(product.image);
    card.querySelector('.category').textContent = product.category;
    card.querySelector('h3').textContent = `${product.brand} ${product.model}`;
    card.querySelector('.specs').textContent = product.specs;
    card.querySelector('.price span').textContent = best ? 'Meilleur total · livraison incluse' : 'Offres marchandes';
    card.querySelector('.price strong').textContent = best ? money(best.total)
      : ranked.length ? 'Voir les prix' : unavailable;
    if (best) {
      const merchant = card.querySelector('.best-merchant');
      merchant.textContent = best.merchant;
      merchant.hidden = false;
      const link = card.querySelector('.best-link');
      link.href = best.url;
      link.setAttribute('aria-label', `Voir l’offre pour ${product.brand} ${product.model} chez ${best.merchant}`);
      link.hidden = false;
    }
    const button = card.querySelector('.compare');
    const label = 'Comparer les offres';
    button.firstElementChild.textContent = label;
    button.setAttribute('aria-label', `${label} pour ${product.brand} ${product.model}`);
    button.addEventListener('click', () => showComparison(product));
    priceAlerts.bindButton(card.querySelector('.alert-button'), product);
    catalog.append(card);
  }
}

search.addEventListener('input', render);
document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  render();
  document.querySelector('#catalog-title').focus();
});
for (const filter of filters) {
  filter.addEventListener('click', () => {
    category = filter.dataset.category;
    render();
  });
}
document.querySelector('#reset').addEventListener('click', () => {
  search.value = '';
  category = '';
  render();
  document.querySelector('#catalog-title').focus();
});
document.querySelector('#close').addEventListener('click', () => comparison.close());
render();
let expiryTimer;
let refreshing = false;
const refreshInterval = 5 * 60 * 1000;

function updatePrices() {
  const now = Date.now();
  render();
  if (comparison.open) renderComparison(selectedProduct);
  priceAlerts.updateOffers(offers);
  clearTimeout(expiryTimer);
  const next = Math.min(...offers.filter(offer => offer.expires > now).map(offer => offer.expires));
  if (Number.isFinite(next)) {
    expiryTimer = setTimeout(updatePrices, Math.min(Math.max(0, next - Date.now()), 2_147_483_647));
  }
}

async function refreshPrices() {
  if (refreshing) return;
  refreshing = true;
  try {
    const loaded = await loadOffers();
    if (JSON.stringify(loaded) !== JSON.stringify(offers)) {
      offers = loaded;
      updatePrices();
    }
  } finally {
    refreshing = false;
  }
}

refreshPrices();
setInterval(() => {
  if (!document.hidden) refreshPrices();
}, refreshInterval);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshPrices();
});
