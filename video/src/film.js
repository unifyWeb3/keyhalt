import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scene, SHOTS } from './scenes.js';

const W = 1280, H = 720, FPS = 30, DUR = SHOTS[SHOTS.length - 1].t1;
const OUT = process.argv[2] ?? '/home/unify/near/keyhalt/video/out/frames';
// Do not wipe the output directory; PNG frames from prior runs are kept intentionally.
mkdirSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
const total = DUR * FPS;
for (let i = 0; i < total; i += 1) {
  const t = i / FPS;
  writeFileSync(join(OUT, `f${String(i).padStart(5, '0')}.svg`), scene(t));
}
console.log('done', total, 'frames');
