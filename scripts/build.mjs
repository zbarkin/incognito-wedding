// Turns every canvas design file in designs/ into a plain page under docs/screens/.
// File names stay the same, so links between screens keep working.
// Run: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screens');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const name of readdirSync(join(root, 'designs')).filter((f) => f.endsWith('.dc.html'))) {
  let html = readFileSync(join(root, 'designs', name), 'utf8');
  html = html.replace(
    '<script src="./support.js"></script>',
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src="../dc-lite.js"></script>'
  );
  writeFileSync(join(out, name), html);
  console.log('built screens/' + name);
}
