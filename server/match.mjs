// Matches each size of each product in our catalog to a BridalLive inventory item.
//
// Order of rules:
//   1. map.variants[variantId] = BridalLive item id   (set by hand, always wins)
//   2. map.products[handle] = the item name used in BridalLive, if it differs from our title
//   3. otherwise the BridalLive item name must equal our product title
// Then the size has to match (ignoring case, spaces and punctuation, so "38R / 32W" = "38R/32W";
// "38R" alone also matches "38R/32W"), and the colour too when the product has colours.
// The map lives in server/bridallive-map.json. scripts/bridallive-match.mjs writes a report of
// what matched and what didn't, to fill the map in.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchCatalog(catalog, items, map = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map();
  for (const i of items) for (const n of [i.name, i.vendorItemName]) {
    const k = norm(n); if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    if (!byName.get(k).includes(i)) byName.get(k).push(i);
  }
  const links = new Map();      // variantId -> item
  const missing = [];
  const taken = new Set();      // each BridalLive item backs one size only (two products can share a name)
  if (map.variants) for (const id of Object.values(map.variants)) taken.add(Number(id));
  for (const p of catalog.products) {
    const name = norm((map.products && map.products[p.handle]) || p.title);
    const pool = byName.get(name) || [];
    for (const v of p.variants) {
      const fixed = map.variants && map.variants[v.id];
      let it = fixed ? byId.get(Number(fixed)) : null;
      if (!it) {
        const want = norm(v.size), head = norm(String(v.size || '').split('/')[0]);
        it = pool.find((i) => {
          if (taken.has(i.id)) return false;
          const sz = norm(i.size || i.sizeString);
          const sizeOk = sz === want || (sz && sz === head);
          const colorOk = !v.color || norm(i.color || i.colorString) === norm(v.color);
          return sizeOk && colorOk;
        });
      }
      if (it) { links.set(v.id, it); taken.add(it.id); }
      else missing.push({ handle: p.handle, title: p.title, variantId: v.id, size: v.size, color: v.color || null, productFound: pool.length > 0 });
    }
  }
  return { links, missing };
}

// How many of an item the website may sell. BRIDALLIVE_STOCK_FIELD picks the field once we know
// which one this shop's BridalLive uses for sellable stock.
export function stockOf(item, field = process.env.BRIDALLIVE_STOCK_FIELD || 'quantityInStock') {
  const n = Number(item[field] ?? item.quantityOnHand ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
export function priceOf(item, fallback) {
  const p = Number(item.currentPrice || item.salePrice || item.regularPrice);
  return p > 0 ? p : fallback;
}
