import { readOffers } from './offers.js';

export const awinCategory = 'Catalogue AWIN';
const freshness = 24 * 60 * 60 * 1000;

export async function loadAwinCatalog() {
  try {
    const response = await fetch(new URL('./awin/catalog.json', import.meta.url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows)) return null;

    const products = new Map();
    const entries = [];
    for (const row of rows) {
      if (row?.affiliate !== true || typeof row.title !== 'string' || !row.title.trim()) continue;
      const gtin = typeof row.gtin === 'string' && /^(?:\d{8}|\d{12,14})$/.test(row.gtin)
        ? row.gtin : null;
      const awinId = typeof row.awinId === 'string' && /^[0-9]{1,24}$/.test(row.awinId)
        ? row.awinId : null;
      if (!awinId && !gtin) continue;
      const productId = awinId ? `awin-product-${awinId}` : `awin-${gtin.padStart(14, '0')}`;
      const observed = Date.parse(row.checkedAt);
      if (!Number.isFinite(observed)) continue;
      const photo = /^\.\/awin-images\/[a-f0-9]{64}\.(?:png|jpg)$/.test(row.imageUrl)
        ? new URL(`./awin/${row.imageUrl.slice(2)}`, import.meta.url).href : null;
      products.set(productId, {
        id: productId, brand: '', model: row.title.trim(), category: awinCategory,
        specs: gtin ? `EAN ${gtin}` : '', image: 'awin', photo,
      });
      entries.push({
        productId, merchant: row.seller, source: 'AWIN', currency: row.currency,
        condition: row.condition, priceCents: row.priceCents, shippingCents: row.shippingCents,
        availability: row.inStock === true ? 'in_stock' : row.inStock === false ? 'out_of_stock' : 'unknown',
        observedAt: row.checkedAt, expiresAt: new Date(observed + freshness).toISOString(),
        url: row.purchaseUrl, affiliate: true,
      });
    }
    const offers = readOffers({ version: 1, offers: entries }, Date.now(), products);
    const availableIds = new Set(offers.map(offer => offer.productId));
    return {
      products: [...products.values()].filter(product => availableIds.has(product.id)),
      offers,
    };
  } catch {
    return null;
  }
}
