/**
 * SVG layout helpers for the SpendGuard film.
 * Everything is deterministic in (t, shot). Units are px at 1280 x 720.
 */

export const FONT = {
  serif: 'Liberation Serif',
  sans: 'Liberation Sans',
  mono: 'Liberation Mono',
};

export const INK = '#eef0f5';
export const INK2 = '#b0b6c4';
export const MUTED = '#6e7484';
export const PAPER = '#0b0d14';
export const PANEL = '#11141c';
export const RAISED = '#1a1e28';
export const PANEL_2 = '#1d2230';
export const LINE = 'rgba(255,255,255,0.08)';
export const STEEL = '#7cb7ff';
export const STEEL_SOFT = 'rgba(124, 183, 255, 0.10)';
export const OK = '#58d69c';
export const WARN = '#e6b45a';
export const DANGER = '#ff8589';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function rect({ x, y, w, h, r = 0, fill = PANEL, stroke = 'none', sw = 1, opacity = 1 }) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}

export function line({ x1, y1, x2, y2, color = LINE, sw = 1, opacity = 1 }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" opacity="${opacity}"/>`;
}

export function text({ x, y, s, size = 20, family = FONT.mono, weight = 400, fill = INK, anchor = 'start', opacity = 1, spacing = 0, style = '' }) {
  const ls = spacing ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${x}" y="${y}" font-family="'${family}'" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls} opacity="${opacity}" style="${style}">${esc(s)}</text>`;
}

export function frame(inner, w = 1280, h = 720) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${PAPER}"/>${inner}</svg>`;
}

/** Key glyph, same as the console favicon. */
export function keyGlyph({ x, y, size = 34, color = STEEL, opacity = 1 }) {
  return [
    `<circle cx="${x + size * 0.28}" cy="${y + size * 0.28}" r="${size * 0.24}" fill="none" stroke="${color}" stroke-width="${Math.max(2, size * 0.09)}" opacity="${opacity}"/>`,
    `<path d="M ${x + size * 0.48} ${y + size * 0.48} L ${x + size * 0.78} ${y + size * 0.78}" stroke="${color}" stroke-width="${Math.max(2, size * 0.095)}" stroke-linecap="round" opacity="${opacity}"/>`,
    `<path d="M ${x + size * 0.66} ${y + size * 0.68} L ${x + size * 0.78} ${y + size * 0.78}" stroke="${color}" stroke-width="${Math.max(1.5, size * 0.065)}" stroke-linecap="round" opacity="${opacity}"/>`,
  ].join('');
}

/** Ledger square glyph, same as the console favicon. */
export function ledgerGlyph({ x, y, size = 34, color = JADE, fg = PAPER, opacity = 1 }) {
  return [
    rect({ x, y, w: size, h: size, r: size * 0.18, fill: color, opacity }),
    rect({ x: x + size * 0.22, y: y + size * 0.31, w: size * 0.56, h: size * 0.075, fill: fg, opacity }),
    rect({ x: x + size * 0.22, y: y + size * 0.465, w: size * 0.56, h: size * 0.075, fill: fg, opacity }),
    rect({ x: x + size * 0.22, y: y + size * 0.62, w: size * 0.56, h: size * 0.075, fill: fg, opacity }),
  ].join('');
}

/** The running head used on every frame after the opening. */
export function runningHead(inner, pageNoOrNull) {
  const left = keyGlyph({ x: 34, y: 24, size: 22 }) + text({ x: 64, y: 41, s: 'Keyhalt', size: 14, weight: 700, fill: INK });
  const right = pageNoOrNull
    ? text({ x: 1246, y: 41, s: `№ ${pageNoOrNull}`, size: 13, fill: MUTED, anchor: 'end' })
    : text({ x: 1246, y: 41, s: 'testnet', size: 13, fill: STEEL, anchor: 'end' });
  return `<g>${left}${right}${line({ x1: 34, y1: 52, x2: 1246, y2: 52, color: LINE, sw: 1 })}${inner}</g>`;
}

/** Eased progress between a and b across [t0, t1]. */
export function ease(t, t0, t1, fn = easeOut) {
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  return fn((t - t0) / (t1 - t0));
}

export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeBack = (x) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** Slide + fade + blur in, a la the console redesign. */
export function reveal(t, t0, t1, { dy = 48, tau = 0.9 } = {}) {
  if (t >= t1) return { dy: 0, opacity: 1, blur: 0 };
  const p = ease(t, t0, t1, easeInOut);
  return { dy: dy * (1 - p), opacity: p, blur: (1 - p) * 8 };
}

/** Type-on: how many characters of s are visible at t. */
export function typed(s, t, t0, t1, cps = 40) {
  if (t <= t0) return '';
  const p = Math.min(1, (t - t0) * (cps / s.length));
  return s.slice(0, Math.ceil(p * s.length * (t1 === t0 ? 1 : 1)));
}

/** Clamped typewriter with a fixed speed in characters per second. */
export function typeSpeed(s, t, t0, cps = 42) {
  if (t <= t0) return '';
  const n = Math.floor((t - t0) * cps);
  return s.slice(0, Math.max(0, Math.min(s.length, n)));
}

export function caret(t, blink = 0.53) {
  return Math.floor(t / blink) % 2 === 0;
}
