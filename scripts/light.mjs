// Light mode: a light copy of every screen, written to docs/screens/light/.
// The screens hard-code their colours, so each style has a colour map. Colours are
// mapped by the CSS property they sit in (backgrounds, text, lines), because the
// same colour can be a background in one place and text in another. Anything not
// in a map falls back to a rule: dark neutrals become the style's paper, light
// text becomes ink, and text that ends up too faint is darkened until it reads.
// SVG attributes and JavaScript data (the suits, swatches and posters) are left alone.
// Used by scripts/build.mjs.

// ---------- colour helpers ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export function parse(c) {
  c = c.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1, hex: true };
  }
  m = c.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1, hex: false };
  }
  return null;
}
const hex2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
function fmt(c, like) {
  if (like && !like.hex) return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+(+c.a).toFixed(3)})`;
  return ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase();
}
function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function hsl(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return { h, s, l };
}
function fromHsl(h, s, l, a = 1) {
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255, a };
}
function darkenTo(c, against, ratio) {
  const x = hsl(c); let l = x.l, out = c;
  while (contrast(out, against) < ratio && l > 0.04) { l -= 0.02; out = fromHsl(x.h, x.s, l, c.a); }
  return out;
}

// ---------- the three light palettes ----------
const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
export const THEMES = {
  kodak: {
    paper: '#F3ECDD', text: '#1E1A15', light: '#FBF7EE',
    bg: P({
      '#121110': '#F3ECDD', '#0c0b0a': '#F3ECDD', '#0b0a09': '#F3ECDD', '#0e0e0e': '#F3ECDD', '#0b0b0c': '#F3ECDD', '#141414': '#F3ECDD', '#000': '#F3ECDD', '#000000': '#F3ECDD', '#0a0807': '#F3ECDD', '#0b0705': '#F3ECDD', '#0b0806': '#F3ECDD',
      '#1a1816': '#FBF7EE', '#15130f': '#FBF7EE', '#16140f': '#FBF7EE', '#1f1c18': '#FBF7EE', '#221f1b': '#F8F2E6', '#1e1a16': '#FBF7EE', '#151311': '#FBF7EE', '#131110': '#FBF7EE', '#16130f': '#FBF7EE', '#1c120e': '#F6EEDF', '#211614': '#F6EEDF',
      '#0f0e0d': '#FFFDF8', '#2a2621': '#EAE0CD', '#2b2620': '#EAE0CD', '#2e2923': '#EAE0CD', '#3a342c': '#E2D6C0',
      '#e86a5e': '#C9503F', '#b8322a': '#B8322A'
    }),
    ink: P({
      '#eee7d9': '#1E1A15', '#f4f1ea': '#1E1A15', '#f3ecdd': '#1E1A15', '#a39a8b': '#655C4F', '#8e8676': '#776E60', '#c9a66b': '#87672F', '#e2c48e': '#87672F',
      '#c29e62': '#87672F', '#d9b37a': '#87672F', '#e86a5e': '#B23F30', '#e7a33e': '#9C5C12', '#d9d2c2': '#3A342C', '#d6d3cc': '#3A342C'
    }),
    line: P({
      '#38322a': '#D5C9B2', '#2a2621': '#E3D9C7', '#2e2923': '#E3D9C7', '#3a322a': '#D5C9B2', '#4a4237': '#C6B89D', '#8c7247': '#B09464', '#c9a66b': '#B08D55', '#e2c48e': '#B08D55', '#c29e62': '#B08D55', '#e86a5e': '#C9503F'
    }),
    vars: P({
      '--kk-bg': '#F3ECDD', '--kk-panel': '#FBF7EE', '--kk-field': '#FFFDF8', '--kk-line': '#D5C9B2', '--kk-hair': 'rgba(30,26,21,.12)',
      '--kk-text': '#1E1A15', '--kk-muted': '#655C4F', '--kk-brass': '#B08A4F', '--kk-brass-hi': '#D3B47C', '--kk-brass-lo': '#87672F',
      '--kk-red': '#B23F30', '--kk-amber': '#B8691C', '--kk-green': '#4F7A43', '--kk-film': '#C08A22', '--kk-edge': '#A57E45', '--kk-mount': '#FFFDF8',
      '--bg': '#F3ECDD', '--panel': '#FBF7EE', '--field': '#FFFDF8', '--line': '#D5C9B2', '--line-soft': '#E3D9C7', '--text': '#1E1A15', '--muted': '#655C4F', '--brass': '#B08A4F', '--brass-lo': '#87672F', '--accent': '#B08A4F'
    })
  },
  birch: {
    paper: '#F4F1EA', text: '#0F0F10', light: '#FBFAF6',
    bg: P({
      '#0a0a0b': '#F4F1EA', '#000': '#F4F1EA', '#000000': '#F4F1EA', '#0b0b0c': '#F4F1EA', '#0b0a09': '#F4F1EA', '#0e0e10': '#F4F1EA', '#141414': '#F4F1EA',
      '#111112': '#FBFAF6', '#161617': '#FBFAF6', '#19191a': '#FBFAF6', '#1e1e20': '#FBFAF6', '#1b1b1d': '#FFFFFF', '#2a2a2d': '#E7E4DC', '#2e2f31': '#E1DED6',
      '#f4f1ea': '#0F0F10', '#fbfaf6': '#0F0F10', '#ffffff': '#0F0F10', '#e6e8e9': '#1B1B1D',
      '#c9a24b': '#A98632', '#e0584c': '#C0473B', '#8f9396': '#8F9396', '#b9bdbf': '#B9BDBF'
    }),
    ink: P({
      '#b9bdbf': '#54585B', '#f4f1ea': '#0F0F10', '#fbfaf6': '#0F0F10', '#ffffff': '#0F0F10', '#e6e8e9': '#0F0F10', '#8f9396': '#6C7073', '#c9a24b': '#8A6B21', '#0a0a0b': '#F4F1EA'
    }),
    line: P({
      '#2e2f31': '#D8D5CD', '#4a4b4e': '#BDBAB2', '#6b6e71': '#9A9DA0', '#8f9396': '#8F9396', '#c9a24b': '#A98632', '#f4f1ea': '#0F0F10', '#b9bdbf': '#9A9DA0', '#0a0a0b': '#F4F1EA'
    }),
    vars: P({
      '--kk-bg': '#F4F1EA', '--kk-panel': '#FBFAF6', '--kk-field': '#FFFFFF', '--kk-line': '#D8D5CD', '--kk-line2': '#BDBAB2', '--kk-rule': '#9A9DA0', '--kk-hair': 'rgba(15,15,16,.1)',
      '--kk-text': '#0F0F10', '--kk-muted': '#54585B', '--kk-dim': '#6C7073', '--kk-brass': '#A98632', '--kk-brass-hi': '#C9A24B', '--kk-brass-lo': '#8A6B21',
      '--kk-red': '#C0473B', '--kk-green': '#0F0F10', '--kk-silver': 'linear-gradient(90deg, #54585B 0%, #0F0F10 45%, #6C7073 100%)'
    })
  },
  park: {
    paper: '#F4EEDF', text: '#1F1A14', light: '#FFFDF8',
    bg: P({
      '#13241d': '#F4EEDF', '#0e1b16': '#FBF7EE', '#0a1410': '#F4EEDF', '#1c3027': '#EDE5D2', '#24372e': '#E7DEC8', '#2f463a': '#DDD2B8', '#000': '#F4EEDF', '#000000': '#F4EEDF', '#0b0a09': '#F4EEDF', '#141414': '#F4EEDF',
      '#17060b': '#F4EEDF', '#270a12': '#FBF7EE', '#3b101c': '#EFE3DA', '#4a1b27': '#E8D8D0', '#0d0a07': '#F4EEDF',
      '#f2ead8': '#FFFDF8', '#ede4cf': '#FBF7EE', '#ffffff': '#FFFFFF',
      '#c6a867': '#1F3D2F', '#d9be82': '#2F5A3F', '#a88b50': '#2F5A3F', '#8f7440': '#1F3D2F'
    }),
    ink: P({
      '#f2ead8': '#1F1A14', '#ede4cf': '#1F1A14', '#a9b39f': '#4E5A4D', '#c7b5a6': '#6A4A4F', '#c6a867': '#2F5A3F', '#d9be82': '#2F5A3F', '#e8d3a2': '#2F5A3F', '#e0a396': '#7B2D26', '#a88b50': '#2F5A3F'
    }),
    line: P({
      '#2f463a': '#CFC3A6', '#4c6656': '#B9AE95', '#5f7064': '#B9AE95', '#0a1410': '#CFC3A6', '#17060b': '#CFC3A6', '#5e2c37': '#C9B0A8', '#7b4753': '#B8958E', '#c6a867': '#A88B50'
    }),
    vars: P({
      '--kk-ground': '#F4EEDF', '--kk-ink': '#1F1A14', '--kk-muted': '#4E463A', '--kk-faint': '#8A8070',
      '--kk-line': '#CFC3A6', '--kk-rule': '#A88B50', '--kk-hair': '#DDD2B8', '--kk-accent': '#2F5A3F', '--kk-gilt': '#A88B50',
      '--kk-alert': '#7B2D26', '--kk-ok': '#2F5A3F', '--kk-tint': 'rgba(47,90,63,.07)', '--kk-placeholder': '#7F7768',
      '--kk-btn-bg': '#1F3D2F', '--kk-btn-fg': '#F4EEDF', '--kk-btn-rule': '#A88B50', '--kk-btn-hover': '#7A1F2E',
      '--kk-off-bg': '#E7DEC8', '--kk-off-fg': '#5A5244', '--kk-track': '#DDD2B8', '--kk-knob': '#FFFDF8'
    })
  }
};

// ---------- mapping ----------
const BG = /^(background|background-color|background-image)$/;
const INK = /^(color|-webkit-text-fill-color|caret-color|fill|stroke)$/;
const LINE = /^(border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|text-decoration|text-decoration-color|column-rule)$/;
const SHADOW = /^(box-shadow|text-shadow|filter)$/;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

function mapOne(t, kind, raw, multi) {
  const c = parse(raw); if (!c) return raw;
  const key = raw.toLowerCase();
  if (c.hex && c.a === 1 && t[kind] && t[kind][key] && !(multi && kind === 'bg' && hsl(c).l > 0.5)) return t[kind][key];
  const x = hsl(c), paper = parse(t.paper);
  if (c.a === 0) return raw;
  const neutral = x.s < 0.45 || x.l < 0.08;
  if (kind === 'shadow') {
    if (x.l < 0.2) return fmt({ r: 60, g: 45, b: 25, a: c.a * 0.35 }, { hex: false });
    return raw;
  }
  if (kind === 'bg') {
    if (c.a < 1) {
      // Tints and glazes: light-on-dark glazes become dark-on-light, dark scrims become paper.
      if (x.l > 0.75) return fmt({ r: 30, g: 26, b: 21, a: c.a * 0.6 }, c);
      if (x.l < 0.15) { const p = parse(t.paper); return fmt({ ...p, a: c.a }, { hex: false }); }
      return raw;
    }
    if (x.l < 0.22 && neutral) { const p = hsl(paper); return fmt(fromHsl(p.h, p.s, clamp(p.l + x.l * 0.25, 0, 0.985))); }
    return raw;
  }
  if (kind === 'line') {
    if (c.a < 1) { if (x.l > 0.6) return fmt({ r: 30, g: 26, b: 21, a: Math.min(1, c.a * 1.1) }, c); return raw; }
    if (x.l < 0.35 && neutral) { const p = hsl(paper); return fmt(fromHsl(p.h, Math.min(p.s, 0.3), 0.78 + (0.35 - x.l) * 0.35)); }
    return raw;
  }
  // ink
  if (c.a < 1) { if (x.l > 0.6) return fmt({ r: 30, g: 26, b: 21, a: c.a }, c); return raw; }
  let out = c;
  if (x.l > 0.6 && x.s < 0.5) { const k = hsl(parse(t.text)); out = fromHsl(k.h, k.s, clamp(0.12 + (1 - x.l) * 0.9, 0.1, 0.45)); }
  return fmt(darkenTo(out, paper, 3.2));
}

function mapValue(t, kind, value) {
  const multi = (value.match(COLOR_RE) || []).length > 1 || /gradient/.test(value);
  return value.replace(COLOR_RE, (m) => mapOne(t, kind, m, multi));
}

function varKind(name) {
  if (/bg|panel|field|ground|track|off-bg|mount|negative|knob|tint/.test(name)) return 'bg';
  if (/line|hair|rule|edge/.test(name)) return 'line';
  return 'ink';
}

// Maps one block of declarations (a style="" value or a CSS rule body).
function mapBlock(t, body, js) {
  let bgSeen = null;
  const decl = js ? /(^|[;\s{'"`])(--[a-z0-9-]+|[a-z-]+)(\s*:\s*)([^;]*)/g : /(^|[;\s{])(--[a-z0-9-]+|[a-z-]+)(\s*:\s*)([^;]*)/g;
  const outBody = body.replace(decl, (all, pre, prop, sep, val) => {
    const p = prop.toLowerCase();
    if (p === 'color-scheme') return pre + prop + sep + val.replace(/dark/, 'light');
    if (!COLOR_RE.test(val)) { COLOR_RE.lastIndex = 0; return all; }
    COLOR_RE.lastIndex = 0;
    let nv = val;
    if (p.startsWith('--')) nv = t.vars[p] || mapValue(t, varKind(p), val);
    else if (BG.test(p)) { nv = mapValue(t, 'bg', val); const cs = nv.match(COLOR_RE); if (cs && cs.length === 1) bgSeen = parse(cs[0]); }
    else if (INK.test(p)) { if (js && /^(fill|stroke)$/.test(p)) return all; nv = mapValue(t, 'ink', val); }
    else if (LINE.test(p)) nv = mapValue(t, 'line', val);
    else if (SHADOW.test(p)) nv = /inset 0 0 0/.test(val) ? mapValue(t, 'bg', val) : mapValue(t, 'shadow', val);
    else return all;
    return pre + prop + sep + nv;
  });
  if (js || !bgSeen || bgSeen.a < 1) return outBody;
  // Text on a fill set in the same block: make sure it still reads against the new fill.
  return outBody.replace(/(^|[;\s])(color\s*:\s*)(#[0-9a-fA-F]{3,6}\b)/g, (all, pre, sep, col) => {
    const c = parse(col);
    if (contrast(c, bgSeen) >= 3) return all;
    const a = parse(t.text), b = parse(t.paper);
    return pre + sep + fmt(contrast(a, bgSeen) > contrast(b, bgSeen) ? a : b);
  });
}

export function lightCss(t, css) {
  return css.replace(/\{([^{}]*)\}/g, (all, body) => '{' + mapBlock(t, body) + '}');
}

export function lightHtml(t, html) {
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (a, o, css, c) => o + lightCss(t, css) + c);
  html = html.replace(/(\sstyle=")([^"]*)(")/g, (a, o, body, c) => o + mapBlock(t, body) + c);
  // Component scripts: style objects per theme, colour-valued keys, and style strings built in code.
  html = html.replace(/(<script type="text\/x-dc"[^>]*>)([\s\S]*?)(<\/script>)/g, (a, o, js, c) => o + lightScript(t, js) + c);
  // Tuxedo Park: headings take the accent colour.
  if (t.headings) html = html.replace('</head>', '<style>h1,h2{color:' + t.headings + ' !important}</style>\n</head>');
  return html;
}

export const themeOf = (name) => (/Birch/.test(name) ? 'birch' : /Burgundy/.test(name) ? 'parkb' : /Park/.test(name) ? 'park' : 'kodak');

// The Burgundy colourway of Tuxedo Park: the same stationery, with burgundy where green leads.
const swap = (o) => JSON.parse(JSON.stringify(o).replace(/#1F3D2F/g, '#5E1F2A').replace(/#2F5A3F/g, '#7A1F2E').replace(/rgba\(47,90,63,/g, 'rgba(122,31,46,'));
THEMES.parkb = swap(THEMES.park);
THEMES.park.headings = '#1F3D2F';
THEMES.parkb.headings = '#5E1F2A';

// ---------- themed components ----------
// Shared components (the map, the shop, the prom pages) keep each style's colours in a
// script object, kodak: { bg: '#121110', text: '#EEE7D9', ... }. Those keys are mapped by name.
const JS_BG = /^(bg|bar|panel|card|field|stage|score|mapBg|btnBg)$/;
const JS_INK = /^(text|muted|brand|brandDim|red|desc|note|disabled|headColor|cardText|cardMuted|cardAccent|alert|btnFg)$/;
const JS_LINE = /^(line|line2|border|fieldLine|ring|filled)$/;
const MAP_FILTER = {
  parkb: 'sepia(.6) saturate(.75) hue-rotate(-12deg) contrast(.95)',
  kodak: 'sepia(.45) saturate(.8) contrast(.95)',
  birch: 'grayscale(1) contrast(.95) brightness(1.02)',
  park: 'sepia(.55) saturate(.7) contrast(.95)'
};
function mapJsTheme(t, k, body) {
  const out = body.replace(/(\b[a-zA-Z0-9]+)(\s*:\s*)'([^']*)'/g, (all, key, sep, val) => {
    const v = val;
    if (key === 'scheme') return key + sep + "'light'";
    if (key === 'filter') return key + sep + "'" + MAP_FILTER[k] + "'";
    if (!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(v)) return all;
    let nv;
    if (key === 'accent') nv = t.vars['--kk-accent'] || t.vars['--kk-brass'] || v;
    else if (JS_BG.test(key)) nv = mapValue(t, 'bg', v);
    else if (JS_INK.test(key)) nv = mapValue(t, 'ink', v);
    else if (JS_LINE.test(key)) nv = mapValue(t, 'line', v);
    else if (key === 'shadow' || key === 'innerShadow') nv = /inset 0 0 0/.test(v) ? mapValue(t, 'bg', v) : mapValue(t, 'shadow', v);
    else if (key === 'border') nv = mapValue(t, 'line', v);
    else return all;
    return key + sep + "'" + nv + "'";
  });
  // Text that sits on the accent: pick whichever of ink or paper reads best on the new accent.
  const acc = (out.match(/\baccent\s*:\s*'(#[0-9A-Fa-f]{6})'/) || [])[1];
  if (!acc) return out;
  const a = parse(acc), ink = parse(t.text), paper = parse(t.paper);
  const on = fmt(contrast(ink, a) >= contrast(paper, a) ? ink : paper);
  return out.replace(/\b(onAccent\s*:\s*)'[^']*'/g, "$1'" + on + "'");
}
const K_BG = /^(bg|bar|panel|card|field|stage|score|mapBg|track|button)$|Bg$/;
const K_INK = /^(fg|text|muted|ink|icon|sub|brand|brandDim|red|alert|note|desc|disabled|grey|lamp)$|(Fg|Color|Text|Muted|Accent)$/;
const K_LINE = /^(bd|line|fieldLine|ring|filled|rim|edge|inner|outer)$|Bd$/;
function lightScript(t, js) {
  const keep = [];
  js = lightJs(js);
  // Theme objects were mapped by lightJs; park them so nothing maps them twice.
  js = js.replace(/^(\s*)(kodak|birch|park|parkb)(\s*:\s*\{)([\s\S]*?)^\1\}/gm, (all) => { keep.push(all); return '\u0000' + (keep.length - 1) + '\u0000'; });
  js = js.replace(/(\b[a-zA-Z]+)(\s*:\s*)([^,\n{}]*?'(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))'[^,\n{}]*)/g, (all, key, sep, expr) => {
    const kind = K_BG.test(key) ? 'bg' : K_INK.test(key) ? 'ink' : K_LINE.test(key) ? 'line' : key === 'accent' ? 'accent' : null;
    if (!kind) return all;
    return key + sep + expr.replace(/'(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))'/g, (q, col) => "'" + (kind === 'accent' ? (t.vars['--kk-accent'] || t.vars['--kk-brass']) : mapOne(t, kind, col, false)) + "'");
  });
  js = mapBlock(t, js, true);
  return js.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
export function lightJs(html) {
  return html.replace(/^(\s*)(kodak|birch|park|parkb)(\s*:\s*\{)([\s\S]*?)^\1\}/gm, (all, ind, k, open, body) => {
    const key = k;
    return ind + k + open + mapJsTheme(THEMES[key], key, body) + ind + '}';
  });
}
