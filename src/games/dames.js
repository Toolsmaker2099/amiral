// Dames : plateau en bois ciré, pions ivoire et ébène. Prise obligatoire (ou non), soufflé en option.
import { dames as rules, legalMoves, step } from '../../shared/dames.js';

const owner = v => (v === 0 ? null : v <= 2 ? 0 : 1);
const isKing = v => v === 2 || v === 4;

/* ----- Ordinateur ----- */
function evalBoard(b, seat) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue;
    const o = owner(v), r = (i / 8) | 0, c = i % 8;
    let val = isKing(v) ? 320 : 100 + (o === 0 ? 7 - r : r) * 4;
    val += (3.5 - Math.abs(c - 3.5)) * 1.5;            // le centre vaut un peu plus
    s += o === seat ? val : -val;
  }
  return s;
}
function search(s, depth, alpha, beta) {
  const moves = legalMoves(s);
  if (!moves.length) return -50000 - depth;
  if (depth === 0) return evalBoard(s.b, s.turn);
  moves.sort((a, b) => b.caps.length - a.caps.length);
  let best = -Infinity;
  for (const mv of moves) {
    const sc = -search(step(s, mv), depth - 1, -beta, -alpha);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function aiMove(state, level) {
  // Soufflé : l'ordinateur ne fait pas de faute, mais souffle volontiers celles de l'adversaire (une dame de préférence).
  if (state.huff && state.huff.seat !== state.turn) {
    const sq = [...state.huff.sqs].sort((a, b) => (isKing(state.b[b]) ? 1 : 0) - (isKing(state.b[a]) ? 1 : 0))[0];
    return { huff: sq };
  }
  const s = { b: state.b, turn: state.turn, capture: state.capture }, moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'easy' && Math.random() < .5) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === 'easy' ? 1 : level === 'medium' ? 3 : 5;
  let best = -Infinity, pick = [];
  for (const mv of moves) {
    const sc = -search(step(s, mv), depth - 1, -Infinity, Infinity);
    if (sc > best + 1e-9) { best = sc; pick = [mv]; } else if (Math.abs(sc - best) < 1e-9) pick.push(mv);
  }
  return pick[Math.floor(Math.random() * pick.length)];
}

/* ----- Affichage ----- */
let sqs = [], sel = null, last = { b: null, seat: 0 }, api = null;

function showMoves(v, ctx) { return ctx.interactive ? legalMoves({ b: v.b, turn: ctx.seat, capture: v.capture, souffle: v.souffle }) : []; }
const huffSet = (v, ctx) => new Set(ctx.interactive && v.huff && v.huff.seat !== ctx.seat ? v.huff.sqs : []);

export default {
  id: 'dames', theme: 'dames', rules, solo: 'ai',
  title: ['Dames', ''], tagline: 'Prises obligatoires',
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'medium', label: 'Moyen' }, { id: 'hard', label: 'Fort' }], defaultLevel: 'medium',
  defaultOptions: { capture: true },
  options: [
    { id: 'capture', label: 'Prise obligatoire', hint: 'Si une prise est possible, il faut la jouer, et choisir celle qui prend le plus de pièces.' },
    { id: 'souffle', label: 'Soufflé', hint: 'On peut oublier de prendre, mais l\'adversaire peut alors retirer (souffler) le pion qui aurait dû prendre. Il faut que la prise obligatoire soit cochée.' },
  ],
  badge: seat => `<i class="pc p${seat}"></i>`,
  aiMove, aiDelay: () => 550,
  reset() { sel = null; last = { b: null, seat: 0 }; },
  mount(stage, a) {
    api = a;
    stage.innerHTML = '<div class="dm-board" role="grid" aria-label="Damier"></div>';
    const board = stage.firstChild;
    sqs = [];
    for (let i = 0; i < 64; i++) {
      const sq = document.createElement('button');
      sq.type = 'button'; sq.className = 'sq ' + (((i / 8 | 0) + i % 8) % 2 ? 'dark' : 'light'); sq.dataset.i = i;
      if (!(((i / 8 | 0) + i % 8) % 2)) sq.tabIndex = -1;
      sq.innerHTML = '<i class="pc"></i>';
      board.appendChild(sq); sqs.push(sq);
    }
    board.addEventListener('click', e => {
      const el = e.target.closest('.sq'); if (!el || !last.ctx) return;
      const i = +el.dataset.i, { v, ctx } = last;
      const hs = huffSet(v, ctx);
      if (hs.has(i)) { sel = null; api.play({ huff: i }); return; }
      const moves = showMoves(v, ctx);
      if (!moves.length) return;
      if (sel !== null) {
        const hit = moves.filter(m => m.path[0] === sel && m.path[m.path.length - 1] === i);
        if (hit.length) { sel = null; api.play({ path: hit[0].path }); return; }
      }
      sel = moves.some(m => m.path[0] === i) && sel !== i ? i : null;
      api.rerender();
    });
  },
  render(stage, v, ctx) {
    last = { ...last, v, ctx };
    const flip = ctx.seat === 1;
    const board = stage.firstChild;
    board.classList.toggle('flip', flip);
    const moves = showMoves(v, ctx);
    if (!ctx.interactive) sel = null;
    const movable = new Set(moves.map(m => m.path[0])), huffs = huffSet(v, ctx);
    const dests = new Set(sel === null ? [] : moves.filter(m => m.path[0] === sel).map(m => m.path[m.path.length - 1]));
    const lastSet = new Set(v.last ? [v.last[0], v.last[v.last.length - 1]] : []);
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k, sq = sqs[k], val = v.b[i];
      sq.dataset.i = i;
      const pc = sq.firstChild;
      pc.className = 'pc' + (val ? ' p' + owner(val) + (isKing(val) ? ' k' : '') : ' none');
      sq.classList.toggle('sel', sel === i);
      sq.classList.toggle('dest', dests.has(i));
      sq.classList.toggle('last', lastSet.has(i));
      sq.classList.toggle('can', ctx.interactive && movable.has(i) && sel === null);
      sq.classList.toggle('huff', huffs.has(i));
      sq.disabled = !(ctx.interactive && (movable.has(i) || dests.has(i) || huffs.has(i)));
      sq.setAttribute('aria-label', 'Case ' + 'ABCDEFGH'[i % 8] + (8 - ((i / 8) | 0)) + (val ? (owner(val) === ctx.seat ? ', votre pièce' : ', pièce adverse') : ''));
    }
  },
  statusText(v, ctx) {
    if (ctx.over) return null;
    if (ctx.interactive) {
      if (v.huff && v.huff.seat !== ctx.seat) return 'Votre adversaire a oublié de prendre : soufflez le pion marqué, ou jouez';
      const caps = legalMoves({ b: v.b, turn: ctx.seat, capture: v.capture, souffle: v.souffle }).some(m => m.caps.length);
      if (!caps) return 'À vous de jouer';
      return v.capture === false ? 'Une prise est possible' : v.souffle ? 'Prise à jouer, sinon vous serez soufflé !' : 'Prise obligatoire !';
    }
    return null;
  },
};
