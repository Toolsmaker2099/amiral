// Pendu. Solo : on devine un mot en 11 erreurs. Duel : on joue à tour de rôle sur le même mot,
// une bonne lettre fait rejouer, celui qui complète le mot gagne, 11 erreurs et on perd.
import { WORDS } from './words.js';

const MAX_ERRORS = 11;                          // un élément du dessin par erreur
const maxErr = () => MAX_ERRORS;
const complete = s => [...s.word].every(l => s.guessed.includes(l));

export const pendu = {
  id: 'pendu',
  create(opts = {}, { starter = 0 } = {}) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    return { word, guessed: [], errors: [0, 0], turn: opts.solo ? 0 : starter, solo: !!opts.solo, result: null };
  },
  toMove: s => (s.result ? null : s.turn),
  legalMoves(s) { return s.result ? [] : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !s.guessed.includes(l)).map(l => ({ l })); },
  apply(s, seat, m) {
    if (s.result || s.turn !== seat || !m || typeof m.l !== 'string' || !/^[A-Z]$/.test(m.l) || s.guessed.includes(m.l)) return null;
    const n = { ...s, guessed: s.guessed.concat(m.l), errors: s.errors.slice() };
    if (s.word.includes(m.l)) {
      if (complete(n)) n.result = { winner: seat };
    } else {
      n.errors[seat]++;
      if (n.errors[seat] >= maxErr(s)) n.result = { winner: s.solo ? 1 : 1 - seat };
      else if (!s.solo) n.turn = 1 - seat;
    }
    return n;
  },
  outcome: s => s.result,
  view: s => ({
    mask: [...s.word].map(l => (s.guessed.includes(l) || s.result ? l : '')),
    revealedByGuess: [...s.word].map(l => s.guessed.includes(l)),
    guessed: s.guessed, errors: s.errors, max: maxErr(s), solo: s.solo,
    turn: s.result ? null : s.turn, result: s.result,
    word: s.result ? s.word : null,
  }),
};
