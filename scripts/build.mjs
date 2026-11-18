// Turns every canvas design file in designs/ into a plain page under docs/screens/.
// File names stay the same, so links between screens keep working.
// Run: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, themeOf, lightHtml, lightCss, lightJs } from './light.mjs';

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

  // Light copy: one folder down, so paths that climb out of screens/ climb one more.
  if (name === 'Present.dc.html') continue;
  let lite = lightHtml(THEMES[themeOf(name)], html)
    .replace(/(["'(])\.\.\//g, '$1../../')
    .replace(/(kodak|birch|park)-kit\.css/g, '$1-kit.light.css');
  mkdirSync(join(out, 'light'), { recursive: true });
  writeFileSync(join(out, 'light', name), lite);
}

for (const k of ['kodak', 'birch', 'park']) {
  const css = readFileSync(join(root, 'docs', k + '-kit.css'), 'utf8');
  writeFileSync(join(root, 'docs', k + '-kit.light.css'), lightCss(THEMES[k], css));
}
console.log('built light copies in screens/light/');
