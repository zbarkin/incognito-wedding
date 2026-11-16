// Turns the canvas design files in designs/ into plain pages under docs/styles/.
// Run: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'styles');
mkdirSync(out, { recursive: true });

const pages = [
  { from: 'Main.dc.html', to: 'kodak.html' },
  { from: 'SilverBirchSignup.dc.html', to: 'silver-birch.html' },
  { from: 'TuxedoParkSignup.dc.html', to: 'tuxedo-park-green.html' },
  { from: 'TuxedoParkBurgundySignup.dc.html', to: 'tuxedo-park-burgundy.html' }
];

for (const p of pages) {
  let html = readFileSync(join(root, 'designs', p.from), 'utf8');
  html = html.replace('<script src="./support.js"></script>', '<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src="../dc-lite.js"></script>');
  // Other canvas screens aren't in this preview, so links to them go nowhere.
  html = html.replace(/href="[^"]*\.dc\.html"/g, 'href="#"');
  writeFileSync(join(out, p.to), html);
  console.log('built styles/' + p.to);
}
