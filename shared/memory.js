// Memory : 10 paires à retrouver. Qui trouve une paire rejoue. Le serveur garde le jeu caché.
export const FACES = ['🐙', '🦊', '🐸', '🦋', '🍓', '🌵', '🚀', '🎈', '🍩', '⚽'];
const N = FACES.length * 2;

function shuffled() {
  const a = [];
  for (let i = 0; i < FACES.length; i++) a.push(i, i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const memory = {
  id: 'memory',
  create(opts, { starter = 0 } = {}) {
    return { deck: shuffled(), done: new Array(N).fill(null), flip: [], turn: starter, pairs: [0, 0], result: null };
  },
  toMove: s => (s.result ? null : s.turn),
  legalMoves(s) { const out = []; for (let i = 0; i < N; i++) if (s.done[i] === null && !s.flip.includes(i)) out.push({ i }); return s.result ? [] : out; },
  apply(s, seat, m) {
    if (s.result || s.turn !== seat || !m || !Number.isInteger(m.i) || m.i < 0 || m.i >= N) return null;
    const n = { ...s, done: s.done.slice(), flip: s.flip.slice(), pairs: s.pairs.slice() };
    if (n.flip.length === 2) n.flip = [];             // les deux cartes du coup précédent se retournent
    if (n.done[m.i] !== null || n.flip.includes(m.i)) return null;
    n.flip.push(m.i);
    if (n.flip.length === 2) {
      const [a, b] = n.flip;
      if (n.deck[a] === n.deck[b]) {
        n.done[a] = n.done[b] = seat; n.pairs[seat]++; n.flip = [];
        if (n.done.every(v => v !== null)) n.result = { winner: n.pairs[0] > n.pairs[1] ? 0 : n.pairs[1] > n.pairs[0] ? 1 : 'draw' };
      } else n.turn = 1 - seat;
    }
    return n;
  },
  outcome: s => s.result,
  // Seules les cartes retournées ou trouvées montrent leur face.
  view: s => ({
    cards: s.deck.map((f, i) => (s.done[i] !== null ? { s: 'm', f, o: s.done[i] } : s.flip.includes(i) ? { s: 'u', f } : { s: 'd' })),
    flip: s.flip, pairs: s.pairs, turn: s.result ? null : s.turn, result: s.result,
    mismatch: s.flip.length === 2,
  }),
};
