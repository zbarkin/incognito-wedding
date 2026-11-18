// Re-draws the logos already placed by apply-logos.mjs, after a change to scripts/logos.mjs.
// Run: node scripts/reapply-logos.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { kodakLogo, birchLogo, parkRibbon } from './logos.mjs';
const SVG = /<svg role="img" aria-label="Incognito Menswear and Tux Shop"[^>]*>[\s\S]*?<\/svg>(<\/svg>)?/g;
for (const f of readdirSync('designs').filter((x) => x.endsWith('.dc.html'))) {
  const p = 'designs/' + f; let s = readFileSync(p, 'utf8'); const before = s;
  s = s.replace(SVG, (m) => {
    const h = +((m.match(/height:(\d+)px/) || [])[1] || 0), w = +((m.match(/ width="(\d+)"/) || [])[1] || 0);
    const ink = (m.match(/fill:([^;]+);/) || [])[1], gap = (m.match(/--lg-bg:([^;"]+);/) || [])[1];
    if (/viewBox="0 0 (583\.5|505) /.test(m)) return kodakLogo(h, ink, gap);
    if (/viewBox="(0 0 602\.26|-4 0 539) /.test(m)) return birchLogo(h, ink, gap);
    if (/Vivaldi|vivaldi/.test(m)) return parkRibbon(w >= 250 ? 260 : 180);
    return m;
  });
  if (s !== before) { writeFileSync(p, s); console.log('logo: ' + f); }
}
