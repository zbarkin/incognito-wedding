// The three style logos (from the shop's own artwork), drawn as inline SVG so each page can colour
// them for its background. The type is live text in the logos' own fonts (Norman, Cesso, Vivaldi):
// the red tie, the collar and the white ampersand on the tie are shapes.
// Used by scripts/apply-logos.mjs, which puts them inside each style's existing frame.

const TIE = '<polygon fill="#7A1318" points="{a}"></polygon><polygon fill="#7A1318" points="{b}"></polygon>';
const tie = (a, b) => TIE.replace('{a}', a).replace('{b}', b);

// ink: the type colour (a style colour, so light mode remaps it); gap: the background colour that
// the white collar cut-outs show (a --lg-bg custom property, so light mode remaps it too).
export function kodakLogo(h, ink, gap) {
  const f = "font-family:Norman, norman, norman-stencil, Rokkitt, serif; font-weight:700;";
  return `<svg role="img" aria-label="Incognito Menswear and Tux Shop" viewBox="0 0 505 136.55" style="display:block; height:${h}px; width:auto; overflow:visible; --lg-bg:${gap};">`
    + `<text transform="translate(0 73.4) scale(1.14 1)" style="fill:${ink}; ${f} font-size:79.08px;"><tspan x="0" y="0" xml:space="preserve">INCOGN   </tspan><tspan x="326.98" y="0">T</tspan><tspan x="369.07" y="0">O</tspan></text>`
    + tie('337.76 5.55 362.94 5.55 350.35 17.74 337.76 5.55', '348.44 129.9 337.76 91.57 350.48 17.74 360.14 95.01 348.44 129.9')
    + `<polygon style="fill:${ink};" points="324.34 6.25 311.12 27.08 311.3 5.55 324.34 6.25"></polygon>`
    + `<polygon style="fill:var(--lg-bg);" points="392.7 2.15 371.47 28.62 372.6 1.8 392.7 2.15"></polygon>`
    + `<polygon style="fill:${ink};" points="372.49 5.48 376.99 22.74 390.03 6.22 372.49 5.48"></polygon>`
    + `<polygon style="fill:var(--lg-bg);" points="367.59 31.84 390.03 11.65 389.33 26.52 367.59 31.84"></polygon>`
    + `<text transform="translate(229.02 98.2)" style="fill:${ink}; ${f} font-size:24px;"><tspan x="0" y="0">Mens</tspan><tspan x="49.57" y="0">w</tspan><tspan x="67.27" y="0">ear</tspan><tspan x="139.01" y="0" style="letter-spacing:-.04em;">T</tspan><tspan x="151.06" y="0">ux Shop</tspan></text>`
    + `<text transform="translate(343.64 99.3)" fill="#FFFFFF" font-family="Norman, norman, norman-stencil, Rokkitt, serif" font-weight="700" font-size="18">&amp;</text>`
    + `</svg>`;
}

export function birchLogo(h, ink, gap) {
  const f = "font-family:cesso, Plaster, Jost, sans-serif;";
  return `<svg role="img" aria-label="Incognito Menswear and Tux Shop" viewBox="-4 0 539 141.51" style="display:block; height:${h}px; width:auto; overflow:visible; --lg-bg:${gap};">`
    + `<text transform="translate(0 69.19) scale(1.14 1)" style="fill:${ink}; ${f} font-size:79.08px; letter-spacing:-.04em; white-space:pre;" xml:space="preserve">INCOGN   TO</text>`
    + tie('357.86 10.51 383.03 10.51 370.44 22.7 357.86 10.51', '368.54 134.86 357.86 96.53 370.57 22.7 380.23 99.97 368.54 134.86')
    + `<polygon style="fill:${ink};" points="335.31 9.94 321.65 31.46 321.83 9.94 335.31 9.94"></polygon>`
    + `<polygon style="fill:var(--lg-bg);" points="412.79 7.11 391.56 33.58 392.7 6.76 412.79 7.11"></polygon>`
    + `<polygon style="fill:${ink};" points="399.94 9.94 410.51 30.21 423.55 9.94 399.94 9.94"></polygon>`
    + `<text transform="translate(237.19 102.61)" style="fill:${ink}; ${f} font-size:24px;"><tspan x="0" y="0">Mens</tspan><tspan x="63.29" y="0" style="letter-spacing:-.05em;">w</tspan><tspan x="80.28" y="0">ear</tspan><tspan x="152.16" y="0" style="letter-spacing:-.05em;">T</tspan><tspan x="165.07" y="0">ux Shop</tspan></text>`
    + `<text transform="translate(362.4 101.36)" fill="#FFFFFF" font-family="cesso, Plaster, Jost, sans-serif" font-size="18">&amp;</text>`
    + `</svg>`;
}

// Tuxedo Park: the logo sits inside the cream ribbon, which is taller now so the whole lockup fits.
export function parkRibbon(w) {
  const R = 356, X = 80, RX = X + R, VW = R + 160;           // ribbon face width, left edge, right edge, canvas width
  const h = Math.round(w * 200 / VW);
  const f = "vivaldi-mn, 'Playfair Display', Georgia, serif";
  const ls = (v) => ` letter-spacing="${v}em"`;
  return `<svg role="img" aria-label="Incognito Menswear and Tux Shop" width="${w}" height="${h}" viewBox="0 0 ${VW} 200">`
    + `<path d="M112 46 L16 46 L44 112 L16 178 L112 178 Z" fill="#D9CDB0" stroke="#1F1A14" stroke-width="1.6" stroke-linejoin="round"></path>`
    + `<path d="M${RX - 32} 46 L${RX + 64} 46 L${RX + 36} 112 L${RX + 64} 178 L${RX - 32} 178 Z" fill="#D9CDB0" stroke="#1F1A14" stroke-width="1.6" stroke-linejoin="round"></path>`
    + `<rect x="${X}" y="8" width="${R}" height="160" fill="#F2EAD8" stroke="#1F1A14" stroke-width="1.6"></rect>`
    + `<path d="M${X} 168 L${X + 32} 168 L${X + 32} 178 Z" fill="#1F1A14"></path><path d="M${RX} 168 L${RX - 32} 168 L${RX - 32} 178 Z" fill="#1F1A14"></path>`
    + `<rect x="${X + 8}" y="16" width="${R - 16}" height="144" fill="none" stroke="#1F1A14" stroke-width="1"></rect>`
    + `<svg x="${X + 20}" y="20" width="${R - 40}" height="136" viewBox="-8 -14 422 186">`
    + `<text transform="translate(.91 88.62) scale(.72 1)" fill="#1F1A14" font-family="${f}" font-size="106"><tspan x="0" y="0"${ls(.06)}>I</tspan><tspan x="105.05" y="0"${ls(.07)}>n</tspan><tspan x="165.57" y="0"${ls(.05)}>co</tspan><tspan x="258.43" y="0"${ls(.06)}>g</tspan><tspan x="320.65" y="0"${ls(.1)}>n</tspan><tspan x="420.4" y="0"${ls(.07)}>t</tspan><tspan x="460.89" y="0"${ls(.1)}>o</tspan></text>`
    + `<text transform="translate(174.21 134.97)" fill="#1F1A14" font-family="${f}" font-size="24"><tspan x="0" y="0"${ls(-.04)}>M</tspan><tspan x="31.7" y="0"${ls(-.04)}>e</tspan><tspan x="40.7" y="0">n</tspan><tspan x="52.49" y="0">s</tspan><tspan x="60.74" y="0"${ls(-.04)}>w</tspan><tspan x="74.11" y="0"${ls(-.05)}>e</tspan><tspan x="82.78" y="0"${ls(-.02)}>a</tspan><tspan x="94.18" y="0">r</tspan><tspan x="132" y="0">T</tspan><tspan x="146.37" y="0"${ls(-.04)}>u</tspan><tspan x="157.34" y="0">x S</tspan><tspan x="203.61" y="0"${ls(-.03)}>ho</tspan><tspan x="222.88" y="0">p</tspan></text>`
    + tie('276.1 46.36 301.27 46.36 288.69 58.55 276.1 46.36', '286.78 170.71 276.1 132.38 288.81 58.55 298.48 135.82 286.78 170.71')
    + `<text transform="translate(281.98 135.04)" fill="#FFFFFF" font-family="${f}" font-size="18">&amp;</text>`
    + `</svg></svg>`;
}
