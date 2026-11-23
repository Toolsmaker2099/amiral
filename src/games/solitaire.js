// Solitaire (Klondike) : comme sur Windows. Tirer 1 ou 3 cartes, score, chronomètre,
// glisser-déposer, double clic pour monter une carte, annuler.
import { cardHTML, slotHTML, dragger, shuffle, fullDeck, isRed } from '../cards.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};
const fmt = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

export default {
  id: 'solitaire', theme: 'win', title: ['Solitaire', ''], tagline: 'Comme sur PC',
  mount(host) {
    host.innerHTML = `
    <div class="w95 card-win">
      <div class="w95-title"><span>🂡 Solitaire</span></div>
      <div class="w95-menu">
        <button type="button" data-r="new">Nouvelle donne</button>
        <button type="button" data-r="undo">Annuler</button>
        <button type="button" data-r="d1">Tirer 1</button>
        <button type="button" data-r="d3">Tirer 3</button>
        <button type="button" data-r="auto" hidden>Terminer</button>
      </div>
      <div class="felt95" data-r="board"></div>
      <div class="w95-status" data-r="status"></div>
    </div>`;
    const q = r => host.querySelector(`[data-r="${r}"]`);
    const board = q('board');
    let S = null, hist = [], sel = null, timer = null, autoTimer = null, W = 0, M = {};

    function deal() {
      clearInterval(timer); clearInterval(autoTimer); timer = null;
      const deck = shuffle(fullDeck()).map(c => ({ ...c, up: false }));
      const tab = [];
      for (let i = 0; i < 7; i++) { const col = deck.splice(0, i + 1); col[i].up = true; tab.push(col); }
      S = { stock: deck, waste: [], found: [[], [], [], []], tab, draw: store.get('solitaire:draw') || 1, score: 0, moves: 0, t: 0, started: false, won: false };
      hist = []; sel = null;
      render();
    }
    const snap = () => { hist.push(JSON.stringify(S)); if (hist.length > 400) hist.shift(); };
    function startClock() {
      if (S.started) return;
      S.started = true;
      timer = setInterval(() => { S.t++; status(); }, 1000);
    }
    const canFound = (c, k) => { const p = S.found[k]; return p.length ? p[p.length - 1].s === c.s && p[p.length - 1].r === c.r - 1 : c.r === 0; };
    const canTab = (c, ci) => {
      const col = S.tab[ci];
      if (!col.length) return c.r === 12;
      const top = col[col.length - 1];
      return top.up && isRed(top.s) !== isRed(c.s) && top.r === c.r + 1;
    };

    function metrics() {
      W = board.clientWidth || 340;
      const gap = Math.max(4, Math.min(12, Math.round(W * 0.014)));
      const cw = Math.floor((W - gap * 8) / 7), ch = Math.round(cw * 1.4);
      M = { gap, cw, ch, dd: Math.round(ch * .13), du: Math.round(ch * .27), ty: ch + gap * 3 };
      M.x = c => gap + c * (cw + gap);
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px');
      board.style.setProperty('--fs', Math.max(10, Math.round(cw * .3)) + 'px');
    }
    const inSel = (zone, idx) => sel && sel.zone === zone && (zone[0] === 't' ? idx >= sel.idx : idx === sel.idx);

    function render() {
      metrics();
      const { cw, ch, gap, dd, du, ty } = M, h = [];
      // Emplacements
      h.push(slotHTML('stock', M.x(0), gap, cw, ch, S.stock.length ? '' : '↻'));
      h.push(slotHTML('waste', M.x(1), gap, cw, ch));
      for (let k = 0; k < 4; k++) h.push(slotHTML('f' + k, M.x(3 + k), gap, cw, ch, 'A'));
      for (let c = 0; c < 7; c++) h.push(slotHTML('t' + c, M.x(c), ty, cw, ch, 'K'));
      // Pioche
      if (S.stock.length) h.push(cardHTML(S.stock[S.stock.length - 1], { x: M.x(0), y: gap, up: false, key: 'stock:0', zone: 'stock' }));
      // Défausse : jusqu'à 3 cartes en éventail, seule la dernière se joue
      const shown = Math.min(S.draw === 3 ? 3 : 1, S.waste.length);
      for (let i = 0; i < shown; i++) {
        const idx = S.waste.length - shown + i;
        h.push(cardHTML(S.waste[idx], { x: M.x(1) + i * Math.round(cw * .2), y: gap, z: 5 + i, key: 'w:' + idx, zone: 'w', cls: inSel('w', idx) ? 'sel' : '' }));
      }
      // Fondations
      S.found.forEach((p, k) => { if (p.length) h.push(cardHTML(p[p.length - 1], { x: M.x(3 + k), y: gap, z: 2, key: `f${k}:${p.length - 1}`, zone: 'f' + k, cls: inSel('f' + k, p.length - 1) ? 'sel' : '' })); });
      // Colonnes
      let maxBottom = ty + ch;
      S.tab.forEach((col, c) => {
        let y = ty;
        col.forEach((card, i) => {
          h.push(cardHTML(card, { x: M.x(c), y, z: 10 + i, up: card.up, key: `t${c}:${i}`, zone: 't' + c, cls: inSel('t' + c, i) ? 'sel' : '' }));
          maxBottom = Math.max(maxBottom, y + ch);
          y += card.up ? du : dd;
        });
      });
      const bh = maxBottom + gap * 2;
      board.style.height = Math.max(bh, ty + ch * 3.2) + 'px';
      board.innerHTML = h.join('') + (S.won ? '<div class="win95-banner"><b>Bravo !</b><span>Partie gagnée.</span></div>' : '');
      const canAuto = !S.won && !S.stock.length && !S.waste.length && S.tab.every(col => col.every(c => c.up));
      q('auto').hidden = !canAuto;
      q('d1').classList.toggle('on', S.draw === 1); q('d3').classList.toggle('on', S.draw === 3);
      q('undo').disabled = !hist.length;
      status();
    }
    function status() {
      q('status').innerHTML = `<span>Score : ${S.score}</span><span>Temps : ${fmt(S.t)}</span><span>Coups : ${S.moves}</span>`;
    }

    function drawStock() {
      if (S.won) return;
      snap(); startClock();
      if (S.stock.length) {
        for (let i = 0; i < S.draw && S.stock.length; i++) { const c = S.stock.pop(); c.up = true; S.waste.push(c); }
      } else if (S.waste.length) {
        S.stock = S.waste.reverse().map(c => ({ ...c, up: false })); S.waste = [];
        if (S.draw === 1) S.score = Math.max(0, S.score - 100);
      } else { hist.pop(); return; }
      S.moves++; sel = null; render();
    }

    function removeFromSource(grp) {
      if (grp.zone === 'w') S.waste.pop();
      else if (grp.zone[0] === 'f') S.found[+grp.zone[1]].pop();
      else {
        const col = S.tab[+grp.zone[1]];
        col.splice(grp.idx);
        if (col.length && !col[col.length - 1].up) { col[col.length - 1].up = true; S.score += 5; }
      }
    }
    function tryMove(grp, dz, silent) {
      const first = grp.cards[0];
      if (dz === grp.zone) return false;
      if (dz[0] === 't') {
        if (!canTab(first, +dz[1])) return false;
        if (!silent) snap();
        startClock();
        removeFromSource(grp);
        S.tab[+dz[1]].push(...grp.cards.map(c => ({ ...c, up: true })));
        if (grp.zone === 'w') S.score += 5; else if (grp.zone[0] === 'f') S.score = Math.max(0, S.score - 15);
      } else if (dz[0] === 'f') {
        if (grp.cards.length !== 1 || !canFound(first, +dz[1])) return false;
        if (!silent) snap();
        startClock();
        removeFromSource(grp);
        S.found[+dz[1]].push({ ...first, up: true });
        if (grp.zone[0] !== 'f') S.score += 10;
      } else return false;
      S.moves++; sel = null;
      if (S.found.every(p => p.length === 13)) { S.won = true; clearInterval(timer); clearInterval(autoTimer); }
      render();
      return true;
    }

    const getGroup = el => {
      const [zone, i] = el.dataset.key.split(':'), idx = +i;
      if (zone === 'stock') return null;
      if (zone === 'w') { if (idx !== S.waste.length - 1) return null; return { zone, idx, cards: [S.waste[idx]], els: [el] }; }
      if (zone[0] === 'f') { const p = S.found[+zone[1]]; if (idx !== p.length - 1) return null; return { zone, idx, cards: [p[idx]], els: [el] }; }
      const col = S.tab[+zone[1]];
      if (!col[idx]?.up) return null;
      const cards = col.slice(idx);
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
      dbl: grp => {
        if (grp.cards.length !== 1 || grp.zone[0] === 'f') return;
        const c = grp.cards[0];
        const order = [0, 1, 2, 3].sort((a, b) => (S.found[b].length && S.found[b][0].s === c.s) - (S.found[a].length && S.found[a][0].s === c.s));
        for (const k of order) if (canFound(c, k)) return void tryMove(grp, 'f' + k);
      },
    });
    board.addEventListener('click', e => {
      if (e.target.closest('.card95:not([data-zone="stock"])')) return;
      const z = e.target.closest('[data-zone]');
      if (!z) return;
      if (z.dataset.zone === 'stock') return drawStock();
      if (sel && z.dataset.zone !== 'waste') tryMove(sel, z.dataset.zone);
    });

    function autoStep() {
      let best = null;
      S.tab.forEach((col, c) => {
        const card = col[col.length - 1]; if (!card) return;
        for (let k = 0; k < 4; k++) if (canFound(card, k) && (!best || card.r < best.card.r)) best = { card, c, k, idx: col.length - 1 };
      });
      if (!best) return false;
      return tryMove({ zone: 't' + best.c, idx: best.idx, cards: [best.card] }, 'f' + best.k, true);
    }
    q('auto').addEventListener('click', () => {
      snap();
      clearInterval(autoTimer);
      autoTimer = setInterval(() => { if (!autoStep()) clearInterval(autoTimer); }, 110);
    });
    q('new').addEventListener('click', deal);
    q('undo').addEventListener('click', () => {
      if (!hist.length) return;
      clearInterval(autoTimer);
      const keep = { t: S.t, started: S.started };
      S = JSON.parse(hist.pop()); S.t = keep.t; S.started = keep.started; sel = null; render();
    });
    for (const n of [1, 3]) q('d' + n).addEventListener('click', () => { store.set('solitaire:draw', n); deal(); S.draw = n; render(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (S && board.clientWidth && Math.abs(board.clientWidth - W) > 1) render(); }).observe(board);
    deal();
  },
};
