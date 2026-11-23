export const products = [
  { id: 'samsung-galaxy-s24-128', brand: 'Samsung', model: 'Galaxy S24', category: 'Smartphones', specs: '128 Go · 5G', image: 'phone' },
  { id: 'apple-iphone-16-128', brand: 'Apple', model: 'iPhone 16', category: 'Smartphones', specs: '128 Go · 5G', image: 'phone' },
  { id: 'xiaomi-redmi-note-14-5g-256', brand: 'Xiaomi', model: 'Redmi Note 14 5G', category: 'Smartphones', specs: '256 Go · 5G', image: 'phone' },
  { id: 'google-pixel-9-128', brand: 'Google', model: 'Pixel 9', category: 'Smartphones', specs: '128 Go · 5G', image: 'phone' },
  { id: 'apple-macbook-air-m3-13-16-256', brand: 'Apple', model: 'MacBook Air M3', category: 'PC portables', specs: '13″ · 16 Go RAM · SSD 256 Go', image: 'laptop' },
  { id: 'asus-zenbook-14-oled-ux3405ma-16-512', brand: 'ASUS', model: 'Zenbook 14 OLED UX3405MA', category: 'PC portables', specs: '14″ · 16 Go RAM · SSD 512 Go', image: 'laptop' },
  { id: 'sony-wh-1000xm5', brand: 'Sony', model: 'WH-1000XM5', category: 'Audio', specs: 'Bluetooth · Réduction de bruit', image: 'audio' },
  { id: 'lg-ultragear-27gr75q-b', brand: 'LG', model: 'UltraGear 27GR75Q-B', category: 'Écrans', specs: '27″ · QHD · 165 Hz', image: 'monitor' },
];

const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const compact = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');

export function searchProducts(query, category) {
  const terms = normalize(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return products.filter(product => {
    const categoryAlias = product.category === 'PC portables' ? 'ordinateur' : '';
    const searchable = normalize(`${product.brand} ${product.model} ${product.category} ${product.specs} ${categoryAlias}`);
    const model = compact(product.model);
    return (!category || product.category === category)
      && terms.every(term => searchable.includes(term) || model.includes(term));
  });
}
