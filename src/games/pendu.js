// Pendu : un tableau noir, des lettres à la craie.
import { pendu as rules } from '../../shared/pendu.js';

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const E = {
  base: '<path d="M14 150h104"/>', post: '<path d="M34 150V12"/>', beam: '<path d="M34 12h76"/>', brace: '<path d="M34 38l26-26"/>', rope: '<path d="M110 12v20"/>',
  head: '<circle cx="110" cy="46" r="14"/>', body: '<path d="M110 60v48"/>', armL: '<path d="M110 72l-22 20"/>', armR: '<path d="M110 72l22 20"/>', legL: '<path d="M110 108l-20 32"/>', legR: '<path d="M110 108l20 32"/>',
};
// Une erreur = un élément de plus, dans cet ordre (11 erreurs, solo comme duel).
const ORDER = ['base', 'post', 'beam', 'brace', 'rope', 'head', 'body', 'armL', 'armR', 'legL', 'legR'];
let api = null, lastCtx = null, lastV = null;

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || !lastCtx?.interactive || !lastV) return;
  const host = document.getElementById('game-pendu');
  if (!host || host.hidden) return;
  const l = e.key.toUpperCase();
  if (/^[A-Z]$/.test(l) && !lastV.guessed.includes(l)) api.play({ l });
}

export default {
  id: 'pendu', theme: 'pendu', rules, solo: 'single',
  title: ['Pen', 'du'], tagline: 'Devinez le mot',
  singleLabels: ['Mots trouvés', 'Pendus'],
  mount(stage, a) {
    api = a;
    stage.innerHTML = '<div class="pd"><svg class="pd-draw" viewBox="0 0 140 160" aria-hidden="true"></svg><div class="pd-lives" data-r="lives"></div><div class="pd-word" data-r="word" aria-live="polite"></div><div class="pd-keys" data-r="keys"></div></div>';
    stage.querySelector('[data-r=keys]').innerHTML = KEYS.map(l => `<button type="button" class="key" data-l="${l}">${l}</button>`).join('');
    stage.addEventListener('click', e => { const k = e.target.closest('.key'); if (k && !k.disabled) api.play({ l: k.dataset.l }); });
    document.addEventListener('keydown', onKey);
  },
  render(stage, v, ctx) {
    lastCtx = ctx; lastV = v;
    const mine = v.errors[ctx.seat], svg = stage.querySelector('.pd-draw');
    const prev = svg.dataset.n === undefined ? 0 : +svg.dataset.n, shown = Math.min(ORDER.length, mine);
    svg.innerHTML = ORDER.slice(0, shown).map((k, i) => `<g class="chalk${i >= prev && shown > prev ? ' new' : ''}">${E[k]}</g>`).join('');
    svg.dataset.n = shown;
    stage.querySelector('[data-r=word]').innerHTML = v.mask.map((l, i) => `<span class="ltr${l && !v.revealedByGuess[i] ? ' miss' : ''}">${l}</span>`).join('');
    const heart = (n, max) => Array.from({ length: max }, (_, i) => `<i class="hrt${i < n ? ' lost' : ''}"></i>`).join('');
    stage.querySelector('[data-r=lives]').innerHTML = v.solo
      ? `<span>Erreurs</span>${heart(mine, v.max)}`
      : `<span>Vous</span>${heart(mine, v.max)}<span class="sp"></span><span>${ctx.online ? 'Adversaire' : 'Ordinateur'}</span>${heart(v.errors[1 - ctx.seat], v.max)}`;
    stage.querySelectorAll('.key').forEach(k => {
      const l = k.dataset.l, used = v.guessed.includes(l);
      k.disabled = used || !ctx.interactive;
      k.className = 'key' + (used ? (v.mask.includes(l) || (v.word && v.word.includes(l)) ? ' ok' : ' ko') : '');
    });
  },
  statusText(v, ctx) {
    if (v.solo && ctx.over) return v.result.winner === 0 ? 'Bravo, mot trouvé !' : 'Pendu ! Le mot était :';
    if (!ctx.over && ctx.interactive) return v.solo ? 'Choisissez une lettre' : 'À vous : choisissez une lettre';
    return null;
  },
};
