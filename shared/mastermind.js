// Mastermind : trouver un code de pions de couleur.
// Réglages : 4 pions / 6 couleurs / 10 essais, ou « long » : 6 pions / 8 couleurs / 12 essais ;
// doublons de couleur autorisés ou non ; indices classiques ou attribués à chaque position.
// Solo : on cherche seul. En duel : les deux joueurs cherchent le même code à tour de rôle ;
// celui qui commence ne gagne pas d'avance : l'autre joue toujours autant d'essais que lui.
export const optionKeys = ['positional', 'long', 'nodup'];

export const sizes = o => (o && o.long ? { len: 6, colors: 8, tries: 12 } : { len: 4, colors: 6, tries: 10 });
// Valeurs de la partie classique, conservées pour les anciens imports.
export const COLORS = 6, LEN = 4, TRIES = 10;

export function feedback(secret, guess, colors = 6) {
  let b = 0;
  const cs = new Array(colors).fill(0), cg = new Array(colors).fill(0);
  for (let i = 0; i < secret.length; i++) { if (secret[i] === guess[i]) b++; else { cs[secret[i]]++; cg[guess[i]]++; } }
  let w = 0;
  for (let c = 0; c < colors; c++) w += Math.min(cs[c], cg[c]);
  return { b, w };
}

// Indices « attribués à une position » : pour chaque pion du joueur, 'b' (bien placé),
// 'w' (cette couleur est dans le code, ailleurs) ou '' (absente, ou déjà toutes comptées).
export function positionalFeedback(secret, guess, colors = 6) {
  const pos = new Array(secret.length).fill('');
  const left = new Array(colors).fill(0);
  for (let i = 0; i < secret.length; i++) { if (secret[i] === guess[i]) pos[i] = 'b'; else left[secret[i]]++; }
  for (let i = 0; i < secret.length; i++) if (!pos[i] && left[guess[i]] > 0) { pos[i] = 'w'; left[guess[i]]--; }
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
    return n0 >= s.tries ? { winner: 1 } : null;
  }
  if (n0 !== n1) return null;                       // la manche n'est pas finie : l'autre joueur a droit à sa chance
  const [a, b] = s.solved;
  if (a !== null && b !== null) return { winner: a < b ? 0 : b < a ? 1 : 'draw' };
  if (a !== null) return { winner: 0 };
  if (b !== null) return { winner: 1 };
  return n0 >= s.tries ? { winner: 'draw' } : null;
}
function makeSecret(len, colors, dup) {
  if (dup) return Array.from({ length: len }, () => Math.floor(Math.random() * colors));
  const pool = Array.from({ length: colors }, (_, i) => i);
  for (let i = colors - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, len);
}

export const mastermind = {
  id: 'mastermind',
  create(opts = {}, { starter = 0 } = {}) {
    const { len, colors, tries } = sizes(opts), dup = !opts.nodup;
    return { secret: makeSecret(len, colors, dup), len, colors, tries, dup, solo: !!opts.solo, positional: !!opts.positional, starter, guesses: [[], []], solved: [null, null], result: null };
  },
  toMove: mover,
  legalMoves() { return []; },
  apply(s, seat, m) {
    if (s.result || mover(s) !== seat || !m || !Array.isArray(m.g) || m.g.length !== s.len || !m.g.every(v => Number.isInteger(v) && v >= 0 && v < s.colors)) return null;
    if (!s.dup && new Set(m.g).size !== s.len) return null;
    if (s.guesses[seat].length >= s.tries) return null;
    const n = { ...s, guesses: [s.guesses[0].slice(), s.guesses[1].slice()], solved: s.solved.slice() };
    const fb = feedback(s.secret, m.g, s.colors);
    const entry = { g: m.g.slice(), b: fb.b, w: fb.w };
    if (s.positional) entry.pos = positionalFeedback(s.secret, m.g, s.colors);
    n.guesses[seat].push(entry);
    if (fb.b === s.len) n.solved[seat] = n.guesses[seat].length;
    n.result = judge(n);
    return n;
  },
  outcome: s => s.result,
  view: s => ({ guesses: s.guesses, turn: mover(s), result: s.result, solo: s.solo, positional: s.positional, tries: s.tries, len: s.len, colors: s.colors, dup: s.dup, solved: s.solved, secret: s.result ? s.secret : null }),
};
