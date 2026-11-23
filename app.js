import { searchProducts } from './catalog.js';
import { availability, loadOffers, merchants, rankOffers } from './offers.js';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = cents => euros.format(cents / 100);
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
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
  const matches = searchProducts(search.value, category);
  const hasOffers = offers.some(offer => offer.expires > Date.now());
  document.querySelector('#source-status').textContent = hasOffers ? 'Offres marchandes' : unavailable;
  document.querySelector('#source-note').textContent = hasOffers
    ? 'Les prix et stocks sont ceux du dernier relevé valide. Vérifiez les conditions de livraison chez le marchand.'
    : 'Aucune offre récente issue d’une source autorisée n’est disponible actuellement.';

  for (const filter of filters) {
    filter.setAttribute('aria-pressed', String(category === filter.dataset.category));
  }

  catalog.replaceChildren();
  empty.hidden = matches.length !== 0;
  count.textContent = `${matches.length} produit${matches.length === 1 ? '' : 's'}`;
  for (const product of matches) {
    const card = template.content.cloneNode(true);
    const picture = card.querySelector('.product-image');
    picture.classList.add(product.image);
    card.querySelector('.category').textContent = product.category;
    card.querySelector('h3').textContent = `${product.brand} ${product.model}`;
    card.querySelector('.specs').textContent = product.specs;
    const ranked = rankOffers(offers, product.id);
    const best = ranked.find(offer => offer.availability === 'in_stock' && offer.total !== null);
    card.querySelector('.price span').textContent = best ? 'Dès · livraison incluse' : 'Offres marchandes';
    card.querySelector('.price strong').textContent = best ? money(best.total)
      : ranked.length ? 'Voir les prix' : unavailable;
    const button = card.querySelector('.compare');
    const label = 'Comparer les offres';
    button.firstElementChild.textContent = label;
    button.setAttribute('aria-label', `${label} pour ${product.brand} ${product.model}`);
    button.addEventListener('click', () => showComparison(product));
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
loadOffers().then(loaded => {
  offers = loaded;
  if (!offers.length) return;
  render();
  if (comparison.open) renderComparison(selectedProduct);
  scheduleExpiry();
});

function scheduleExpiry() {
  const now = Date.now();
  const next = Math.min(...offers.filter(offer => offer.expires > now).map(offer => offer.expires));
  if (!Number.isFinite(next)) return;
  setTimeout(() => {
    render();
    if (comparison.open) renderComparison(selectedProduct);
    scheduleExpiry();
  }, Math.min(next - now, 2_147_483_647));
}
