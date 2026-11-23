// Cartes à jouer et glisser-déposer, communs au Solitaire et au FreeCell.
export const SUIT_CH = ['♣', '♦', '♥', '♠'];                 // l'ordre des jeux de Windows : trèfle, carreau, cœur, pique
export const RANK_CH = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = s => s === 1 || s === 2;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function fullDeck() {
  const d = [];
  for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push({ s, r });
  return d;
}

// Une carte posée à (x, y) dans le plateau. `key` et `zone` servent aux gestes.
export function cardHTML(c, { x, y, z = 1, up = true, key, zone, cls = '' }) {
  const col = isRed(c.s) ? 'red' : 'blk';
  const face = up ? `<span class="cr">${RANK_CH[c.r]}<b>${SUIT_CH[c.s]}</b></span><span class="cc">${c.r >= 10 ? RANK_CH[c.r] : SUIT_CH[c.s]}</span><span class="cr bot">${RANK_CH[c.r]}<b>${SUIT_CH[c.s]}</b></span>` : '';
  return `<div class="card95 ${up ? 'face ' + col : 'back'} ${cls}" data-key="${key}" data-zone="${zone}" style="left:${x}px;top:${y}px;z-index:${z}">${face}</div>`;
}
export const slotHTML = (zone, x, y, w, h, label = '', extra = '') =>
  `<div class="slot95" data-zone="${zone}" ${extra} style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${label}</div>`;

// start(el) → { els } ou null ; drop(groupe, zone) → booléen ; tap(groupe, el) ; dbl(groupe, el)
export function dragger(board, { start, drop, tap, dbl }) {
  let st = null, last = { key: null, t: 0 };
  const reset = g => g.els.forEach(el => { el.style.transform = ''; el.classList.remove('dragging'); });
  board.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const el = e.target.closest('.card95'); if (!el) return;
    const grp = start(el); if (!grp) return;
    st = { el, grp, x: e.clientX, y: e.clientY, drag: false };
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  board.addEventListener('pointermove', e => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.drag && Math.hypot(dx, dy) > 6) { st.drag = true; st.grp.els.forEach(el => el.classList.add('dragging')); }
    if (st.drag) st.grp.els.forEach(el => { el.style.transform = `translate(${dx}px, ${dy}px)`; });
  });
  board.addEventListener('pointerup', e => {
    if (!st) return;
    const s = st; st = null;
    if (s.drag) {
      s.grp.els.forEach(el => { el.style.pointerEvents = 'none'; });
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-zone]');
      s.grp.els.forEach(el => { el.style.pointerEvents = ''; });
      if (!(t && drop(s.grp, t.dataset.zone))) reset(s.grp);
    } else {
      const now = Date.now(), key = s.el.dataset.key;
      if (last.key === key && now - last.t < 380) { last = { key: null, t: 0 }; dbl(s.grp, s.el); }
      else { last = { key, t: now }; tap(s.grp, s.el); }
    }
  });
  board.addEventListener('pointercancel', () => { if (st) { reset(st.grp); st = null; } });
}
