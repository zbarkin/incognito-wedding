// Shows how our catalog lines up with the shop's BridalLive inventory: which sizes are linked to
// a BridalLive item, which aren't, and which BridalLive items nothing on the website points at.
//
//   node scripts/bridallive-match.mjs                     against the stand-in (mock) BridalLive
//   BRIDALLIVE_BASE=https://qa.bridallive.com/bl-server \
//   BRIDALLIVE_RETAILER_ID=... BRIDALLIVE_API_KEY=... node scripts/bridallive-match.mjs
//
// Writes the full list to server/.reports/match.json (kept out of git: it holds the shop's data).
// Fix what doesn't match in server/bridallive-map.json, then run it again.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { bridalLiveClient } from '../server/bridallive.mjs';
import { mockBridalLive } from '../server/mock-bridallive.mjs';
import { matchCatalog, stockOf } from '../server/match.mjs';

try { process.loadEnvFile('.env'); } catch { /* no .env: mock */ }
const catalog = JSON.parse(await readFile('docs/shop/catalog.json', 'utf8'));
const map = JSON.parse(await readFile('server/bridallive-map.json', 'utf8').catch(() => '{}'));
const client = process.env.BRIDALLIVE_API_KEY ? bridalLiveClient() : mockBridalLive(catalog);
const items = await client.listItems();
const { links, missing } = matchCatalog(catalog, items, map);
const used = new Set([...links.values()].map((i) => i.id));
const unused = items.filter((i) => !used.has(i.id));

console.log('BridalLive: ' + (client.base || 'mock') + ' · ' + items.length + ' items');
console.log('Linked sizes: ' + links.size + ' of ' + (links.size + missing.length));
const byProduct = {};
for (const m of missing) (byProduct[m.handle] = byProduct[m.handle] || { ...m, sizes: [] }).sizes.push(m.size + (m.color ? ' ' + m.color : ''));
for (const p of Object.values(byProduct)) {
  console.log('  not linked: ' + p.title + (p.productFound ? '' : '  (no BridalLive item with this name: add it to "products" in the map)') + '\n    sizes: ' + p.sizes.join(', '));
}
if (unused.length) {
  console.log('BridalLive items the website doesn’t use: ' + unused.length);
  for (const i of unused.slice(0, 25)) console.log('  #' + i.id + ' ' + i.name + ' · ' + (i.size || '-') + (i.color ? ' · ' + i.color : '') + ' · in stock ' + stockOf(i));
  if (unused.length > 25) console.log('  …and ' + (unused.length - 25) + ' more (see the report)');
}
await mkdir('server/.reports', { recursive: true });
await writeFile('server/.reports/match.json', JSON.stringify({ when: new Date().toISOString(), base: client.base || 'mock', linked: links.size, missing, unused: unused.map((i) => ({ id: i.id, name: i.name, size: i.size, color: i.color, stock: stockOf(i) })) }, null, 1));
console.log('Full list: server/.reports/match.json');
