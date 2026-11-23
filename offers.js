import { products } from './catalog.js';

export const merchants = ['Fnac', 'Darty', 'Boulanger', 'Cdiscount'];
export const availability = new Map([
  ['in_stock', 'En stock'],
  ['out_of_stock', 'Rupture de stock'],
  ['preorder', 'En précommande'],
  ['unknown', 'Disponibilité inconnue'],
]);
const productIds = new Set(products.map(product => product.id));
const isAmount = value => Number.isSafeInteger(value) && value >= 0;

export function readOffers(feed, now = Date.now()) {
  if (feed?.version !== 1 || !Array.isArray(feed.offers)) return [];

  return feed.offers.flatMap(row => {
    if (!row || !productIds.has(row.productId) || row.currency !== 'EUR'
        || row.condition !== 'new' || !isAmount(row.priceCents)
        || typeof row.merchant !== 'string' || !row.merchant.trim()
        || typeof row.source !== 'string' || !row.source.trim()) return [];

    const observed = Date.parse(row.observedAt);
    const expires = Date.parse(row.expiresAt);
    if (!Number.isFinite(observed) || !Number.isFinite(expires)
        || observed > now || expires <= now) return [];

    const url = URL.parse(typeof row.url === 'string' ? row.url : '');
    if (!url || url.protocol !== 'https:' || url.username || url.password) return [];

    const shipping = isAmount(row.shippingCents) ? row.shippingCents : null;
    const total = shipping === null ? null : row.priceCents + shipping;
    const merchant = row.merchant.trim();
    return [{
      productId: row.productId,
      merchant: merchants.find(name => name.toLowerCase() === merchant.toLowerCase()) ?? merchant,
      source: row.source.trim(),
      price: row.priceCents,
      shipping,
      total: isAmount(total) ? total : null,
      availability: availability.has(row.availability) ? row.availability : 'unknown',
      url: url.href,
      observed,
      expires,
    }];
  });
}

export function rankOffers(offers, productId, now = Date.now()) {
  return offers.filter(offer => offer.productId === productId && offer.expires > now)
    .sort((first, second) => {
      const byStock = Number(second.availability === 'in_stock')
        - Number(first.availability === 'in_stock');
      return byStock || (first.total ?? Infinity) - (second.total ?? Infinity)
        || first.price - second.price;
    });
}

export async function loadOffers() {
  try {
    const response = await fetch(new URL('./offers.json', import.meta.url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? readOffers(await response.json()) : [];
  } catch {
    return [];
  }
}
