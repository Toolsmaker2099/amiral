// Memory : 10 paires d'émojis, cartes qui se retournent. Solo contre un ordinateur plus ou moins étourdi.
import { memory as rules, FACES } from '../../shared/memory.js';

let cards = [], api = null, lastCtx = null, lastV = null;
let known = new Map(), lockUntil = 0, lockSig = '', timer = null;

function observe(v) {
  v.cards.forEach((c, i) => {
    if (c.s === 'u') known.set(i, c.f);
    else if (c.s === 'm') known.delete(i);
  });
}
function aiMove(state, level, v) {
  const forget = { easy: .6, medium: .25, hard: 0 }[level] ?? .25;
  const first = state.flip.length !== 1;
  const cur = first ? null : state.flip[0];
  const all = [];
  for (let i = 0; i < state.deck.length; i++) if (state.done[i] === null) all.push(i);
  // L'ordinateur oublie une partie de ce qu'il a vu.
  if (first) for (const k of [...known.keys()]) if (Math.random() < forget) known.delete(k);
  const cand = all.filter(i => i !== cur);
  const unknown = cand.filter(i => !known.has(i));
  if (first) {
    const byFace = new Map();
    for (const [i, f] of known) if (state.done[i] === null) { if (byFace.has(f)) return { i: byFace.get(f) }; byFace.set(f, i); }
    const pool = unknown.length ? unknown : cand;
    return { i: pool[Math.floor(Math.random() * pool.length)] };
  }
  const f = state.deck[cur];
  for (const [i, ff] of known) if (i !== cur && ff === f && state.done[i] === null) return { i };
  const pool = unknown.length ? unknown : cand;
  return { i: pool[Math.floor(Math.random() * pool.length)] };
}

export default {
  id: 'memory', theme: 'memory', rules, solo: 'ai',
  title: ['Me', 'mory'], tagline: 'Retrouvez les paires',
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'medium', label: 'Moyen' }, { id: 'hard', label: 'Fort' }], defaultLevel: 'medium',
  aiMove, observe,
  aiDelay: v => (v.mismatch ? 1500 : 750),
  reset() { known = new Map(); lockUntil = 0; lockSig = ''; clearTimeout(timer); },
  mount(stage, a) {
    api = a;
    stage.innerHTML = '<div class="mem-pairs" data-r="pairs"></div><div class="mem-grid">' +
      Array.from({ length: 20 }, (_, i) => `<button type="button" class="mc" data-i="${i}" aria-label="Carte ${i + 1}"><span class="face"></span><span class="back"></span></button>`).join('') + '</div>';
    cards = [...stage.querySelectorAll('.mc')];
    stage.addEventListener('click', e => { const b = e.target.closest('.mc'); if (b && !b.disabled) api.play({ i: +b.dataset.i }); });
  },
  render(stage, v, ctx) {
    lastCtx = ctx; lastV = v;
    // Deux cartes différentes restent visibles un instant, puis se retournent.
    const sig = v.mismatch ? v.flip.join(',') + ':' + v.pairs.join(',') : '';
    if (sig && sig !== lockSig) { lockSig = sig; lockUntil = Date.now() + 1300; clearTimeout(timer); timer = setTimeout(() => api.rerender(), 1320); }
    if (!sig) lockSig = '';
    const hideMismatch = v.mismatch && Date.now() >= lockUntil;
    const locked = v.mismatch && Date.now() < lockUntil;
    v.cards.forEach((c, i) => {
      const el = cards[i];
      const up = c.s === 'u' && !hideMismatch;
      const state = c.s === 'm' ? 'm' : up ? 'u' : 'd';
      el.className = 'mc ' + (state === 'm' ? 'match o' + (c.o === ctx.seat ? 'me' : 'op') : state === 'u' ? 'up' : '');
      const face = el.firstChild;
      if (c.f !== undefined && c.f !== null) face.textContent = FACES[c.f];
      el.disabled = !ctx.interactive || locked || c.s !== 'd' && !(c.s === 'u' && hideMismatch);
    });
    const pr = v.pairs, me = pr[ctx.seat] ?? 0, op = pr[1 - ctx.seat] ?? 0;
    stage.querySelector('[data-r=pairs]').innerHTML = `<span class="me">Vous : <b>${me}</b></span><span class="sep">paires</span><span class="op">${ctx.online ? 'Adversaire' : 'Ordinateur'} : <b>${op}</b></span>`;
  },
  statusText(v, ctx) {
    if (ctx.over) return null;
    return null;
  },
};
