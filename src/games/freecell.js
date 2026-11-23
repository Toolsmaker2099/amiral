// FreeCell : comme sur Windows, avec les mêmes numéros de donne (1 à 32000).
// Quatre cases libres, quatre fondations, huit colonnes. Tout est visible : tout se joue à la réflexion.
import { cardHTML, slotHTML, dragger, isRed } from '../cards.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};

// Mélange de Microsoft : rand() = (seed = seed * 214013 + 2531011) >> 16 & 0x7fff.
export function msDeal(n) {
  let seed = n >>> 0;
  const rand = () => { seed = (Math.imul(seed, 214013) + 2531011) >>> 0; return (seed >>> 16) & 0x7fff; };
  const deck = [...Array(52).keys()], cards = [];
  for (let i = 0; i < 52; i++) { const j = rand() % (52 - i); cards.push(deck[j]); deck[j] = deck[51 - i]; }
  const cols = Array.from({ length: 8 }, () => []);
  cards.forEach((c, i) => cols[i % 8].push({ r: c >> 2, s: c & 3 }));
  return cols;
}
const randomGame = () => { let n; do { n = 1 + Math.floor(Math.random() * 32000); } while (n === 11982); return n; };

export default {
  id: 'freecell', theme: 'win', title: ['FreeCell', ''], tagline: 'Comme sur PC',
  mount(host) {
    host.innerHTML = `
    <div class="w95 card-win">
      <div class="w95-menu">
        <button type="button" data-r="new">Nouvelle donne</button>
        <button type="button" data-r="pick">Choisir un n°</button>
        <button type="button" data-r="restart">Recommencer</button>
        <button type="button" data-r="undo">Annuler</button>
        <button type="button" data-r="auto">Auto ▶</button>
      </div>
      <div class="felt95" data-r="board"></div>
      <div class="w95-status" data-r="status"></div>
      <div class="w95-dialog" data-r="dialog" hidden>
        <p>Numéro de donne (1 à 32 000)</p>
        <input type="number" min="1" max="32000" data-r="num" inputmode="numeric">
        <div><button type="button" class="btn95" data-r="ok">OK</button><button type="button" class="btn95" data-r="cancel">Annuler</button></div>
      </div>
    </div>`;
    const q = r => host.querySelector(`[data-r="${r}"]`);
    const board = q('board');
    let S = null, hist = [], sel = null, W = 0, M = {}, autoTimer = null;

    function start(n) {
      clearInterval(autoTimer);
      S = { n, cols: msDeal(n), cells: [null, null, null, null], found: [[], [], [], []], moves: 0, won: false };
      store.set('freecell:last', n);
      hist = []; sel = null; render();
    }
    const snap = () => { hist.push(JSON.stringify(S)); if (hist.length > 600) hist.shift(); };
    const canFound = (c, k) => { const p = S.found[k]; return p.length ? p[p.length - 1].s === c.s && p[p.length - 1].r === c.r - 1 : c.r === 0; };
    const fits = (c, col) => !col.length || (isRed(col[col.length - 1].s) !== isRed(c.s) && col[col.length - 1].r === c.r + 1);
    const isRun = cards => cards.every((c, i) => !i || (isRed(cards[i - 1].s) !== isRed(c.s) && cards[i - 1].r === c.r + 1));
    const maxMove = (toEmpty) => {
      const free = S.cells.filter(c => !c).length, empty = S.cols.filter(c => !c.length).length - (toEmpty ? 1 : 0);
      return (free + 1) * (2 ** Math.max(0, empty));
    };

    function metrics() {
      W = board.clientWidth || 340;
      const gap = Math.max(3, Math.min(10, Math.round(W * .011)));
      const cw = Math.floor((W - gap * 9) / 8), ch = Math.round(cw * 1.4);
      M = { gap, cw, ch, du: Math.round(ch * .31), ty: ch + gap * 3 };
      M.x = c => gap + c * (cw + gap);
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px');
      board.style.setProperty('--fs', Math.max(9, Math.round(cw * .3)) + 'px');
    }
    const inSel = (zone, idx) => sel && sel.zone === zone && (zone[0] === 't' ? idx >= sel.idx : true);
    function render() {
      metrics();
      const { cw, ch, gap, du, ty } = M, h = [];
      for (let k = 0; k < 4; k++) h.push(slotHTML('c' + k, M.x(k), gap, cw, ch));
      for (let k = 0; k < 4; k++) h.push(slotHTML('f' + k, M.x(4 + k), gap, cw, ch, 'A'));
      for (let c = 0; c < 8; c++) h.push(slotHTML('t' + c, M.x(c), ty, cw, ch));
      S.cells.forEach((c, k) => { if (c) h.push(cardHTML(c, { x: M.x(k), y: gap, key: `c${k}:0`, zone: 'c' + k, cls: inSel('c' + k, 0) ? 'sel' : '' })); });
      S.found.forEach((p, k) => { if (p.length) h.push(cardHTML(p[p.length - 1], { x: M.x(4 + k), y: gap, z: 2, key: `f${k}:${p.length - 1}`, zone: 'f' + k })); });
      let maxBottom = ty + ch;
      S.cols.forEach((col, c) => col.forEach((card, i) => {
        const y = ty + i * du;
        h.push(cardHTML(card, { x: M.x(c), y, z: 10 + i, key: `t${c}:${i}`, zone: 't' + c, cls: inSel('t' + c, i) ? 'sel' : '' }));
        maxBottom = Math.max(maxBottom, y + ch);
      }));
      board.style.height = Math.max(maxBottom + gap * 2, ty + ch * 3.4) + 'px';
      board.innerHTML = h.join('') + (S.won ? '<div class="win95-banner"><b>Bravo !</b><span>Donne n° ' + S.n + ' gagnée en ' + S.moves + ' coups.</span></div>' : '');
      q('undo').disabled = !hist.length;
      status();
    }
    function status() { q('status').innerHTML = `<span>Donne n° ${S.n}</span><span>Coups : ${S.moves}</span><span>Montées : ${S.found.reduce((a, p) => a + p.length, 0)}/52</span>`; }

    function remove(grp) {
      if (grp.zone[0] === 'c') S.cells[+grp.zone[1]] = null;
      else if (grp.zone[0] === 'f') S.found[+grp.zone[1]].pop();
      else S.cols[+grp.zone[1]].splice(grp.idx);
    }
    function tryMove(grp, dz, silent) {
      if (dz === grp.zone) return false;
      const first = grp.cards[0], n = grp.cards.length;
      if (dz[0] === 't') {
        const col = S.cols[+dz[1]];
        if (!fits(first, col) || n > maxMove(!col.length)) return false;
        if (!silent) snap();
        remove(grp); col.push(...grp.cards);
      } else if (dz[0] === 'c') {
        if (n !== 1 || S.cells[+dz[1]]) return false;
        if (!silent) snap();
        remove(grp); S.cells[+dz[1]] = first;
      } else if (dz[0] === 'f') {
        if (n !== 1 || grp.zone[0] === 'f' || !canFound(first, +dz[1])) return false;
        if (!silent) snap();
        remove(grp); S.found[+dz[1]].push(first);
      } else return false;
      S.moves++; sel = null;
      if (S.found.every(p => p.length === 13)) { S.won = true; clearInterval(autoTimer); }
      render();
      return true;
    }
    const getGroup = el => {
      const [zone, i] = el.dataset.key.split(':'), idx = +i;
      if (zone[0] === 'c') return { zone, idx: 0, cards: [S.cells[+zone[1]]], els: [el] };
      if (zone[0] === 'f') { const p = S.found[+zone[1]]; return idx === p.length - 1 ? { zone, idx, cards: [p[idx]], els: [el] } : null; }
      const col = S.cols[+zone[1]], cards = col.slice(idx);
      if (!isRun(cards)) return null;
      return { zone, idx, cards, els: cards.map((_, k) => board.querySelector(`[data-key="${zone}:${idx + k}"]`)).filter(Boolean) };
    };
    dragger(board, {
      start: el => (S.won ? null : getGroup(el)),
      drop: (grp, zone) => tryMove(grp, zone),
      tap: (grp, el) => {
        if (sel) {
          if (sel.zone === grp.zone && sel.idx === grp.idx) { sel = null; return render(); }
          if (tryMove(sel, el.dataset.zone)) return;
        }
        sel = grp; render();
      },
      // Double clic : vers une fondation, sinon vers une case libre.
      dbl: grp => {
        if (grp.cards.length !== 1 || grp.zone[0] === 'f') return;
        const c = grp.cards[0];
        for (let k = 0; k < 4; k++) if (canFound(c, k)) return void tryMove(grp, 'f' + k);
        const free = S.cells.findIndex(x => !x);
        if (free >= 0 && grp.zone[0] === 't') tryMove(grp, 'c' + free);
      },
    });
    board.addEventListener('click', e => {
      if (e.target.closest('.card95')) return;
      const z = e.target.closest('[data-zone]');
      if (z && sel) tryMove(sel, z.dataset.zone);
    });

    // Auto : monte les cartes qui ne servent plus à personne.
    const safe = c => c.r < 2 || [0, 1, 2, 3].filter(s => isRed(s) !== isRed(c.s)).every(s => S.found.some(p => p.length && p[0].s === s && p.length >= c.r));
    function autoStep() {
      const cands = [];
      S.cells.forEach((c, k) => { if (c) cands.push({ zone: 'c' + k, idx: 0, cards: [c] }); });
      S.cols.forEach((col, k) => { if (col.length) cands.push({ zone: 't' + k, idx: col.length - 1, cards: [col[col.length - 1]] }); });
      for (const g of cands) {
        const c = g.cards[0];
        if (!safe(c)) continue;
        for (let k = 0; k < 4; k++) if (canFound(c, k)) return tryMove(g, 'f' + k, true);
      }
      return false;
    }
    q('auto').addEventListener('click', () => {
      snap(); clearInterval(autoTimer);
      autoTimer = setInterval(() => { if (!autoStep() || S.won) clearInterval(autoTimer); }, 110);
    });
    q('new').addEventListener('click', () => start(randomGame()));
    q('restart').addEventListener('click', () => start(S.n));
    q('undo').addEventListener('click', () => { if (hist.length) { clearInterval(autoTimer); S = JSON.parse(hist.pop()); sel = null; render(); } });
    q('pick').addEventListener('click', () => { q('num').value = S.n; q('dialog').hidden = false; q('num').focus(); });
    q('cancel').addEventListener('click', () => { q('dialog').hidden = true; });
    const okPick = () => {
      const n = Math.floor(+q('num').value);
      if (n >= 1 && n <= 32000) { q('dialog').hidden = true; start(n); }
    };
    q('ok').addEventListener('click', okPick);
    q('num').addEventListener('keydown', e => { if (e.key === 'Enter') okPick(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (S && board.clientWidth && Math.abs(board.clientWidth - W) > 1) render(); }).observe(board);
    start(randomGame());
  },
};
