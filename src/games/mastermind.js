// Mastermind : plateau de bois, pions de couleur, code caché sous un couvercle en laiton.
import { mastermind as rules } from '../../shared/mastermind.js';

const NAMES = ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Orange', 'Violet', 'Turquoise', 'Rose'];
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let api = null, lastCtx = null, lastV = null, host = null, root = null;
let cur = [], cursor = null, sig = '', revealed = false;

const pegHTML = c => `<span class="mmw-peg c${c}"><span class="pn">${c + 1}</span></span>`;
const el = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function fit() {
  if (!root) return;
  const v = lastV; if (!v) return;
  const W = Math.min(host.clientWidth || 360, 640);
  const units = v.positional ? (v.len === 6 ? 11.9 : 8.4) : (v.len === 6 ? 9.8 : 7.0);
  const peg = Math.max(16, Math.min(46, (W - 86) / units));
  root.style.setProperty('--peg', peg + 'px');
  root.style.setProperty('--fbcols', v.positional ? v.len : (v.len === 6 ? 3 : 2));
  root.style.setProperty('--fbs', v.positional ? '.42' : '.3');
}

function build(v) {
  const rows = root.querySelector('.mmw-rows'), secret = root.querySelector('.mmw-secret-slots'), pal = root.querySelector('.mmw-palette');
  rows.innerHTML = '';
  for (let i = 0; i < v.tries; i++) {
    const r = el('mmw-row'); r.dataset.i = i;
    r.appendChild(Object.assign(el('mmw-num'), { textContent: i + 1 }));
    const slots = el('mmw-slots');
    for (let j = 0; j < v.len; j++) { const h = el('mmw-hole', 'button'); h.type = 'button'; h.dataset.j = j; h.disabled = true; slots.appendChild(h); }
    const fb = el('mmw-fb');
    for (let j = 0; j < v.len; j++) fb.appendChild(el('mmw-fbh', 'span'));
    r.append(slots, fb); rows.appendChild(r);
  }
  secret.innerHTML = '';
  for (let j = 0; j < v.len; j++) secret.appendChild(el('mmw-hole'));
  root.querySelector('.mmw-cover').classList.remove('open');
  pal.innerHTML = '';
  for (let c = 0; c < v.colors; c++) {
    const w = el('mmw-pal'); w.dataset.c = c; w.setAttribute('role', 'button'); w.tabIndex = 0;
    w.draggable = !!(window.matchMedia && matchMedia('(pointer:fine)').matches);
    w.setAttribute('aria-label', `${NAMES[c]} (touche ${c + 1})`); w.title = `${NAMES[c]} · touche ${c + 1}`;
    w.innerHTML = pegHTML(c); pal.appendChild(w);
  }
  cur = new Array(v.len).fill(null); cursor = null; revealed = false;
}

function setHole(h, c) {
  const key = c === null || c === undefined ? '' : String(c);
  if (h.dataset.c === key) return;
  h.dataset.c = key; h.innerHTML = key === '' ? '' : pegHTML(c);
}

function place(c, j) {
  const v = lastV; if (!v || !lastCtx?.interactive) return;
  let t = j;
  if (!v.dup && cur.includes(c) && !(t != null && cur[t] === c)) return shake();
  if (t == null) t = cursor != null && cur[cursor] === null ? cursor : cur.indexOf(null);
  if (t < 0) return shake();
  cur[t] = c; cursor = null; api.rerender();
}
function shake() {
  const r = root.querySelector('.mmw-row.active'); if (!r) return;
  r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
}
function removeLast() {
  let t = -1;
  if (cursor != null && cur[cursor] !== null) t = cursor;
  else for (let i = cur.length - 1; i >= 0; i--) if (cur[i] !== null) { t = i; break; }
  if (t < 0) return;
  cur[t] = null; cursor = null; api.rerender();
}
const submit = () => {
  if (!lastCtx?.interactive || cur.includes(null) || !cur.length) return;
  const g = cur.slice(); cur = new Array(g.length).fill(null); cursor = null; api.play({ g });
};

function onKey(e) {
  if (!root || root.closest('.app')?.hidden || !lastCtx?.interactive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select')) return;
  if (document.querySelector('.overlay:not([hidden])')) return;
  const v = lastV;
  if (/^[1-8]$/.test(e.key)) { const c = +e.key - 1; if (c < v.colors) place(c, null); }
  else if (e.key === 'Backspace') { e.preventDefault(); removeLast(); }
  else if (e.key === 'Enter') { if (document.activeElement?.matches?.('button,.mmw-pal')) return; submit(); }
}

export default {
  id: 'mastermind', theme: 'mastermind', rules, solo: 'single',
  title: ['Master', 'mind'], tagline: 'Percez le code secret',
  singleLabels: ['Codes trouvés', 'Échecs'],
  defaultOptions: { positional: true },
  options: [
    { id: 'long', label: '6 pions', hint: '8 couleurs et 12 essais, au lieu de 4 pions, 6 couleurs et 10 essais.' },
    { id: 'nodup', label: 'Doublons de couleur interdits', hint: 'Chaque couleur apparaît au plus une fois dans le code.' },
    { id: 'positional', label: 'Indices attribués à une position', hint: 'Chaque indice correspond au pion placé au même endroit. Sinon, ils sont donnés en vrac.' },
  ],
  reset() { sig = ''; revealed = false; },
  mount(stage, a) {
    api = a; host = stage;
    stage.innerHTML = `<div class="mmw">
      <div class="mmw-frame"><section class="mmw-board" aria-label="Plateau de jeu">
        <div class="mmw-secret" aria-label="Code secret"><div class="mmw-secret-slots"></div><div class="mmw-cover"><span>Code secret</span></div></div>
        <div class="mmw-rows"></div>
        <div class="mmw-tray">
          <p class="mmw-status"></p>
          <div class="mmw-palette" aria-label="Couleurs disponibles"></div>
          <div class="mmw-btns"><button type="button" class="mmw-btn" data-r="clear">Effacer</button><button type="button" class="mmw-btn primary" data-r="ok">Valider</button></div>
          <div class="mmw-legend"></div>
          <button type="button" class="mmw-nums" aria-pressed="false">Afficher des chiffres sur les pions (daltonisme)</button>
        </div>
      </section></div>
      <p class="mmw-hint">Touchez une couleur (ou glissez-la) pour la poser · touchez un pion posé pour le retirer · clavier : 1-8, Retour arrière, Entrée</p>
      <div class="mmw-opp" hidden></div>
    </div>`;
    root = stage.querySelector('.mmw');
    const nums = lsGet('tc:mastermind:nums') === '1';
    root.classList.toggle('nums', nums);
    const nb = root.querySelector('.mmw-nums'); nb.setAttribute('aria-pressed', nums);
    nb.addEventListener('click', () => { const on = !root.classList.contains('nums'); root.classList.toggle('nums', on); nb.setAttribute('aria-pressed', on); lsSet('tc:mastermind:nums', on ? '1' : '0'); });

    root.addEventListener('click', e => {
      if (!lastCtx?.interactive) return;
      const p = e.target.closest('.mmw-pal'), h = e.target.closest('.mmw-row.active .mmw-hole');
      if (p) place(+p.dataset.c, null);
      else if (h) { const j = +h.dataset.j; if (cur[j] !== null) { cur[j] = null; cursor = j; } else cursor = cursor === j ? null : j; api.rerender(); }
      else if (e.target.closest('[data-r=ok]')) submit();
      else if (e.target.closest('[data-r=clear]')) { cur = cur.map(() => null); cursor = null; api.rerender(); }
    });
    root.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.mmw-pal')) { e.preventDefault(); place(+e.target.closest('.mmw-pal').dataset.c, null); }
    });
    root.addEventListener('dragstart', e => { const p = e.target.closest('.mmw-pal'); if (!p) return; e.dataTransfer.setData('text/plain', p.dataset.c); e.dataTransfer.effectAllowed = 'copy'; });
    root.addEventListener('dragover', e => { const h = e.target.closest('.mmw-row.active .mmw-hole'); if (h) { e.preventDefault(); h.classList.add('over'); } });
    root.addEventListener('dragleave', e => e.target.closest?.('.mmw-hole')?.classList.remove('over'));
    root.addEventListener('drop', e => {
      const h = e.target.closest('.mmw-row.active .mmw-hole'); if (!h) return;
      e.preventDefault(); h.classList.remove('over');
      const c = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(c) && c < lastV.colors) place(c, +h.dataset.j);
    });
    document.addEventListener('keydown', onKey);
    if ('ResizeObserver' in window) new ResizeObserver(() => fit()).observe(stage);
  },
  render(stage, v, ctx) {
    lastCtx = ctx; lastV = v;
    const s = `${v.len}-${v.tries}-${v.colors}-${v.positional ? 1 : 0}-${v.dup ? 1 : 0}`;
    if (s !== sig) { sig = s; build(v); }
    fit();
    const mine = v.guesses[ctx.seat] || [], composing = !!ctx.interactive && mine.length < v.tries && !ctx.over;
    const rows = root.querySelectorAll('.mmw-row');
    rows.forEach((r, i) => {
      const done = mine[i], active = composing && i === mine.length;
      r.classList.toggle('active', active);
      r.classList.toggle('win', !!done && done.b === v.len);
      r.querySelectorAll('.mmw-hole').forEach((h, j) => {
        setHole(h, done ? done.g[j] : active ? cur[j] : null);
        h.disabled = !active; h.tabIndex = active ? 0 : -1;
        h.classList.toggle('sel', active && cursor === j);
        h.setAttribute('aria-label', `Emplacement ${j + 1}`);
      });
      const fb = r.querySelectorAll('.mmw-fbh');
      fb.forEach((f, j) => {
        let k = '';
        if (done) k = v.positional ? (done.pos?.[j] === 'b' ? 'k' : done.pos?.[j] === 'w' ? 'w' : '') : (j < done.b ? 'k' : j < done.b + done.w ? 'w' : '');
        if (!f.classList.contains(k) || (!k && (f.classList.contains('k') || f.classList.contains('w')))) {
          f.classList.remove('k', 'w');
          if (k) { f.classList.add(k); f.style.animationDelay = (j * 90) + 'ms'; }
        }
      });
    });
    // Code secret : le couvercle glisse à la fin de la manche
    const cover = root.querySelector('.mmw-cover'), slots = root.querySelectorAll('.mmw-secret-slots .mmw-hole');
    if (v.secret && !revealed) {
      revealed = true; cover.classList.add('open');
      v.secret.forEach((c, i) => setTimeout(() => { if (slots[i] && revealed) setHole(slots[i], c); }, 450 + i * 130));
    } else if (!v.secret) { cover.classList.remove('open'); slots.forEach(h => setHole(h, null)); revealed = false; }
    // Palette, boutons, légende
    root.querySelectorAll('.mmw-pal').forEach(p => p.classList.toggle('used', !v.dup && composing && cur.includes(+p.dataset.c)));
    const empties = cur.filter(c => c === null).length;
    root.querySelector('[data-r=ok]').disabled = !composing || empties > 0;
    root.querySelector('[data-r=clear]').disabled = !composing || empties === v.len;
    root.querySelector('.mmw-palette').classList.toggle('off', !composing);
    root.querySelector('.mmw-status').textContent = composing ? `Essai ${mine.length + 1} sur ${v.tries} · ${empties ? plural(empties, 'pion') + ' à placer' : 'prêt à valider'}` : '';
    root.querySelector('.mmw-legend').innerHTML = v.positional
      ? '<span class="lg"><i class="mmw-fbh k"></i> pion bien placé</span><span class="lg"><i class="mmw-fbh w"></i> bonne couleur, mal placée</span><p>Chaque indice correspond au pion situé à la même place dans votre proposition.</p>'
      : '<span class="lg"><i class="mmw-fbh k"></i> bonne couleur, bon emplacement</span><span class="lg"><i class="mmw-fbh w"></i> bonne couleur, mauvais emplacement</span>';
    // Adversaire (duel)
    const opp = root.querySelector('.mmw-opp');
    opp.hidden = v.solo;
    if (!v.solo) {
      const og = v.guesses[1 - ctx.seat] || [];
      let h = `<h3>${ctx.online ? 'Adversaire' : 'Ordinateur'}</h3>`;
      for (let r = v.tries - 1; r >= 0; r--) {
        const g = og[r];
        h += `<div class="mmw-mini">${Array.from({ length: v.len }, (_, j) => `<i class="mmw-mp${g ? ' c' + g.g[j] : ''}"></i>`).join('')}<span class="mmw-mfb">${Array.from({ length: v.len }, (_, j) => {
          let k = ''; if (g) k = v.positional ? (g.pos?.[j] === 'b' ? 'k' : g.pos?.[j] === 'w' ? 'w' : '') : (j < g.b ? 'k' : j < g.b + g.w ? 'w' : '');
          return `<i class="mmw-mf ${k}"></i>`; }).join('')}</span></div>`;
      }
      opp.innerHTML = h;
    }
  },
  statusText(v, ctx) {
    const mine = v.guesses[ctx.seat] || [];
    if (v.solo) {
      if (!ctx.over) return `Essai ${mine.length + 1} sur ${v.tries}`;
      return v.solved[0] !== null ? `Code trouvé en ${v.solved[0]} essai${v.solved[0] > 1 ? 's' : ''} !` : 'Perdu : voici le code';
    }
    if (ctx.over) {
      const s = v.solved;
      return ctx.result === 'draw' ? (s[0] !== null || s[1] !== null ? 'Égalité : code trouvé en même temps' : 'Personne n\'a trouvé le code') : ctx.result === 'win' ? 'Vous avez trouvé le code en premier !' : 'Votre adversaire a trouvé le code';
    }
    return ctx.interactive ? `Votre essai ${mine.length + 1} sur ${v.tries}` : null;
  },
};
