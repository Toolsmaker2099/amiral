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

// ----- Dessin des cartes : jeu français (pips, figures Valet / Dame / Roi) -----
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="su0" viewBox="0 0 24 24"><circle cx="12" cy="6.6" r="5.2"/><circle cx="6.2" cy="14.6" r="5.2"/><circle cx="17.8" cy="14.6" r="5.2"/><path d="M12 11l-3 12.4h6z"/></symbol>
<symbol id="su1" viewBox="0 0 24 24"><path d="M12 .8L21.4 12 12 23.2 2.6 12z"/></symbol>
<symbol id="su2" viewBox="0 0 24 24"><path d="M12 22.6C5 16.6 1.6 12.6 1.6 8A5.6 5.6 0 0 1 12 5.4 5.6 5.6 0 0 1 22.4 8c0 4.6-3.4 8.6-10.4 14.6z"/></symbol>
<symbol id="su3" viewBox="0 0 24 24"><path d="M12 .8C16 6.6 22.4 9.6 22.4 15a5.4 5.4 0 0 1-9.4 3.6c.3 2.2 1.2 3.7 2.8 4.6H8.2c1.6-.9 2.5-2.4 2.8-4.6A5.4 5.4 0 0 1 1.6 15C1.6 9.6 8 6.6 12 .8z"/></symbol>
</defs></svg>`;
if (typeof document !== 'undefined' && !document.getElementById('card-defs')) {
  const d = document.createElement('div'); d.id = 'card-defs'; d.innerHTML = DEFS; document.body.appendChild(d);
}
const suit = (s, x, y, w, rot = false) => `<use href="#su${s}" x="${x - w / 2}" y="${y - w / 2}" width="${w}" height="${w}"${rot ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
const L = 32, C = 50, R = 68;
const PIPS = [
  [[C, 70]], [[C, 30], [C, 110]], [[C, 30], [C, 70], [C, 110]],
  [[L, 30], [R, 30], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [C, 70], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [L, 70], [R, 70], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [C, 90], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [L, 57], [R, 57], [C, 70], [L, 83], [R, 83], [L, 110], [R, 110]],
  [[L, 30], [R, 30], [C, 43], [L, 57], [R, 57], [L, 83], [R, 83], [C, 97], [L, 110], [R, 110]],
];
// Une moitié de figure (haut de la carte) ; l'autre moitié est la même, tournée.
function figureHalf(r, s) {
  const red = isRed(s), robe = red ? '#c8102e' : '#1d3f8a', robe2 = red ? '#f2c230' : '#e8b923', hair = '#6a3b12', skin = '#f4d4ac';
  let g = `<path d="M5 48C5 36 15 31 28 31s23 6 23 17z" fill="${robe}" stroke="#222" stroke-width="1.2"/><path d="M15 48c0-8 5-12 13-12s13 4 13 12" fill="none" stroke="${robe2}" stroke-width="3"/>`;
  if (r === 12) g += `<path d="M20 26q8 12 16 0q-8 4-16 0z" fill="#e9e3d2" stroke="#222" stroke-width="1"/>`;
  if (r === 11) g += `<path d="M18 14q-4 18 3 24l2-18zM38 14q4 18-3 24l-2-18z" fill="${hair}" stroke="#222" stroke-width="1"/>`;
  g += `<circle cx="28" cy="20" r="8.4" fill="${skin}" stroke="#222" stroke-width="1.2"/><circle cx="25" cy="19.5" r="1" fill="#222"/><circle cx="31" cy="19.5" r="1" fill="#222"/><path d="M25.5 24q2.5 1.6 5 0" fill="none" stroke="#7a2a1a" stroke-width="1"/>`;
  if (r === 12) g += `<path d="M19.5 14L21 3l5 6 2-7 2 7 5-6 1.5 11z" fill="#f2c230" stroke="#222" stroke-width="1.2"/><path d="M20 26q8 6 16 0" fill="none" stroke="#e9e3d2" stroke-width="3" opacity=".0"/>`;
  else if (r === 11) g += `<path d="M20 14.5L22 6l4 5 2-6 2 6 4-5 2 8.5z" fill="#f2c230" stroke="#222" stroke-width="1.2"/><path d="M19 15q9-4 18 0" fill="none" stroke="#222" stroke-width="1"/>`;
  else g += `<path d="M18.5 15Q28 -2 37.5 15z" fill="${red ? '#1d3f8a' : '#c8102e'}" stroke="#222" stroke-width="1.2"/><path d="M36 9Q48 0 52 12Q44 8 37 14z" fill="${robe2}" stroke="#222" stroke-width="1"/>`;
  return g + `<g class="fs">${suit(s, 9, 41, 11)}</g>`;
}
const faceCache = {};
function faceSVG(c) {
  const k = c.r * 4 + c.s;
  if (faceCache[k]) return faceCache[k];
  const rank = RANK_CH[c.r];
  let body = '';
  if (c.r === 0) body = suit(c.s, 50, 70, 46);
  else if (c.r <= 9) body = PIPS[c.r].map(([x, y]) => suit(c.s, x, y, c.r > 7 ? 21 : 24, y > 70)).join('');
  else body = `<rect x="19" y="22" width="62" height="96" rx="3" fill="#fff8e6" stroke="currentColor" stroke-width="1.4"/>
    <g transform="translate(22 22)">${figureHalf(c.r, c.s)}</g>
    <g transform="rotate(180 50 70) translate(22 22)">${figureHalf(c.r, c.s)}</g>
    <path d="M19 70h62" stroke="currentColor" stroke-width="1" opacity=".5"/>`;
  const idx = (rot) => `<g${rot ? ' transform="rotate(180 50 70)"' : ''}><text x="11.5" y="25" text-anchor="middle" font-size="${rank.length > 1 ? 21 : 25}" font-weight="700" font-family="Arial Narrow, Arial, sans-serif" ${rank.length > 1 ? 'letter-spacing="-2"' : ''}>${rank}</text>${suit(c.s, 11.5, 38, 14)}</g>`;
  return (faceCache[k] = `<svg viewBox="0 0 100 140" fill="currentColor" aria-hidden="true">${idx(false)}${idx(true)}${body}</svg>`);
}

// Une carte posée à (x, y) dans le plateau. `key` et `zone` servent aux gestes.
export function cardHTML(c, { x, y, z = 1, up = true, key, zone, cls = '' }) {
  const col = isRed(c.s) ? 'red' : 'blk';
  return `<div class="card95 ${up ? 'face ' + col : 'back'} ${cls}" data-key="${key}" data-zone="${zone}" style="left:${x}px;top:${y}px;z-index:${z}">${up ? faceSVG(c) : ''}</div>`;
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
