// Pendu : un tableau noir, des lettres à la craie.
import { pendu as rules } from '../../shared/pendu.js';

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
// Une erreur = un trait de plus. Le dessin commence vide ; 7 erreurs en solo, 6 en duel.
const BASE = '<path d="M14 150h104"/>', POST = '<path d="M34 150V12"/>', BEAM = '<path d="M34 12h76M34 36l24-24"/>', ROPE = '<path d="M110 12v20"/>';
const HEAD = '<circle cx="110" cy="46" r="14"/>', BODY = '<path d="M110 60v48"/>', ARMS = '<path d="M110 72l-22 20M110 72l22 20"/>', LEGS = '<path d="M110 108l-20 32M110 108l20 32"/>';
const SETS = {
  7: [BASE, POST, BEAM, ROPE, HEAD, BODY, ARMS + LEGS],
  6: [BASE + POST, BEAM + ROPE, HEAD, BODY, ARMS, LEGS],
};
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
    const mine = v.errors[ctx.seat], parts = SETS[v.max] || SETS[6], svg = stage.querySelector('.pd-draw');
    const prev = svg.dataset.n === undefined ? 0 : +svg.dataset.n, shown = Math.min(parts.length, mine);
    svg.innerHTML = parts.slice(0, shown).map((p, i) => `<g class="chalk${i >= prev && shown > prev ? ' new' : ''}">${p}</g>`).join('');
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
