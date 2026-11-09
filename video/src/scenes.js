/**
 * Keyhalt film, one function per beat.
 * Dark theme, steel-blue accent, agents frozen on chain.
 */

import {
  frame, text, rect, line, runningHead, easeOut,
  typeSpeed, keyGlyph,
  PANEL, RAISED, INK, INK2, MUTED, LINE, STEEL, STEEL_SOFT, OK, DANGER,
} from './layout.js';

const SANS = 'Liberation Sans';
const SERIF = 'Liberation Serif';
const MONO = 'Liberation Mono';

function caption(t, t0, t1, s, o = {}) {
  const a = easeOut(Math.min(1, Math.max(0, (t - t0) / 0.5)));
  const b = easeOut(Math.min(1, Math.max(0, (t1 - t) / 0.4)));
  return text({ x: o.x ?? 640, y: o.y ?? 676, s, size: o.size ?? 17, family: o.family ?? SANS, fill: o.fill ?? MUTED, anchor: 'middle', opacity: a * b });
}

function panel(x, y, w, h, inner) {
  return rect({ x, y, w, h, r: 10, fill: PANEL, stroke: LINE, sw: 1 }) + (inner ?? '');
}

export function beatBlind(t) {
  const gt = t;
  const backdrops = [0.92, 0.62, 0.3].map((op, i) =>
    text({ x: 640, y: 250 + i * 42, s: i === 0 ? 'Agents ask for keys.' : i === 1 ? 'Nobody can take them back.' : '', size: 30 - i * 2, family: SERIF, weight: 700, fill: INK, anchor: 'middle', opacity: op * Math.min(1, Math.max(0, (gt - i * 0.35) / 0.9)) }));
  const inner = [
    ...backdrops,
    caption(gt, 4.2, 9, 'Three accounts. Six native keys each. No one watching.'),
  ];
  return frame(runningHead(inner, 1), 1280, 720);
}

export function beatFleet(t) {
  const gt = t;
  const a = (d) => easeOut(Math.min(1, Math.max(0, (gt - 9.2 - d) / 0.6)));
  const rows = [
    ['agent-1', 'owner', 'full access', true],
    ['agent-1b', 'operator', 'execute ping', true],
    ['agent-1b', 'operator', 'execute ping', true],
    ['agent-1b', 'operator', 'execute ping', true],
    ['agent-2', 'operator', 'execute ping', true],
    ['agent-3', 'operator', 'execute ping', true],
  ];
  const inner = [
    text({ x: 640, y: 112, s: 'fleet-v03-5cff9e99.testnet', size: 26, family: MONO, weight: 700, fill: INK, anchor: 'middle' }),
    text({ x: 640, y: 140, s: 'Six native keys. Four active operators. One full-access parent.', size: 15, fill: MUTED, anchor: 'middle' }),
    ...rows.map(([agent, role, perm, on], i) => [
      rect({ x: 320, y: 168 + i * 72, w: 640, h: 52, r: 6, fill: RAISED, stroke: LINE, sw: 1, opacity: a(i * 0.18) }),
      text({ x: 352, y: 201 + i * 72, s: agent, size: 16, family: MONO, weight: 700, fill: STEEL, opacity: a(i * 0.18) }),
      text({ x: 560, y: 201 + i * 72, s: role, size: 13, fill: INK2, opacity: a(i * 0.18) }),
      text({ x: 942, y: 201 + i * 72, s: perm, size: 12, family: MONO, fill: MUTED, anchor: 'end', opacity: a(i * 0.18) }),
    ].join('')),
    caption(gt, 12.6, 18, 'Every key can act. None of them asks twice.'),
  ];
  return frame(runningHead(inner, 2), 1280, 720);
}

export function beatFreeze(t) {
  const gt = t;
  const inner = [
    text({ x: 640, y: 108, s: 'One transaction ends it.', size: 30, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    keyGlyph({ x: 618, y: 152, size: 44 }),
    text({ x: 640, y: 250, s: 'keyhalt freeze agent-1b', size: 22, family: MONO, weight: 700, fill: STEEL, anchor: 'middle' }),
    text({ x: 640, y: 300, s: 'Mode A · single admin transaction', size: 13, fill: MUTED, anchor: 'middle' }),
    rect({ x: 384, y: 340, w: 512, h: 56, r: 28, fill: STEEL_SOFT, stroke: STEEL, sw: 1, opacity: easeOut(Math.min(1, Math.max(0, (gt - 20.3) / 0.6))) }),
    text({ x: 640, y: 374, s: "'controller is frozen'", size: 20, family: MONO, weight: 700, fill: STEEL, anchor: 'middle', opacity: easeOut(Math.min(1, Math.max(0, (gt - 20.3) / 0.6))) }),
    caption(gt, 16.4, 28, 'Field: status == frozen on chain, in 5 to 14 seconds.'),
  ];
  return frame(runningHead(inner, 3), 1280, 720);
}

export function beatRefusal(t) {
  const gt = t;
  const a = (d) => easeOut(Math.min(1, Math.max(0, (gt - 28.2 - d) / 0.6)));
  const inner = [
    text({ x: 640, y: 102, s: 'The operator calls anyway.', size: 26, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    rect({ x: 140, y: 148, w: 1000, h: 190, r: 10, fill: PANEL, stroke: LINE, sw: 1 }),
    rect({ x: 140, y: 148, w: 24, h: 190, r: 10, fill: DANGER, opacity: 0.75 }),
    text({ x: 180, y: 188, s: "near contract call-function as-transaction agent-1b ping", size: 14, family: MONO, fill: INK2, opacity: a(0) }),
    text({ x: 180, y: 226, s: "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"error\":{", size: 12, family: MONO, fill: MUTED, opacity: a(0.15) }),
    text({ x: 180, y: 252, s: "\"code\":\"KEYHALT_E_REJECTED\",", size: 15, family: MONO, fill: DANGER, weight: 700, opacity: a(0.25) }),
    text({ x: 180, y: 278, s: "\"refusal\":\"controller is frozen\"", size: 13, family: MONO, fill: DANGER, opacity: a(0.4) }),
    text({ x: 180, y: 306, s: "}}", size: 12, family: MONO, fill: MUTED, opacity: a(0.5) }),
    caption(gt, 29.4, 38, 'Refusal recorded on chain. Derived from the deployed contract, not the docs.'),
  ];
  return frame(runningHead(inner, 4), 1280, 720);
}

export function beatRevoke(t) {
  const gt = t;
  const line = (n, label, delay) => {
    const p = easeOut(Math.min(1, Math.max(0, (gt - delay) / 0.5)));
    return [
      rect({ x: 200 + n * 310, y: 236, w: 260, h: 56, r: 28, fill: n <= 0 ? STEEL_SOFT : PANEL, stroke: n <= 0 ? STEEL : LINE, sw: 1, opacity: p }),
      text({ x: 330 + n * 310, y: 272, s: label, size: 17, family: MONO, weight: 700, fill: n <= 0 ? STEEL : MUTED, anchor: 'middle', opacity: p }),
    ].join('');
  };
  const inner = [
    text({ x: 640, y: 112, s: 'Tag and bulk revoke', size: 26, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    ...[
      'ky: agent-b17 · tag: batch',
      'ky: agent-b17 · tag: batch',
      'ky: agent-b17 · tag: batch',
    ].map((s, i) => text({ x: 470 + i * 160, y: 188, s, size: 11, family: MONO, fill: MUTED, opacity: easeOut(Math.min(1, Math.max(0, (gt - 38.2 - i * 0.18) / 0.4))) })),
    line(0, 'select tag', 38.4),
    line(1, 'one transaction', 38.9),
    line(2, '6 keys gone', 39.4),
    caption(gt, 40.6, 48, 'One tag, six keys, one signature.'),
  ];
  return frame(runningHead(inner, 5), 1280, 720);
}

export function beatRotate(t) {
  const gt = t;
  const inner = [
    text({ x: 640, y: 108, s: 'Rotate the admin. Lose nothing.', size: 28, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    rect({ x: 170, y: 158, w: 420, h: 330, r: 10, fill: PANEL, stroke: LINE, sw: 1 }),
    text({ x: 380, y: 208, s: 'ADMIN', size: 12, family: MONO, weight: 700, fill: MUTED, anchor: 'middle' }),
    text({ x: 380, y: 252, s: 'fleet-v03-5cff9e99', size: 15, family: MONO, fill: INK, anchor: 'middle' }),
    rect({ x: 690, y: 158, w: 420, h: 330, r: 10, fill: PANEL, stroke: STEEL, sw: 1.5 }),
    text({ x: 900, y: 208, s: 'NEW ADMIN', size: 12, family: MONO, weight: 700, fill: STEEL, anchor: 'middle' }),
    text({ x: 900, y: 252, s: 'fleet-v03-8c91bd7a', size: 15, family: MONO, fill: STEEL, anchor: 'middle' }),
    text({ x: 640, y: 360, s: 'accept · cancel · recover', size: 13, family: MONO, fill: MUTED, anchor: 'middle' }),
    text({ x: 640, y: 424, s: 'the old key cannot freeze anyone after it completes', size: 13, family: SANS, fill: MUTED, anchor: 'middle' }),
    caption(gt, 48.6, 56, 'Nominate, accept, cancel or rescue. Any of them in one transaction.'),
  ];
  return frame(runningHead(inner, 6), 1280, 720);
}

export function beatAudit(t) {
  const gt = t;
  const rows = ['provision', 'grant', 'grant', 'execute', 'freeze', 'unfreeze', 'rotate', 'revoke', 'audit set', 'verify'];
  const inner = [
    text({ x: 640, y: 102, s: 'The audit chain.', size: 28, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    panel(150, 140, 980, 440, [
      rows.map((s, i) => [
        text({ x: 200, y: 184 + i * 38, s: String(i + 1).padStart(2, '0'), size: 12, family: MONO, fill: MUTED }),
        text({ x: 246, y: 184 + i * 38, s: s, size: 14, family: MONO, fill: INK2 }),
        text({ x: 1100, y: 184 + i * 38, s: '✓', size: 13, fill: OK, anchor: 'end' }),
      ].join('')).join(''),
      text({ x: 660, y: 536, s: 'SHA-256 linked · verifies on chain and offline', size: 12, family: MONO, fill: STEEL, anchor: 'middle' }),
    ].join('')),
    caption(gt, 57.2, 64, 'Every action is a row. Rows hash into the next. No row can vanish.'),
  ];
  return frame(runningHead(inner, 7), 1280, 720);
}

export function beatNumbers(t) {
  const gt = t;
  const a = (d) => easeOut(Math.min(1, Math.max(0, (gt - 65.4 - d) / 0.6)));
  const inner = [
    text({ x: 640, y: 132, s: 'The evidence, in public', size: 28, family: SERIF, weight: 700, fill: INK, anchor: 'middle' }),
    [[84, 'Rust tests'], [41, 'TypeScript tests'], [7, 'near-workspaces tests'], [98.41, 'mutation score']].map(([n, caption2], i) => [
      text({ x: 380, y: 258 + (i % 2) * 140, s: String(n), size: 74, family: MONO, weight: 700, fill: STEEL, anchor: 'middle', opacity: a(Math.floor(i / 2) * 0.2) }),
      text({ x: 560, y: 258 + (i % 2) * 140, s: caption2, size: 19, weight: 700, fill: INK, opacity: a(Math.floor(i / 2) * 0.2) }),
    ].join('')).join(''),
    caption(gt, 70, 78, 'github.com/unifyWeb3/keyhalt · MIT · testnet-only, unaudited'),
  ];
  return frame(runningHead(inner, 8), 1280, 720);
}

export const SHOTS = [
  { t0: 0, t1: 9, fn: beatBlind },
  { t0: 9, t1: 18, fn: beatFleet },
  { t0: 18, t1: 28, fn: beatFreeze },
  { t0: 28, t1: 38, fn: beatRefusal },
  { t0: 38, t1: 48, fn: beatRevoke },
  { t0: 48, t1: 56, fn: beatRotate },
  { t0: 56, t1: 64, fn: beatAudit },
  { t0: 64, t1: 78, fn: beatNumbers },
];

export function scene(t) {
  const shot = SHOTS.find((s) => t >= s.t0 && t < s.t1) ?? SHOTS[SHOTS.length - 1];
  return shot.fn(t);
}
