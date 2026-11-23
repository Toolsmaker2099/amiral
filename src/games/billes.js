// Solitaire à billes : le jeu de plateau. On saute par-dessus une bille pour la retirer ;
// il faut finir avec une seule bille, de préférence au centre.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};
const BOARDS = {
  english: { label: 'Anglais · 33 trous', ok: (r, c) => (r >= 2 && r <= 4) || (c >= 2 && c <= 4) },
  french: { label: 'Français · 37 trous', ok: (r, c) => Math.abs(r - 3) + Math.abs(c - 3) <= 4 && !((r === 0 || r === 6) && (c < 2 || c > 4)) && !((c === 0 || c === 6) && (r < 2 || r > 4)) },
};
const rating = n => n === 1 ? ['Génie !', 'Une seule bille, et au centre.'] : n === 2 ? ['Excellent', 'Il ne reste que deux billes.'] : n <= 4 ? ['Très bien', 'Quelques billes seulement.'] : n <= 7 ? ['Pas mal', 'Vous pouvez faire mieux.'] : ['Courage', 'Réessayez en préparant vos sauts.'];
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export default {
  id: 'billes', theme: 'billes', title: ['Solitaire', 'à billes'], tagline: 'Le jeu de plateau',
  mount(host) {
    host.innerHTML = `
    <div class="pg-wrap">
      <div class="pg-bar">
        <div class="seg pg-seg" role="radiogroup" aria-label="Plateau" data-r="boards">
          ${Object.entries(BOARDS).map(([k, b]) => `<label><input type="radio" name="pgb" value="${k}"><span>${b.label}</span></label>`).join('')}
        </div>
      </div>
      <div class="pg-info"><div><b data-r="left">0</b><small>billes</small></div><div><b data-r="moves">0</b><small>sauts</small></div></div>
      <div class="pg-table"><div class="pg-board" data-r="board"></div></div>
      <p class="pg-msg" data-r="msg" aria-live="polite"></p>
      <div class="pg-actions"><button type="button" class="btn" data-r="undo">Annuler</button><button type="button" class="btn" data-r="restart">Recommencer</button></div>
      <p class="pg-help">Touchez une bille puis un trou libre, ou faites-la glisser. Elle saute par-dessus une voisine, qui disparaît.</p>
    </div>`;
    const q = r => host.querySelector(`[data-r="${r}"]`);
    const board = q('board');
    let kind = store.get('billes:board') || 'english', G = null, hist = [], sel = null, drag = null;

    function newGame() {
      const B = BOARDS[kind], cells = [];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) cells.push(B.ok(r, c) ? (r === 3 && c === 3 ? 0 : 1) : -1);
      G = { cells, moves: 0 }; hist = []; sel = null; render();
      host.querySelectorAll('input[name=pgb]').forEach(i => { i.checked = i.value === kind; });
    }
    const jumps = i => {
      const r = (i / 7) | 0, c = i % 7, out = [];
      if (G.cells[i] !== 1) return out;
      for (const [dr, dc] of DIRS) {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (r2 < 0 || r2 > 6 || c2 < 0 || c2 > 6) continue;
        if (G.cells[r1 * 7 + c1] === 1 && G.cells[r2 * 7 + c2] === 0) out.push({ to: r2 * 7 + c2, over: r1 * 7 + c1 });
      }
      return out;
    };
    const movable = () => G.cells.map((_, i) => jumps(i).length ? i : -1).filter(i => i >= 0);

    function render() {
      const dest = sel !== null ? jumps(sel).map(j => j.to) : [], can = new Set(movable());
      let h = '';
      G.cells.forEach((v, i) => {
        if (v < 0) { h += '<i class="pg-off"></i>'; return; }
        const cls = ['pg-hole', dest.includes(i) ? 'dest' : '', i === 24 && v === 0 ? 'centre' : ''].join(' ');
        h += `<button type="button" class="${cls}" data-i="${i}" aria-label="${v ? 'Bille' : 'Trou'}">${v ? `<span class="pg-ball${sel === i ? ' sel' : ''}${can.has(i) ? ' can' : ''}" data-i="${i}"></span>` : ''}</button>`;
      });
      board.innerHTML = h;
      const left = G.cells.filter(v => v === 1).length;
      q('left').textContent = left; q('moves').textContent = G.moves;
      q('undo').disabled = !hist.length;
      const stuck = !can.size;
      if (stuck) {
        const [t, d] = left === 1 && G.cells[24] === 1 ? rating(1) : left === 1 ? ['Excellent', 'Une seule bille, mais pas au centre.'] : rating(left);
        q('msg').innerHTML = `<b>${t}</b> ${left} bille${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}. ${d}`;
        q('msg').className = 'pg-msg end';
      } else { q('msg').textContent = ''; q('msg').className = 'pg-msg'; }
    }
    function doMove(from, to) {
      const j = jumps(from).find(x => x.to === to);
      if (!j) return false;
      hist.push(JSON.stringify(G));
      G.cells[from] = 0; G.cells[j.over] = 0; G.cells[to] = 1; G.moves++; sel = null;
      render();
      return true;
    }
    board.addEventListener('pointerdown', e => {
      const b = e.target.closest('.pg-ball'); if (!b) return;
      const i = +b.dataset.i;
      if (!jumps(i).length && sel === null) return;
      drag = { i, x: e.clientX, y: e.clientY, el: b, moved: false };
      try { b.setPointerCapture(e.pointerId); } catch {}
    });
    board.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6 && jumps(drag.i).length) { drag.moved = true; sel = drag.i; drag.el.classList.add('dragging'); }
      if (drag.moved) drag.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    });
    board.addEventListener('pointerup', e => {
      const d = drag; drag = null;
      if (!d) return;
      if (d.moved) {
        d.el.style.pointerEvents = 'none';
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pg-hole');
        d.el.style.pointerEvents = '';
        if (!(t && doMove(d.i, +t.dataset.i))) { sel = null; render(); }
      } else {
        // simple appui : une bille qu'on peut jouer se sélectionne, une autre bille change la sélection
        if (sel !== null && sel !== d.i && doMove(sel, d.i)) return;
        sel = sel === d.i ? null : (jumps(d.i).length ? d.i : sel); render();
      }
    });
    board.addEventListener('pointercancel', () => { drag = null; render(); });
    board.addEventListener('click', e => {
      const h = e.target.closest('.pg-hole'); if (!h || sel === null || h.querySelector('.pg-ball')) return;
      doMove(sel, +h.dataset.i);
    });
    q('undo').addEventListener('click', () => { if (hist.length) { G = JSON.parse(hist.pop()); sel = null; render(); } });
    q('restart').addEventListener('click', newGame);
    q('boards').addEventListener('change', e => { kind = e.target.value; store.set('billes:board', kind); newGame(); });
    newGame();
  },
};
