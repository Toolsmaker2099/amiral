// La boîte à jeux : l'écran d'accueil qui lance Amiral ou le Morpion.
import { savedOnline, CODE_RE, normalizeCode } from './online.js';

const $ = id => document.getElementById(id);
const screens = { hub: $('hub'), amiral: $('gameAmiral'), morpion: $('gameMorpion') };
const TITLES = { hub: 'La boîte à jeux', amiral: 'Amiral · La boîte à jeux', morpion: 'Morpion · La boîte à jeux' };
const THEME = { hub: '#15112f', amiral: '#06131f', morpion: '#f7f2e2' };

async function show(game, opts) {
  if (game === 'amiral') await import('./ui.js');
  if (game === 'morpion') (await import('./morpion.js')).open(opts);
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== game;
  document.title = TITLES[game];
  document.body.dataset.game = game;
  $('themeColor').setAttribute('content', THEME[game]);
  window.scrollTo(0, 0);
}

document.querySelectorAll('.game-card[data-game]').forEach(b => b.addEventListener('click', () => show(b.dataset.game)));
window.addEventListener('tc:open', e => show(e.detail));

// Lien d'invitation (?partie=CODE&jeu=morpion), partie en ligne à reprendre, sinon l'accueil.
const params = new URLSearchParams(location.search);
const invited = normalizeCode(params.get('partie')), game = params.get('jeu') || 'amiral';
if (CODE_RE.test(invited) && game === 'morpion') { history.replaceState(null, '', location.pathname + location.hash); show('morpion', { invite: invited }); }
else if (CODE_RE.test(invited)) show('amiral');                 // Amiral lit lui-même le lien
else if (savedOnline('amiral')) show('amiral');
else if (savedOnline('morpion')) show('morpion', { resume: true });
else show('hub');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
  });
}
