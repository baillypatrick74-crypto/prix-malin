// Les montants de démonstration sont exprimés en centimes.
const products = [
  {
    name: 'Nova X1', category: 'Smartphones', specs: '128 Go · OLED 6,1″ · 5G',
    image: 'phone', offers: [[39900, 490], [40900, 0], [38900, 1990]],
  },
  {
    name: 'PulseBook 14', category: 'PC portables', specs: '14″ · 16 Go RAM · SSD 512 Go',
    image: 'laptop', offers: [[74900, 0], [73900, 1490], [76900, 0]],
  },
  {
    name: 'Onde Studio', category: 'Audio', specs: 'Bluetooth · Réduction de bruit',
    image: 'audio', offers: [[12900, 0], [12400, 690], [13900, 0]],
  },
  {
    name: 'Vista Q27', category: 'Écrans', specs: '27″ · QHD · 165 Hz',
    image: 'monitor', offers: [[22900, 0], [21900, 1190], [23900, 0]],
  },
];

const merchants = ['Tech Démo', 'Pixel Démo', 'Circuit Démo'];
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = cents => euros.format(cents / 100);
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const search = document.querySelector('#search');
const filters = [...document.querySelectorAll('[data-category]')];
const catalog = document.querySelector('#products');
const empty = document.querySelector('#empty');
const count = document.querySelector('#count');
const template = document.querySelector('#product-template');
const comparison = document.querySelector('#comparison');
const offerList = document.querySelector('#offers');
let category = '';

function rankedOffers(product) {
  return product.offers.map(([price, shipping], index) => ({
    merchant: merchants[index], price, shipping, total: price + shipping,
  })).sort((first, second) => first.total - second.total);
}

function showComparison(product) {
  document.querySelector('#comparison-title').textContent = product.name;
  offerList.replaceChildren();
  for (const offer of rankedOffers(product)) {
    const row = document.createElement('div');
    row.className = 'offer';
    const details = document.createElement('div');
    const merchant = document.createElement('strong');
    merchant.textContent = offer.merchant;
    const breakdown = document.createElement('small');
    breakdown.textContent = offer.shipping
      ? `${money(offer.price)} + ${money(offer.shipping)} de livraison`
      : `${money(offer.price)} · Livraison offerte`;
    const total = document.createElement('strong');
    total.className = 'total';
    total.textContent = money(offer.total);
    details.append(merchant, breakdown);
    row.append(details, total);
    offerList.append(row);
  }
  comparison.showModal();
}

function render() {
  const terms = normalize(search.value).trim().split(/\s+/u).filter(Boolean);
  const matches = products.filter(product => {
    const searchable = normalize(`${product.name} ${product.category} ${product.specs}`);
    return (!category || product.category === category)
      && terms.every(term => searchable.includes(term));
  });

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
    card.querySelector('h3').textContent = product.name;
    card.querySelector('.specs').textContent = product.specs;
    card.querySelector('.price strong').textContent = money(rankedOffers(product)[0].total);
    const button = card.querySelector('.compare');
    const label = `Comparer ${product.offers.length} offres`;
    button.firstElementChild.textContent = label;
    button.setAttribute('aria-label', `${label} pour ${product.name}`);
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
