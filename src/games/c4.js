// Puissance 4 : plateau en plastique bleu, jetons jaunes et rouges.
import { c4 as rules, W, H } from '../../shared/c4.js';

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const dropRow = (b, c) => { for (let r = H - 1; r >= 0; r--) if (b[r * W + c] === null) return r; return -1; };
function winAt(b, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr * W + cc] === p) { n++; rr += dr * s; cc += dc * s; } }
    if (n >= 4) return true;
  }
  return false;
}
function evalBoard(b, p) {
  let s = 0;
  for (let r = 0; r < H; r++) { const v = b[r * W + 3]; if (v === p) s += 3; else if (v !== null) s -= 3; }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= H || ec < 0 || ec >= W) continue;
    let me = 0, op = 0, em = 0;
    for (let k = 0; k < 4; k++) { const v = b[(r + dr * k) * W + c + dc * k]; if (v === null) em++; else if (v === p) me++; else op++; }
    if (me && op) continue;
    if (me === 3) s += 6; else if (me === 2) s += 2;
    if (op === 3) s -= 5; else if (op === 2) s -= 2;
  }
  return s;
}
function nm(b, depth, alpha, beta, p) {
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    const r = dropRow(b, c); if (r < 0) continue;
    any = true; b[r * W + c] = p;
    let sc;
    if (winAt(b, r, c, p)) sc = 100000 + depth;
    else if (depth <= 1) sc = evalBoard(b, p);
    else sc = -nm(b, depth - 1, -beta, -alpha, 1 - p);
    b[r * W + c] = null;
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}
function aiMove(state, level) {
  const b = state.board.slice(), p = state.turn, free = ORDER.filter(c => b[c] === null);
  if (level === 'easy' && Math.random() < .4) return { c: free[Math.floor(Math.random() * free.length)] };
  const depth = level === 'easy' ? 2 : level === 'medium' ? 4 : 7;
  let best = -Infinity, moves = [];
  for (const c of free) {
    const r = dropRow(b, c); b[r * W + c] = p;
    const sc = winAt(b, r, c, p) ? 100000 + depth : depth <= 1 ? evalBoard(b, p) : -nm(b, depth - 1, -Infinity, Infinity, 1 - p);
    b[r * W + c] = null;
    if (sc > best) { best = sc; moves = [c]; } else if (sc === best) moves.push(c);
  }
  return { c: moves[Math.floor(Math.random() * moves.length)] };
}

let cols = [], prev = null;
export default {
  id: 'c4', theme: 'c4', rules, solo: 'ai',
  title: ['Puissance', '4'], tagline: 'Alignez quatre jetons',
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'medium', label: 'Moyen' }, { id: 'hard', label: 'Fort' }], defaultLevel: 'medium',
  badge: seat => `<i class="disc d${seat}"></i>`,
  aiMove, aiDelay: () => 650,
  reset() { prev = null; },
  mount(stage, api) {
    stage.innerHTML = `<div class="c4-board">${Array.from({ length: W }, (_, c) =>
      `<button type="button" class="c4-col" data-c="${c}" aria-label="Colonne ${c + 1}">${Array.from({ length: H }, () => '<span class="hole"><i class="disc"></i></span>').join('')}</button>`).join('')}</div>`;
    cols = [...stage.querySelectorAll('.c4-col')];
    stage.addEventListener('click', e => { const b = e.target.closest('.c4-col'); if (b && !b.disabled) api.play({ c: +b.dataset.c }); });
  },
  render(stage, v, ctx) {
    const win = new Set(v.result?.line || []);
    cols.forEach((col, c) => {
      const holes = col.children;
      let full = true;
      for (let r = 0; r < H; r++) {
        const val = v.board[r * W + c], d = holes[r].firstChild;
        if (val === null) full = false;
        const cls = 'disc' + (val === null ? '' : ' d' + val) + (win.has(r * W + c) ? ' win' : '');
        const isNew = val !== null && prev && prev[r * W + c] === null;
        if (d.className.replace(' drop', '') !== cls || isNew) {
          d.className = cls + (isNew ? ' drop' : '');
          d.style.setProperty('--fall', r + 1);
        }
      }
      col.disabled = !ctx.interactive || full;
      col.classList.toggle('me' + ctx.seat, !col.disabled);
    });
    prev = v.board.slice();
  },
};
