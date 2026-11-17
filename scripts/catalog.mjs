// Builds the shop catalog (docs/shop/catalog.json) and its images (docs/shop/img/)
// from the product data pulled from the current Squarespace store into research/shop/.
// research/ stays out of git; catalog.json is the committed source the Shop page reads.
// Run: node scripts/catalog.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'research', 'shop');
const out = join(root, 'docs', 'shop');
mkdirSync(join(out, 'img'), { recursive: true });

// Draft copy, written from the product names and photos. Facts the shop still has to
// confirm are listed per product in `confirm`, not written into the copy.
const HAMP = 'Part of our Hampton collection.';
const MAD = 'Part of our Madison collection.';
const SET = 'Jacket and trousers are sold together. Come to the Penfield shop for a fitting and alterations.';
const JKT = 'Sold as a jacket. Come to the Penfield shop for a fitting and alterations.';
const LINE_Q = { Hampton: 'What sets Hampton apart (fabric, construction, fit)', Madison: 'Madison fabric and fit' };
const P = {
  'solid-navy-suit-bhhzc': ['navy', 'blue', 'A deep navy that works at any hour, from a morning ceremony to an evening reception, and goes with almost any tie color the wedding calls for.', true],
  'product-5-yd35j-l8s85': ['black', 'black', 'Solid black for a formal, polished party without going full tuxedo. Sharp with a black, silver or gold tie at evening weddings.'],
  'medium-gray-suit': ['medium gray', 'gray', 'A mid-tone gray between charcoal and light gray. Easy for groomsmen and fathers alike, and right in every season.'],
  'french-blue-suit': ['French blue', 'blue', 'A bright, true blue that photographs beautifully outdoors. A favorite for spring and summer weddings with tan shoes and a light tie.'],
  'solid-camel-suit': ['camel', 'brown', 'Warm camel for fall weddings, barns and rustic venues. Pairs with brown shoes and earthy tie colors.', true],
  'solid-burgundy-suit': ['burgundy', 'red', 'Rich burgundy for fall and winter weddings, or for a groom who wants to stand apart from a party in gray or navy.', true],
  'solid-olive-suit': ['olive', 'green', 'Muted olive green for garden, outdoor and fall weddings. Looks right with brown shoes and rust, cream or blush ties.'],
  'solid-brown-suit': ['brown', 'brown', 'A deep brown that brings warmth to fall and rustic weddings, with cognac shoes and a gold or green tie.'],
  'arlan-tux-dinner-jacket': ['white with black satin lapels', 'white', 'A white dinner jacket with black satin shawl lapels, worn with black tuxedo trousers for classic black tie at summer and destination weddings.'],
  'snow-white-dinner-jacket': ['snow white', 'white', 'A crisp, bright white dinner jacket for a groom who wants to stand apart from the party. Wear it with black tuxedo trousers and a black bow tie.'],
  'off-white-dinner-jacket': ['off white', 'white', 'A soft off-white dinner jacket, warmer than pure white, that sits well beside an ivory dress. Wear it with black tuxedo trousers and a black tie.'],
  'solid-biege-suit': ['beige', 'brown', 'Light beige for warm-weather, beach and garden weddings. Cool and easy with white shirts, brown shoes and pastel ties.'],
  'solid-navy-suit': ['navy', 'blue', 'A deep navy that works at any hour and goes with almost any tie color the wedding calls for.', true],
  'hunter-green-suit': ['hunter green', 'green', 'Deep hunter green, a richer alternative to navy for fall and winter weddings. Striking with gold, cream or burgundy accents.'],
  'oatmeal-taupe-suit': ['oatmeal taupe', 'brown', 'Soft oatmeal taupe, a light neutral with a hint of warmth for spring, summer and rustic weddings.'],
  'sterling-gray-suit': ['sterling gray', 'gray', 'A cool, silvery gray for daytime and spring weddings. Clean with white shirts and blush, lavender or navy ties.', true],
  'solid-light-gray-suit': ['light gray', 'gray', 'Light gray, a bright neutral for daytime and summer weddings that suits every skin tone and tie color.', true],
  'product-1-x2ec7': ['light gray', 'gray', 'Light gray, a bright neutral for daytime and summer weddings that suits every skin tone and tie color.', true],
  'product-2-tszn4': ['oatmeal taupe', 'brown', 'Soft oatmeal taupe, a light neutral with a hint of warmth for spring, summer and rustic weddings.'],
  'product-3-2za6w': ['gray', 'gray', 'A classic mid gray that works across seasons, venues and times of day, and with any tie color.', true],
  'product-5-yd35j': ['black', 'black', 'Solid black for a formal, polished party without going full tuxedo. Sharp with a black, silver or gold tie at evening weddings.'],
  'product-6-3xgh6': ['light blue', 'blue', 'Sharkskin is a weave with a subtle two-tone sheen that catches the light. In light blue it’s an easy, bright choice for spring and summer.'],
  'blue-sharkskin-suit': ['blue', 'blue', 'Sharkskin is a weave with a subtle two-tone sheen that catches the light. This deeper blue dresses up well for evening.'],
  'natural-linen-suit': ['natural linen', 'brown', 'Breathable linen in natural beige or white, made for hot days and beach or destination weddings. Linen creases easily; the relaxed look is part of its charm.']
};
// Readable web addresses for the products that still have Squarespace placeholders.
const HANDLE = {
  'solid-navy-suit-bhhzc': 'navy-hampton-suit', 'product-5-yd35j-l8s85': 'black-hampton-suit', 'medium-gray-suit': 'medium-gray-hampton-suit',
  'product-1-x2ec7': 'light-gray-hampton-suit', 'product-2-tszn4': 'oatmeal-taupe-madison-suit-2', 'product-3-2za6w': 'gray-madison-suit',
  'product-5-yd35j': 'black-madison-suit', 'product-6-3xgh6': 'light-blue-sharkskin-madison-suit', 'solid-biege-suit': 'beige-madison-suit'
};

// Clean a size label: uppercase W, restore the slash, and set the waist from the jacket (a 6-inch drop).
function size(raw) {
  const m = raw.replace(/\s+/g, '').match(/^(\d{2})([SRL])\/?(\d{2})[wW]$/);
  if (!m) return { label: raw, chest: 0, len: '', waist: 0 };
  const chest = +m[1], waist = chest - 6;
  return { label: `${chest}${m[2]}/${waist}W`, chest, len: m[2], waist, fixed: `${chest}${m[2]}/${waist}W` !== raw };
}
const LEN = { S: 0, R: 1, L: 2 };
// Written by scripts/anchors.py from the cut-out photos.
const ANCHORS = existsSync(join(out, 'anchors.json')) ? JSON.parse(readFileSync(join(out, 'anchors.json'), 'utf8')) : {};

const order = JSON.parse(readFileSync(join(src, 'shop.json'), 'utf8')).items.map((i) => i.fullUrl.split('/').pop());
const products = [];
for (const slug of order) {
  const it = JSON.parse(readFileSync(join(src, 'p', slug + '.json'), 'utf8')).item;
  const title = it.title.replace(/\s+/g, ' ').replace('Biege', 'Beige').trim();
  const [color, family, blurb, vestShown] = P[slug];
  const type = /Dinner Jacket/.test(title) ? 'dinner-jacket' : 'suit';
  const line = /Hampton/.test(title) ? 'Hampton' : /Madison/.test(title) ? 'Madison' : null;
  const fabric = /Sharkskin/.test(title) ? 'Sharkskin' : /Linen/.test(title) ? 'Linen' : null;
  // Images: suit photo first, then swatches.
  const imgs = (it.items || []).map((im, k) => ({ k, swatch: /Screenshot/.test(decodeURIComponent(decodeURIComponent(im.filename || ''))) }));
  imgs.sort((a, b) => a.swatch - b.swatch);
  const images = imgs.map((im) => {
    const file = `${slug}-${im.k}.webp`;
    if (existsSync(join(src, 'img', `${slug}-${im.k}`))) copyFileSync(join(src, 'img', `${slug}-${im.k}`), join(out, 'img', file));
    const entry = { src: `img/${file}`, kind: im.swatch ? 'swatch' : 'photo' };
    // Cut-out version (background removed) and its measurements, for the styled mannequins.
    const key = `${slug}-${im.k}`;
    if (!im.swatch && existsSync(join(out, 'img', key + '-cut.webp'))) {
      entry.cut = `img/${key}-cut.webp`;
      if (ANCHORS[key]) entry.fig = ANCHORS[key];
    }
    return entry;
  });
  const variants = (it.variants || []).map((v) => {
    const a = v.attributes || {};
    const sz = size(a.Size || '');
    return { id: v.id, size: sz.label, chest: sz.chest, length: sz.len, waist: sz.waist, color: a.Color || null,
      available: !!(v.unlimited || v.qtyInStock > 0), price: +(v.priceMoney?.value || v.price / 100),
      shopifyVariantId: null, sourceLabel: sz.fixed ? (a.Size || '') : undefined };
  }).sort((a, b) => (a.color || '').localeCompare(b.color || '') || a.chest - b.chest || LEN[a.length] - LEN[b.length]);
  const confirm = [];
  if (line) confirm.push(LINE_Q[line]);
  if (vestShown) confirm.push('Is the vest in the photo included?');
  if (type === 'dinner-jacket') confirm.push('Are matching trousers sold separately?');
  const dupe = slug === 'product-2-tszn4';
  products.push({
    id: it.id, handle: HANDLE[slug] || slug, sourceUrl: 'https://www.incognitomenswear.com' + it.fullUrl,
    title, type, line, fabric, color, colorFamily: family,
    price: +(it.variants?.[0]?.priceMoney?.value || 0),
    description: [blurb, line === 'Hampton' ? HAMP : line === 'Madison' ? MAD : '', type === 'suit' ? SET : JKT].filter(Boolean).join(' '),
    images, alt: { photo: `${title}, shown on a form`, swatch: `Close-up of the ${color} fabric` },
    options: [{ name: 'Size', values: [...new Set(variants.map((v) => v.size))] }].concat(variants.some((v) => v.color) ? [{ name: 'Color', values: [...new Set(variants.map((v) => v.color))] }] : []),
    variants, available: variants.some((v) => v.available),
    hidden: dupe, hiddenReason: dupe ? 'Duplicate of Oatmeal Taupe Madison (sold out)' : undefined,
    confirm, shopifyProductId: null
  });
}

const catalog = {
  currency: 'USD', updated: '2026-11-17',
  source: 'Pulled from incognitomenswear.com/shop (Squarespace). Size labels cleaned; descriptions are drafts until the shop confirms the items in each product’s confirm list.',
  products
};
writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log('products', products.length, 'visible', products.filter((p) => !p.hidden).length, 'images', readdirSync(join(out, 'img')).length);
