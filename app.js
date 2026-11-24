import { awinCategory, loadAwinCatalog } from './awin.js';
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
let regularOffers = [];
let awinOffers = [];
let awinProducts = [];
const awinFilter = document.querySelector('#awin-filter');
let refreshedAt = null;
let selectedProduct = null;
const productName = product => [product.brand, product.model].filter(Boolean).join(' ');

function setOfferLink(link, offer) {
  link.href = offer.url;
  if (offer.affiliate) {
    link.rel = 'sponsored';
    link.textContent = 'Voir l’offre (lien affilié)';
  }
}

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
  source.textContent = `${offer.source} · ${offer.affiliate ? 'Importé le' : 'Relevé le'} ${date.format(offer.observed)} (Paris)`;
  details.append(stock, source);

  const actions = document.createElement('div');
  actions.className = 'offer-actions';
  const total = document.createElement('strong');
  total.textContent = offer.total === null ? 'Total indisponible' : `Total : ${money(offer.total)}`;
  const link = document.createElement('a');
  link.textContent = 'Voir l’offre';
  setOfferLink(link, offer);
  link.setAttribute('aria-label', `Voir l’offre chez ${merchant}`);
  actions.append(total, link);
  row.append(details, actions);
  return row;
}

function renderComparison(product) {
  document.querySelector('#comparison-title').textContent = productName(product);
  const ranked = rankOffers(offers, product.id);
  const missing = product.category === awinCategory ? [] : merchants.filter(merchant => !ranked.some(offer => offer.merchant === merchant));
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
  const activeIds = new Set(awinOffers.filter(offer => offer.expires > now).map(offer => offer.productId));
  const activeProducts = awinProducts.filter(product => activeIds.has(product.id));
  awinFilter.hidden = activeProducts.length === 0;
  if (awinFilter.hidden && category === awinCategory) category = '';
  const matches = searchProducts(search.value, category, activeProducts).map(product => {
    const ranked = rankOffers(offers, product.id, now);
    const best = bestComparableOffer(ranked);
    const headline = best ?? (product.category === awinCategory
      ? ranked.find(offer => offer.availability === 'in_stock') : null);
    return { product, ranked, best, headline };
  }).sort((first, second) => {
    const firstTotal = first.headline?.total ?? first.headline?.price ?? Infinity;
    const secondTotal = second.headline?.total ?? second.headline?.price ?? Infinity;
    return firstTotal === secondTotal ? 0 : firstTotal - secondTotal;
  });
  const hasOffers = offers.some(offer => offer.expires > now);
  const refreshDate = document.querySelector('#offers-refreshed-at');
  refreshDate.hidden = refreshedAt === null;
  if (refreshedAt !== null) {
    refreshDate.dateTime = new Date(refreshedAt).toISOString();
    refreshDate.textContent = `Dernière actualisation des offres : ${date.format(refreshedAt)} (Paris)`;
  }
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
  for (const { product, ranked, best, headline } of matches) {
    const card = template.content.cloneNode(true);
    const picture = card.querySelector('.product-image');
    picture.classList.add(product.image);
    if (product.photo) {
      const img = document.createElement('img');
      img.src = product.photo;
      img.alt = '';
      img.loading = 'lazy';
      picture.append(img);
    }
    card.querySelector('.category').textContent = product.category;
    card.querySelector('h3').textContent = productName(product);
    card.querySelector('.specs').textContent = product.specs;
    card.querySelector('.price span').textContent = best ? 'Meilleur total · livraison incluse' : headline ? 'Prix de l’article · livraison inconnue' : 'Offres marchandes';
    card.querySelector('.price strong').textContent = headline ? money(headline.total ?? headline.price)
      : ranked.length ? 'Voir les prix' : unavailable;
    if (headline) {
      const merchant = card.querySelector('.best-merchant');
      merchant.textContent = headline.merchant;
      merchant.hidden = false;
      const link = card.querySelector('.best-link');
      setOfferLink(link, headline);
      link.setAttribute('aria-label', `Voir l’offre pour ${productName(product)} chez ${headline.merchant}`);
      link.hidden = false;
    }
    const button = card.querySelector('.compare');
    const label = 'Comparer les offres';
    button.firstElementChild.textContent = label;
    button.setAttribute('aria-label', `${label} pour ${productName(product)}`);
    button.addEventListener('click', () => showComparison(product));
    const alertButton = card.querySelector('.alert-button');
    if (product.category === awinCategory) alertButton.hidden = true;
    else priceAlerts.bindButton(alertButton, product);
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
document.querySelector('#home').addEventListener('click', () => {
  search.value = '';
  category = '';
  render();
  search.focus();
  window.scrollTo(0, 0);
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
    const [loaded, awin] = await Promise.all([loadOffers(), loadAwinCatalog()]);
    const nextRefreshedAt = loaded ? loaded.refreshedAt : refreshedAt;
    const productsChanged = awin && JSON.stringify(awin.products) !== JSON.stringify(awinProducts);
    const refreshChanged = nextRefreshedAt !== refreshedAt;
    if (loaded) {
      regularOffers = loaded.offers;
      refreshedAt = loaded.refreshedAt;
    }
    if (awin) {
      awinOffers = awin.offers;
      awinProducts = awin.products;
    }
    const nextOffers = [...regularOffers, ...awinOffers];
    if (refreshChanged || productsChanged || JSON.stringify(nextOffers) !== JSON.stringify(offers)) {
      offers = nextOffers;
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
