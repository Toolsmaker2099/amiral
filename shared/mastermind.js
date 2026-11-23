// Mastermind : trouver un code de 4 couleurs parmi 6, en 10 essais.
// Solo : on cherche seul. En duel : les deux joueurs cherchent le même code à tour de rôle ;
// celui qui commence ne gagne pas d'avance : l'autre joue toujours autant d'essais que lui.
export const COLORS = 6, LEN = 4, TRIES = 10;
export const optionKeys = ['positional'];   // variante : un indice par pion, à sa position

export function feedback(secret, guess) {
  let b = 0;
  const cs = new Array(COLORS).fill(0), cg = new Array(COLORS).fill(0);
  for (let i = 0; i < LEN; i++) { if (secret[i] === guess[i]) b++; else { cs[secret[i]]++; cg[guess[i]]++; } }
  let w = 0;
  for (let c = 0; c < COLORS; c++) w += Math.min(cs[c], cg[c]);
  return { b, w };
}

// Variante « indices attribués à une position » : pour chaque pion du joueur, 'b' (bien placé),
// 'w' (cette couleur est dans le code, ailleurs) ou '' (absente, ou déjà toutes comptées).
export function positionalFeedback(secret, guess) {
  const pos = new Array(LEN).fill('');
  const left = new Array(COLORS).fill(0);
  for (let i = 0; i < LEN; i++) { if (secret[i] === guess[i]) pos[i] = 'b'; else left[secret[i]]++; }
  for (let i = 0; i < LEN; i++) if (!pos[i] && left[guess[i]] > 0) { pos[i] = 'w'; left[guess[i]]--; }
  return pos;
}
const lens = s => [s.guesses[0].length, s.guesses[1].length];
function mover(s) {
  if (s.result) return null;
  if (s.solo) return 0;
  const n = lens(s);
  return n[s.starter] === n[1 - s.starter] ? s.starter : 1 - s.starter;
}
function judge(s) {
  const [n0, n1] = lens(s);
  if (s.solo) {
    if (s.solved[0] !== null) return { winner: 0 };
    return n0 >= TRIES ? { winner: 1 } : null;
  }
  if (n0 !== n1) return null;                       // la manche n'est pas finie : l'autre joueur a droit à sa chance
  const [a, b] = s.solved;
  if (a !== null && b !== null) return { winner: a < b ? 0 : b < a ? 1 : 'draw' };
  if (a !== null) return { winner: 0 };
  if (b !== null) return { winner: 1 };
  return n0 >= TRIES ? { winner: 'draw' } : null;
}

export const mastermind = {
  id: 'mastermind',
  create(opts = {}, { starter = 0 } = {}) {
    return { secret: Array.from({ length: LEN }, () => Math.floor(Math.random() * COLORS)), solo: !!opts.solo, positional: !!opts.positional, starter, guesses: [[], []], solved: [null, null], result: null };
  },
  toMove: mover,
  legalMoves() { return []; },
  apply(s, seat, m) {
    if (s.result || mover(s) !== seat || !m || !Array.isArray(m.g) || m.g.length !== LEN || !m.g.every(v => Number.isInteger(v) && v >= 0 && v < COLORS)) return null;
    if (s.guesses[seat].length >= TRIES) return null;
    const n = { ...s, guesses: [s.guesses[0].slice(), s.guesses[1].slice()], solved: s.solved.slice() };
    const fb = feedback(s.secret, m.g);
    const entry = { g: m.g.slice(), b: fb.b, w: fb.w };
    if (s.positional) entry.pos = positionalFeedback(s.secret, m.g);
    n.guesses[seat].push(entry);
    if (fb.b === LEN) n.solved[seat] = n.guesses[seat].length;
    n.result = judge(n);
    return n;
  },
  outcome: s => s.result,
  view: s => ({ guesses: s.guesses, turn: mover(s), result: s.result, solo: s.solo, positional: s.positional, tries: TRIES, len: LEN, colors: COLORS, solved: s.solved, secret: s.result ? s.secret : null }),
};
