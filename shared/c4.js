// Puissance 4 : règles pures, partagées entre le navigateur (solo) et le serveur (en ligne).
export const W = 7, H = 6;

function findLine(b, r, c, seat) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [r * W + c];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr * W + cc] === seat) { cells.push(rr * W + cc); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export const c4 = {
  id: 'c4',
  create(opts, { starter = 0 } = {}) { return { board: new Array(W * H).fill(null), turn: starter, result: null, last: null }; },
  toMove: s => (s.result ? null : s.turn),
  legalMoves(s) { const out = []; if (s.result) return out; for (let c = 0; c < W; c++) if (s.board[c] === null) out.push({ c }); return out; },
  apply(s, seat, m) {
    if (s.result || s.turn !== seat || !m || !Number.isInteger(m.c) || m.c < 0 || m.c >= W) return null;
    let r = -1;
    for (let i = H - 1; i >= 0; i--) if (s.board[i * W + m.c] === null) { r = i; break; }
    if (r < 0) return null;
    const n = { ...s, board: s.board.slice(), last: { r, c: m.c } };
    n.board[r * W + m.c] = seat;
    const line = findLine(n.board, r, m.c, seat);
    if (line) n.result = { winner: seat, line };
    else if (n.board.every(v => v !== null)) n.result = { winner: 'draw', line: null };
    else n.turn = 1 - seat;
    return n;
  },
  outcome: s => s.result,
  view: s => s,
};
