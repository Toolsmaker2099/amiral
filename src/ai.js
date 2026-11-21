import { SIZE, FLEET, Engine, pick } from './engine.js';

/* ==========================================================
   2. INTELLIGENCE ARTIFICIELLE — ne voit que ce qu'un joueur
   humain verrait : l'eau, les touchés et les navires coulés.
   ========================================================== */
export const AI = {
  LEVELS: {
    easy:   { label: 'Facile',    desc: 'Tire au hasard, sans stratégie.' },
    medium: { label: 'Moyen',     desc: 'Tire au hasard, puis s\'acharne autour de chaque touché jusqu\'à couler le navire.' },
    hard:   { label: 'Difficile', desc: 'Calcule à chaque tir où vos navires ont le plus de chances de se cacher.' },
  },
  create(level) { return { level, view: new Array(SIZE * SIZE).fill(0), remaining: FLEET.map(f => f.len) }; }, // view: 0 inconnu, 1 eau, 2 touché, 3 coulé
  learn(ai, res) {
    if (!['miss', 'hit', 'sunk'].includes(res.result)) return;
    ai.view[res.r * SIZE + res.c] = res.result === 'miss' ? 1 : 2;
    if (res.result === 'sunk') {
      for (const [r, c] of res.ship.cells) ai.view[r * SIZE + c] = 3;
      const k = ai.remaining.indexOf(res.ship.len);
      if (k >= 0) ai.remaining.splice(k, 1);
    }
  },
  unknown(ai) { const out = []; ai.view.forEach((v, i) => { if (v === 0) out.push([Math.floor(i / SIZE), i % SIZE]); }); return out; },
  choose(ai) {
    if (ai.level === 'easy') return pick(AI.unknown(ai));
    if (ai.level === 'medium') return AI.target(ai) || pick(AI.unknown(ai));
    return AI.density(ai);
  },
  // Mode chasse : prolonge une ligne de touchés, sinon vise autour.
  target(ai) {
    const v = (r, c) => Engine.inBounds(r, c) ? ai.view[r * SIZE + c] : -1;
    const line = [], around = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (v(r, c) !== 2) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (v(r + dr, c + dc) !== 2 && v(r - dr, c - dc) !== 2) continue;
        for (const s of [1, -1]) {
          let k = 1;
          while (v(r + s * dr * k, c + s * dc * k) === 2) k++;
          if (v(r + s * dr * k, c + s * dc * k) === 0) line.push([r + s * dr * k, c + s * dc * k]);
        }
      }
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (v(r + dr, c + dc) === 0) around.push([r + dr, c + dc]);
    }
    return line.length ? pick(line) : around.length ? pick(around) : null;
  },
  // Carte de probabilités : compte toutes les positions encore possibles de chaque navire restant.
  density(ai) {
    const score = new Array(SIZE * SIZE).fill(0);
    const tally = targetMode => {
      let any = false;
      for (const len of ai.remaining) for (let h = 0; h < 2; h++) for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const cells = Engine.cells(len, r, c, !!h);
        let k = 0, ok = true;
        for (const [a, b] of cells) {
          const v = Engine.inBounds(a, b) ? ai.view[a * SIZE + b] : 1;
          if (v === 1 || v === 3) { ok = false; break; }
          if (v === 2) k++;
        }
        if (!ok || (targetMode && !k)) continue;
        const w = targetMode ? Math.pow(10, k) : 1;
        for (const [a, b] of cells) if (ai.view[a * SIZE + b] === 0) { score[a * SIZE + b] += w; any = true; }
      }
      return any;
    };
    if (!(ai.view.includes(2) && tally(true))) { score.fill(0); tally(false); }
    let best = 0, cands = [];
    score.forEach((s, i) => {
      if (ai.view[i] !== 0) return;
      if (s > best) { best = s; cands = [i]; } else if (s === best && s > 0) cands.push(i);
    });
    if (!cands.length) return pick(AI.unknown(ai));
    const i = pick(cands);
    return [Math.floor(i / SIZE), i % SIZE];
  },
};
