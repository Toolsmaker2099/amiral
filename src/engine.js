// Règles du jeu : plateaux, placement, tirs et tours. Aucun accès au DOM.

/* ==========================================================
   1. RÈGLES ET MOTEUR — aucune dépendance au DOM.
   Tout l'état est en objets simples (sérialisables en JSON),
   pour pouvoir plus tard l'échanger entre deux joueurs en ligne.
   ========================================================== */
export const SIZES = { 8: 'Partie rapide, la flotte est serrée.', 10: 'La grille classique.', 12: 'Plus de mer, des navires plus difficiles à trouver.' };
export let SIZE = 10;            // taille courante ; fixée avant de créer les plateaux
export const LETTERS = 'ABCDEFGHIJKL';
export const FLEET = [
  { id: 'pa', name: 'Porte-avions', len: 5 },
  { id: 'cr', name: 'Croiseur', len: 4 },
  { id: 'ct', name: 'Contre-torpilleur', len: 3 },
  { id: 'sm', name: 'Sous-marin', len: 3 },
  { id: 'tp', name: 'Torpilleur', len: 2 },
];
export const coord = (r, c) => LETTERS[c] + (r + 1);
export const rand = n => Math.floor(Math.random() * n);
export const pick = a => a[rand(a.length)];

export const Engine = {
  newBoard() { return { ships: [], shots: new Array(SIZE * SIZE).fill(0) }; }, // shots: 0 inconnu, 1 eau, 2 touché
  cells(len, r, c, h) { const out = []; for (let i = 0; i < len; i++) out.push(h ? [r, c + i] : [r + i, c]); return out; },
  inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; },
  shipCells(s) { return Engine.cells(s.len, s.r, s.c, s.h); },
  shipAt(board, r, c) { return board.ships.find(s => Engine.shipCells(s).some(([a, b]) => a === r && b === c)) || null; },
  canPlace(board, len, r, c, h, ignoreId) {
    return Engine.cells(len, r, c, h).every(([a, b]) =>
      Engine.inBounds(a, b) && !board.ships.some(s => s.id !== ignoreId && Engine.shipCells(s).some(([x, y]) => x === a && y === b)));
  },
  place(board, id, r, c, h, rev = false) {
    const def = FLEET.find(f => f.id === id);
    if (!def || !Engine.canPlace(board, def.len, r, c, h, id)) return false;
    board.ships = board.ships.filter(s => s.id !== id);
    board.ships.push({ id, name: def.name, len: def.len, r, c, h, rev: !!rev, hits: 0 });
    return true;
  },
  randomize(board) {
    board.ships = [];
    for (const f of FLEET) {
      let ok = false;
      while (!ok) {
        const h = Math.random() < .5;
        ok = Engine.place(board, f.id, rand(h ? SIZE : SIZE - f.len + 1), rand(h ? SIZE - f.len + 1 : SIZE), h, Math.random() < .5);
      }
    }
    return board;
  },
  isComplete(board) { return board.ships.length === FLEET.length; },
  isSunk(s) { return s.hits >= s.len; },
  fire(board, r, c) {
    const i = r * SIZE + c;
    if (!Engine.inBounds(r, c) || board.shots[i]) return { result: 'repeat', r, c };
    const ship = Engine.shipAt(board, r, c);
    if (!ship) { board.shots[i] = 1; return { result: 'miss', r, c }; }
    board.shots[i] = 2; ship.hits++;
    if (Engine.isSunk(ship)) {
      return { result: 'sunk', r, c, ship: { id: ship.id, name: ship.name, len: ship.len, cells: Engine.shipCells(ship) },
               fleetDestroyed: board.ships.every(Engine.isSunk) };
    }
    return { result: 'hit', r, c, ship: { id: ship.id, name: ship.name } };
  },
};

/* Une partie : deux plateaux, le tour, les règles. Joueur 0 = vous, joueur 1 = adversaire. */
export const Match = {
  create(boards, opts) {
    return { phase: 'battle', turn: 0, boards, opts: { replayOnHit: !!opts.replayOnHit },
             stats: [{ shots: 0, hits: 0 }, { shots: 0, hits: 0 }], winner: null, round: 0 };
  },
  shoot(m, shooter, r, c) {
    if (m.phase !== 'battle' || m.turn !== shooter) return { result: 'refused' };
    const res = Engine.fire(m.boards[1 - shooter], r, c);
    if (res.result === 'repeat') return res;
    m.round++;
    m.stats[shooter].shots++;
    if (res.result !== 'miss') m.stats[shooter].hits++;
    if (res.fleetDestroyed) { m.phase = 'over'; m.winner = shooter; }
    else if (!(res.result !== 'miss' && m.opts.replayOnHit)) m.turn = 1 - shooter;
    res.shooter = shooter;
    return res;
  },
};

export function setGridSize(n) {
  SIZE = [8, 10, 12].includes(+n) ? +n : 10;
  return SIZE;
}
