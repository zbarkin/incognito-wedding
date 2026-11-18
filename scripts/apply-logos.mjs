// One-off: put the style logos into every page header, inside each style's existing frame
// (Kodak: the double-ruled box and red 1985 tag; Silver Birch: the V mark; Tuxedo Park: the ribbon).
// Run: node scripts/apply-logos.mjs   (safe to run again: it only touches the old wordmarks)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { kodakLogo, birchLogo, parkRibbon } from './logos.mjs';

const KODAK = /(<span style="display:flex; flex-direction:column; align-items:center; border:1px solid (#C9A66B|\{\{t\.brand\}\}); padding:)[^;"]*(;">)\s*<span style="font-family:[^"]*font-size:(\d+)px;[^"]*">INCOGNITO<\/span>\s*<span style="margin-top:[^"]*">MENSWEAR &amp; TUX<\/span>/g;
const BIRCH = /<span style="display:flex; flex-direction:column; gap:\d+px;">\s*<span style="font-weight:600; font-size:(\d+)px; line-height:1; letter-spacing:[^"]*">INCOGNITO<\/span>\s*<span style="font-weight:500;[^"]*">MENSWEAR &amp; TUX · SINCE 1985<\/span>\s*<\/span>/g;
const PARK = /<svg aria-hidden="true" width="(\d+)" height="\d+" viewBox="0 0 420 84">[\s\S]*?INCOGNITO<\/text>\s*<\/svg>\s*<span style="[^"]*Pinyon Script[^"]*">Menswear &amp; Tux<\/span>/g;

let n = 0;
for (const f of readdirSync('designs').filter((x) => x.endsWith('.dc.html'))) {
  if (/^(SilverBirch|TuxedoPark|TuxedoParkBurgundy|KodakKit)\.dc\.html$/.test(f)) continue;   // the style sheets keep their drawn type
  const p = 'designs/' + f;
  const shop = f === 'Shop.dc.html';
  let s = readFileSync(p, 'utf8'), before = s;
  s = s.replace(KODAK, (m, open, c, close, fs) => open + '4px 10px 3px' + close + kodakLogo(Math.round(+fs * 2), shop ? '{{t.text}}' : '#EEE7D9', shop ? '{{t.bar}}' : '#121110'));
  s = s.replace(BIRCH, (m, fs) => birchLogo(Math.round(+fs * 2.3), shop ? '{{t.text}}' : '#F4F1EA', shop ? '{{t.bar}}' : '#0A0A0B'));
  s = s.replace(PARK, (m, w) => parkRibbon(+w >= 250 ? 270 : 190));
  if (s !== before) { writeFileSync(p, s); n++; console.log('logo: ' + f); }
}
console.log(n + ' files');
