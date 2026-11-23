// Mastermind : trouver le code de 4 couleurs. Plateau sombre, billes lumineuses.
import { mastermind as rules, COLORS, LEN, TRIES } from '../../shared/mastermind.js';

const NAMES = ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet'];
let cur = new Array(LEN).fill(null), api = null, lastCtx = null, host = null;

const peg = (c, extra = '') => `<i class="peg c${c === null ? 'x' : c} ${extra}"></i>`;
const fbHTML = g => {
  let h = '';
  for (let i = 0; i < LEN; i++) h += `<i class="fb ${i < g.b ? 'b' : i < g.b + g.w ? 'w' : ''}"></i>`;
  return `<span class="fbs">${h}</span>`;
};

function rowsHTML(guesses, composing, secretRow) {
  let h = '';
  if (secretRow) h += `<div class="mm-row secret">${secretRow.map(c => peg(c)).join('')}<span class="lab">Code</span></div>`;
  for (let r = 0; r < TRIES; r++) {
    const g = guesses[r];
    if (g) h += `<div class="mm-row done">${g.g.map(c => peg(c)).join('')}${fbHTML(g)}<span class="lab">${r + 1}</span></div>`;
    else if (composing && r === guesses.length) h += `<div class="mm-row now">${cur.map((c, i) => `<button type="button" class="slot" data-s="${i}" aria-label="Case ${i + 1}">${peg(c)}</button>`).join('')}<span class="fbs"></span><span class="lab">${r + 1}</span></div>`;
    else h += `<div class="mm-row empty">${Array.from({ length: LEN }, () => peg(null)).join('')}<span class="fbs"></span><span class="lab">${r + 1}</span></div>`;
  }
  return h;
}

export default {
  id: 'mastermind', theme: 'mastermind', rules, solo: 'single',
  title: ['Master', 'mind'], tagline: 'Cassez le code',
  singleLabels: ['Codes trouvés', 'Échecs'],
  reset() { cur = new Array(LEN).fill(null); },
  mount(stage, a) {
    api = a; host = stage;
    stage.innerHTML = '<div class="mm"><div class="mm-main"><div class="mm-rows" data-r="rows"></div><div class="mm-palette" data-r="palette"></div><button type="button" class="btn primary" data-r="ok">Valider</button><p class="mm-legend"><i class="fb b"></i> bien placé <i class="fb w"></i> mal placé</p></div><div class="mm-opp" data-r="opp" hidden></div></div>';
    const pal = stage.querySelector('[data-r=palette]');
    pal.innerHTML = Array.from({ length: COLORS }, (_, c) => `<button type="button" class="pal" data-c="${c}" aria-label="${NAMES[c]}">${peg(c)}</button>`).join('');
    stage.addEventListener('click', e => {
      if (!lastCtx || !lastCtx.interactive) return;
      const p = e.target.closest('.pal'), s = e.target.closest('.slot'), ok = e.target.closest('[data-r=ok]');
      if (p) { const i = cur.indexOf(null); if (i >= 0) { cur[i] = +p.dataset.c; api.rerender(); } }
      else if (s) { cur[+s.dataset.s] = null; api.rerender(); }
      else if (ok && cur.every(c => c !== null)) { const g = cur.slice(); cur = new Array(LEN).fill(null); api.play({ g }); }
    });
  },
  render(stage, v, ctx) {
    lastCtx = ctx;
    const mine = v.guesses[ctx.seat] || [], composing = ctx.interactive && mine.length < TRIES;
    stage.querySelector('[data-r=rows]').innerHTML = rowsHTML(mine, composing, v.secret);
    stage.querySelectorAll('.pal').forEach(b => { b.disabled = !composing; });
    const ok = stage.querySelector('[data-r=ok]');
    ok.hidden = !composing; ok.disabled = !cur.every(c => c !== null);
    stage.querySelector('[data-r=palette]').hidden = !composing;
    const opp = stage.querySelector('[data-r=opp]');
    opp.hidden = v.solo;
    if (!v.solo) {
      const og = v.guesses[1 - ctx.seat] || [];
      opp.innerHTML = `<h3>${ctx.online ? 'Adversaire' : 'Ordinateur'}</h3>` + Array.from({ length: TRIES }, (_, r) => og[r]
        ? `<div class="mm-row mini done">${og[r].g.map(c => peg(c)).join('')}${fbHTML(og[r])}</div>`
        : `<div class="mm-row mini empty">${Array.from({ length: LEN }, () => peg(null)).join('')}<span class="fbs"></span></div>`).join('');
    }
  },
  statusText(v, ctx) {
    const mine = v.guesses[ctx.seat] || [];
    if (v.solo) {
      if (!ctx.over) return `Essai ${mine.length + 1} sur ${TRIES}`;
      return v.solved[0] !== null ? `Code trouvé en ${v.solved[0]} essai${v.solved[0] > 1 ? 's' : ''} !` : 'Perdu : voici le code';
    }
    if (ctx.over) {
      const s = v.solved;
      return ctx.result === 'draw' ? (s[0] !== null || s[1] !== null ? 'Égalité : code trouvé en même temps' : 'Personne n\'a trouvé le code') : ctx.result === 'win' ? 'Vous avez trouvé le code en premier !' : 'Votre adversaire a trouvé le code';
    }
    return ctx.interactive ? `Votre essai ${mine.length + 1} sur ${TRIES}` : null;
  },
};
