// Dames (règles françaises, plateau 8 × 8) : prise obligatoire, prise majoritaire, dames volantes.
// Cases : 0 vide, 1 pion blanc, 2 dame blanche, 3 pion noir, 4 dame noire. Le joueur 0 a les blancs (il monte).
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const owner = v => (v === 0 ? null : v <= 2 ? 0 : 1);
const isKing = v => v === 2 || v === 4;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function initial() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r * 8 + c] = 3; else if (r > 4) b[r * 8 + c] = 1; }
  return b;
}

function capturesFrom(b, from, seat) {
  const piece = b[from], king = isKing(piece), out = [];
  const w = b.slice(); w[from] = 0;
  const taken = new Set();
  const dfs = (pos, path, caps) => {
    let found = false;
    const r0 = (pos / 8) | 0, c0 = pos % 8;
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc;
      if (king) while (inb(r, c) && w[r * 8 + c] === 0) { r += dr; c += dc; }
      if (!inb(r, c)) continue;
      const t = r * 8 + c, tv = w[t];
      if (tv === 0 || owner(tv) === seat || taken.has(t)) continue;
      let lr = r + dr, lc = c + dc;
      while (inb(lr, lc) && w[lr * 8 + lc] === 0) {
        found = true;
        taken.add(t);
        dfs(lr * 8 + lc, path.concat(lr * 8 + lc), caps.concat(t));
        taken.delete(t);
        if (!king) break;
        lr += dr; lc += dc;
      }
    }
    if (!found && caps.length) out.push({ path, caps });
  };
  dfs(from, [from], []);
  return out;
}

function simpleFrom(b, from, seat) {
  const piece = b[from], king = isKing(piece), out = [];
  const r0 = (from / 8) | 0, c0 = from % 8, fwd = seat === 0 ? -1 : 1;
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== fwd) continue;
    let r = r0 + dr, c = c0 + dc;
    while (inb(r, c) && b[r * 8 + c] === 0) {
      out.push({ path: [from, r * 8 + c], caps: [] });
      if (!king) break;
      r += dr; c += dc;
    }
  }
  return out;
}

// Coups de prise obligatoire (et majoritaire) : c'est ce que joue l'ordinateur, qui ne commet jamais de faute.
function forcedMoves(b, seat) {
  let caps = [];
  for (let i = 0; i < 64; i++) if (owner(b[i]) === seat) caps = caps.concat(capturesFrom(b, i, seat));
  if (caps.length) {
    const best = Math.max(...caps.map(m => m.caps.length));
    return caps.filter(m => m.caps.length === best);
  }
  let out = [];
  for (let i = 0; i < 64; i++) if (owner(b[i]) === seat) out = out.concat(simpleFrom(b, i, seat));
  return out;
}
// Tous les coups possibles, prises ou non (sans obligation).
function freeMoves(b, seat) {
  let out = [];
  for (let i = 0; i < 64; i++) if (owner(b[i]) === seat) out = out.concat(capturesFrom(b, i, seat), simpleFrom(b, i, seat));
  return out;
}
const optCapture = s => s.capture !== false;
const optSouffle = s => optCapture(s) && s.souffle === true;

// Coups légaux pour s.turn ; lit s.b, s.turn et les options (s.capture, s.souffle).
// Prise obligatoire (par défaut) : seules les prises majoritaires. Sans prise obligatoire, ou avec le soufflé,
// tous les coups sont permis ; avec le soufflé, c'est l'adversaire qui sanctionne l'oubli.
export function legalMoves(s, seat = s.turn) {
  return optCapture(s) && !optSouffle(s) ? forcedMoves(s.b, seat) : freeMoves(s.b, seat);
}

// Joue un coup légal sans validation ni détection de fin (recherche de l'ordinateur).
export function step(s, mv) {
  const b = s.b.slice(), from = mv.path[0], to = mv.path[mv.path.length - 1], seat = s.turn;
  let piece = b[from];
  const wasKing = isKing(piece);
  b[from] = 0;
  for (const t of mv.caps) b[t] = 0;
  if (!wasKing && ((seat === 0 && to < 8) || (seat === 1 && to >= 56))) piece = seat === 0 ? 2 : 4;
  b[to] = piece;
  return { b, turn: 1 - seat, capture: s.capture };
}

export const dames = {
  id: 'dames',
  legalMoves,
  create(opts = {}, { starter = 0 } = {}) {
    const capture = opts.capture !== false;
    return { b: initial(), turn: starter, result: null, last: null, quiet: 0, capture, souffle: capture && !!opts.souffle, huff: null };
  },
  toMove: s => (s.result ? null : s.turn),
  apply(s, seat, m) {
    // Souffler : retirer le pion adverse qui aurait dû prendre, puis jouer son coup normalement.
    if (m && Number.isInteger(m.huff) && m.path === undefined) {
      if (s.result || s.turn !== seat || !s.huff || s.huff.seat !== 1 - seat || !s.huff.sqs.includes(m.huff)) return null;
      const b = s.b.slice(); b[m.huff] = 0;
      const n = { ...s, b, huff: null, last: null };
      if (!b.some(v => owner(v) === 1 - seat)) n.result = { winner: seat };
      return n;
    }
    if (s.result || s.turn !== seat || !m || !Array.isArray(m.path) || m.path.length < 2 || !m.path.every(Number.isInteger)) return null;
    const key = m.path.join(',');
    const mv = legalMoves(s).find(x => x.path.join(',') === key);
    if (!mv) return null;
    const b = s.b.slice(), from = mv.path[0], to = mv.path[mv.path.length - 1];
    let piece = b[from];
    const wasKing = isKing(piece);
    b[from] = 0;
    for (const t of mv.caps) b[t] = 0;
    if (!wasKing && ((seat === 0 && to < 8) || (seat === 1 && to >= 56))) piece = seat === 0 ? 2 : 4;
    b[to] = piece;
    const n = { ...s, b, turn: 1 - seat, result: null, last: mv.path, quiet: wasKing && !mv.caps.length ? s.quiet + 1 : 0, huff: null };
    if (optSouffle(s)) {                            // faute : une prise (la plus longue) était possible et n'a pas été jouée
      const forced = forcedMoves(s.b, seat);
      if (forced.length && forced[0].caps.length && mv.caps.length < forced[0].caps.length) {
        const sqs = [...new Set(forced.map(x => (x.path[0] === from ? to : x.path[0])))];
        n.huff = { seat, sqs };
      }
    }
    if (!legalMoves(n).length) n.result = { winner: seat };
    else if (n.quiet >= 50) n.result = { winner: 'draw' };
    return n;
  },
  outcome: s => s.result,
  view: s => s,
};
