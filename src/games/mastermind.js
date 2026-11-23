// Mastermind : trouver le code de 4 couleurs. Plateau sombre, billes lumineuses.
import { mastermind as rules, COLORS, LEN, TRIES } from '../../shared/mastermind.js';

const NAMES = ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet'];
let cur = new Array(LEN).fill(null), api = null, lastCtx = null, host = null;

const peg = (c, extra = '') => `<i class="peg c${c === null ? 'x' : c} ${extra}"></i>`;
const posHTML = (g, i) => `<span class="pw">${peg(g.g[i])}<i class="pdot ${g.pos[i] || ''}"></i></span>`;
const fbHTML = g => {
  let h = '';
  for (let i = 0; i < LEN; i++) h += `<i class="fb ${i < g.b ? 'b' : i < g.b + g.w ? 'w' : ''}"></i>`;
  return `<span class="fbs">${h}</span>`;
};

// La première ligne est en bas : le code est en haut, les essais montent.
function rowsHTML(guesses, composing, secretRow, positional) {
  const rows = [];
  for (let r = 0; r < TRIES; r++) {
    const g = guesses[r];
    if (g) rows.push(`<div class="mm-row done">${positional && g.pos ? g.g.map((_, i) => posHTML(g, i)).join('') : g.g.map(c => peg(c)).join('') + fbHTML(g)}<span class="lab">${r + 1}</span></div>`);
    else if (composing && r === guesses.length) rows.push(`<div class="mm-row now">${cur.map((c, i) => `<button type="button" class="slot" data-s="${i}" aria-label="Case ${i + 1}">${peg(c)}</button>`).join('')}<span class="fbs"></span><span class="lab">${r + 1}</span></div>`);
    else rows.push(`<div class="mm-row empty">${Array.from({ length: LEN }, () => peg(null)).join('')}<span class="lab">${r + 1}</span></div>`);
  }
  rows.reverse();
  if (secretRow) rows.unshift(`<div class="mm-row secret">${secretRow.map(c => peg(c)).join('')}<span class="lab">Code</span></div>`);
  else rows.unshift(`<div class="mm-row secret hidden">${Array.from({ length: LEN }, () => '<i class="peg cq">?</i>').join('')}<span class="lab">Code</span></div>`);
  return rows.join('');
}

export default {
  id: 'mastermind', theme: 'mastermind', rules, solo: 'single',
  title: ['Master', 'mind'], tagline: 'Cassez le code',
  singleLabels: ['Codes trouvés', 'Échecs'],
  options: [{ id: 'positional', label: 'Indices attribués à une position', hint: 'Chaque pion indique s\'il est bien placé, mal placé ou absent.' }],
  reset() { cur = new Array(LEN).fill(null); },
  mount(stage, a) {
    api = a; host = stage;
    stage.innerHTML = '<div class="mm"><div class="mm-main"><div class="mm-rows" data-r="rows"></div><div class="mm-palette" data-r="palette"></div><button type="button" class="btn primary" data-r="ok">Valider</button><p class="mm-legend" data-r="legend"></p></div><div class="mm-opp" data-r="opp" hidden></div></div>';
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
    stage.querySelector('[data-r=rows]').innerHTML = rowsHTML(mine, composing, v.secret, v.positional);
    stage.querySelectorAll('.pal').forEach(b => { b.disabled = !composing; });
    const ok = stage.querySelector('[data-r=ok]');
    ok.hidden = !composing; ok.disabled = !cur.every(c => c !== null);
    stage.querySelector('[data-r=palette]').hidden = !composing;
    stage.querySelector('[data-r=legend]').innerHTML = v.positional
      ? '<span class="pdot b"></span> bien placé <span class="pdot w"></span> ailleurs <span class="pdot"></span> absent'
      : '<i class="fb b"></i> bien placé <i class="fb w"></i> mal placé';
    const opp = stage.querySelector('[data-r=opp]');
    opp.hidden = v.solo;
    if (!v.solo) {
      const og = v.guesses[1 - ctx.seat] || [];
      opp.innerHTML = `<h3>${ctx.online ? 'Adversaire' : 'Ordinateur'}</h3>` + Array.from({ length: TRIES }, (_, r) => og[r]
        ? `<div class="mm-row mini done">${v.positional && og[r].pos ? og[r].g.map((_, i) => posHTML(og[r], i)).join('') : og[r].g.map(c => peg(c)).join('') + fbHTML(og[r])}</div>`
        : `<div class="mm-row mini empty">${Array.from({ length: LEN }, () => peg(null)).join('')}</div>`).reverse().join('');
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
