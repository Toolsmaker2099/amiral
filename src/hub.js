// La boîte à jeux : l'écran d'accueil qui lance chaque jeu.
import { savedOnline, CODE_RE, normalizeCode } from './online.js';

const $ = id => document.getElementById(id);

// Jeux au tour par tour : un plugin chargé à la demande, joué par le moteur commun (shell.js).
const PLUGINS = {
  c4: () => import('./games/c4.js'),
  dames: () => import('./games/dames.js'),
  mastermind: () => import('./games/mastermind.js'),
  memory: () => import('./games/memory.js'),
  pendu: () => import('./games/pendu.js'),
};
// Jeux solo sans adversaire : chacun se monte lui-même dans une page à son image.
const SOLO = {
  demineur: () => import('./games/demineur.js'),
  solitaire: () => import('./games/solitaire.js'),
  freecell: () => import('./games/freecell.js'),
  billes: () => import('./games/billes.js'),
};
const NAMES = { demineur: 'Démineur', solitaire: 'Solitaire', freecell: 'FreeCell', billes: 'Solitaire à billes',  hub: 'La boîte à jeux', amiral: 'Amiral', morpion: 'Morpion', c4: 'Puissance 4', dames: 'Dames', mastermind: 'Mastermind', memory: 'Memory', pendu: 'Pendu' };
const THEME = { demineur: '#008080', solitaire: '#008080', freecell: '#008080', billes: '#2b1a0e',  hub: '#15112f', amiral: '#06131f', morpion: '#f7f2e2', c4: '#0c2465', dames: '#2d1c10', mastermind: '#14161c', memory: '#ffc4d8', pendu: '#1d3a2e' };

// Cartes de l'accueil des jeux ajoutés par le moteur commun.
const CARDS = [
  { id: 'c4', desc: 'Alignez quatre jetons avant votre adversaire.', art: `
    <rect width="240" height="120" fill="#0c2465"/><rect x="40" y="8" width="160" height="112" rx="12" fill="#2358d8"/>
    ${Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => {
      const t = ['_______', '_______', '___1___', '__10___', '_0110__', '0101100'][r][c], f = t === '0' ? '#ffd23f' : t === '1' ? '#ff4d4d' : '#0a1c52';
      return `<circle cx="${60 + c * 20}" cy="${22 + r * 17}" r="7" fill="${f}"/>`; }).join('')).join('')}` },
  { id: 'dames', desc: 'Prises obligatoires, pions et dames sur un damier en bois.', art: `
    <rect width="240" height="120" fill="#2d1c10"/>
    ${Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => `<rect x="${56 + c * 16}" y="${r * 15 - 0}" width="16" height="15" fill="${(r + c) % 2 ? '#8a5028' : '#f0d9b0'}"/>`).join('')).join('')}
    <circle cx="104" cy="52" r="6" fill="#f4eacb"/><circle cx="136" cy="67" r="6" fill="#f4eacb"/><circle cx="120" cy="37" r="6" fill="#1b1b1b"/><circle cx="88" cy="82" r="6" fill="#1b1b1b"/><circle cx="152" cy="97" r="6" fill="#f4eacb"/>` },
  { id: 'mastermind', desc: 'Cassez le code de couleurs en dix essais, seul ou en duel.', art: `
    <rect width="240" height="120" fill="#14161c"/>
    ${[['#ef476f', '#ffd166', '#06d6a0', '#118ab2'], ['#8e6bf0', '#ef476f', '#ffd166', '#06d6a0'], ['#118ab2', '#118ab2', '#ff9f1c', '#8e6bf0']].map((row, r) =>
      row.map((c, i) => `<circle cx="${62 + i * 28}" cy="${24 + r * 34}" r="11" fill="${c}"/>`).join('') + `<circle cx="${186}" cy="${20 + r * 34}" r="4" fill="#fff"/><circle cx="${197}" cy="${20 + r * 34}" r="4" fill="#7d849b"/><circle cx="${186}" cy="${31 + r * 34}" r="4" fill="#fff"/><circle cx="${197}" cy="${31 + r * 34}" r="4" fill="#11141c"/>`).join('')}` },
  { id: 'memory', desc: 'Retournez les cartes et retrouvez les paires.', art: `
    <rect width="240" height="120" fill="#ffd6e3"/>
    ${[['🐙', null, '🍩', null], [null, '🦊', null, '🐙'], ['🍩', null, '🦊', null]].map((row, r) => row.map((f, c) => `<rect x="${56 + c * 32}" y="${10 + r * 36}" width="28" height="32" rx="7" fill="${f ? '#fff' : '#ff6f91'}" stroke="#fff" stroke-width="2"/>${f ? `<text x="${70 + c * 32}" y="${33 + r * 36}" font-size="17" text-anchor="middle">${f}</text>` : ''}`).join('')).join('')}` },
  { id: 'pendu', desc: 'Devinez le mot lettre par lettre avant qu\'il soit trop tard.', art: `
    <rect width="240" height="120" fill="#1d3a2e"/>
    <g fill="none" stroke="#f3f1e7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M60 108h50M72 108V14h46v14"/><circle cx="118" cy="38" r="9"/><path d="M118 47v28M118 54l-14 12M118 54l14 12M118 75l-12 20"/></g>
    <g stroke="#f3f1e7" stroke-width="3"><path d="M150 100h14M170 100h14M190 100h14"/></g><text x="177" y="96" font-size="20" fill="#f3f1e7" text-anchor="middle" font-family="sans-serif">A</text>` },

  { id: 'demineur', desc: 'Le classique de Windows : devinez où sont les mines.', art: `
    <rect width="240" height="120" fill="#008080"/><rect x="50" y="8" width="140" height="104" fill="#c0c0c0" stroke="#fff" stroke-width="3"/>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 8 }, (_, c) => { const v = [['', '', '1', 'm', '1', '', '', ''], ['', '', '1', '1', '1', '', '', ''], ['1', '1', '', '', '', '1', '1', '1'], ['f', '2', '1', '', '', '1', 'm', '1'], ['f', 'f', '1', '', '', '1', '1', '1']][r][c]; const x = 58 + c * 16.5, y = 16 + r * 19; const open = v !== '' || (r < 3 && (c < 2 || c > 4)) || (r === 2 || r === 3) && c > 2 && c < 5; return `<rect x="${x}" y="${y}" width="16" height="18" fill="${open ? '#bdbdbd' : '#c0c0c0'}" stroke="${open ? '#808080' : '#fff'}"/>` + (v === 'f' ? `<text x="${x + 8}" y="${y + 13}" font-size="11" text-anchor="middle">🚩</text>` : v === 'm' ? `<text x="${x + 8}" y="${y + 13}" font-size="11" text-anchor="middle">💣</text>` : v ? `<text x="${x + 8}" y="${y + 14}" font-size="13" font-weight="bold" text-anchor="middle" font-family="Arial" fill="${['', '#0000ff', '#008000', '#ff0000'][v]}">${v}</text>` : ''); }).join('')).join('')}` },
  { id: 'solitaire', desc: 'Rangez toutes les cartes par couleur, de l\'As au Roi.', art: `
    <rect width="240" height="120" fill="#008000"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${24 + i * 40}" y="${14 + i * 4}" width="34" height="48" rx="4" fill="#fff" stroke="#000" stroke-opacity=".5"/><text x="${28 + i * 40}" y="${28 + i * 4}" font-size="12" font-weight="bold" font-family="Arial" fill="${i % 2 ? '#d00' : '#111'}">${'A5K93'[i]}${i % 2 ? '♥' : '♠'}</text>`).join('')}
    <rect x="60" y="66" width="34" height="48" rx="4" fill="#1d3fbf" stroke="#fff" stroke-width="2"/><rect x="146" y="66" width="34" height="48" rx="4" fill="#1d3fbf" stroke="#fff" stroke-width="2"/>` },
  { id: 'freecell', desc: 'Toutes les cartes sont visibles : à vous de bien les ranger.', art: `
    <rect width="240" height="120" fill="#008000"/>
    ${[0, 1, 2, 3].map(i => `<rect x="${12 + i * 29}" y="8" width="26" height="36" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/><rect x="${128 + i * 25}" y="8" width="23" height="36" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/>`).join('')}
    <rect x="41" y="8" width="26" height="36" rx="3" fill="#fff"/><text x="45" y="24" font-size="12" font-weight="bold" font-family="Arial" fill="#d00">Q♦</text>
    ${Array.from({ length: 8 }, (_, c) => [0, 1, 2].map(r => `<rect x="${10 + c * 28}" y="${56 + r * 14}" width="25" height="${r === 2 ? 36 : 14}" rx="3" fill="#fff" stroke="#000" stroke-opacity=".5"/><text x="${13 + c * 28}" y="${67 + r * 14}" font-size="10" font-weight="bold" font-family="Arial" fill="${(c + r) % 2 ? '#d00' : '#111'}">${'A23456789JQK'[(c * 3 + r) % 12]}${(c + r) % 2 ? '♥' : '♣'}</text>`).join('')).join('')}` },
  { id: 'billes', desc: 'Le jeu de plateau : sautez par-dessus les billes pour n\'en garder qu\'une.', art: `
    <rect width="240" height="120" fill="#3a2412"/><circle cx="120" cy="60" r="56" fill="#6b4220" stroke="#2b1a0e" stroke-width="4"/>
    ${Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => { if (!((r >= 2 && r <= 4) || (c >= 2 && c <= 4))) return ''; const x = 120 + (c - 3) * 15, y = 60 + (r - 3) * 15, empty = (r === 3 && c === 3) || (r === 1 && c === 3); return `<circle cx="${x}" cy="${y}" r="6.5" fill="#2b1a0e"/>` + (empty ? '' : `<circle cx="${x}" cy="${y}" r="5.6" fill="${(r + c) % 3 ? '#3aa8e8' : '#e8403a'}"/><circle cx="${x - 1.8}" cy="${y - 2}" r="1.6" fill="#fff" fill-opacity=".7"/>`); }).join('')).join('')}` },
];
const TAGS = { demineur: ['Solo'], solitaire: ['Solo'], freecell: ['Solo'], billes: ['Solo'],  c4: ['Solo', 'En ligne'], dames: ['Solo', 'En ligne'], mastermind: ['Solo', 'Duel'], memory: ['Solo', 'En ligne'], pendu: ['Solo', 'Duel'] };

const grid = document.querySelector('.hub-grid'), soon = grid.querySelector('.soon');
for (const c of CARDS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'game-card'; b.dataset.game = c.id;
  b.innerHTML = `<span class="game-art" aria-hidden="true"><svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice">${c.art}</svg></span>
    <span class="game-name">${NAMES[c.id]}</span><span class="game-desc">${c.desc}</span>
    <span class="game-tags">${TAGS[c.id].map(t => `<i>${t}</i>`).join('')}</span>`;
  grid.insertBefore(b, soon);
}

const instances = {};
async function getSolo(id) {
  if (!instances[id]) {
    const mod = (await SOLO[id]()).default;
    const root = document.createElement('div');
    root.className = `app game-app solo-app theme-${mod.theme || id}`; root.id = 'game-' + id; root.hidden = true;
    root.innerHTML = `<header class="top"><button type="button" class="back-btn" data-r="hub" aria-label="Retour à l'accueil">‹ Jeux</button>
      <div class="brand"><div><h1>${mod.title[0]}${mod.title[1] ? ` <span>${mod.title[1]}</span>` : ''}</h1><small>${mod.tagline}</small></div></div></header>
      <main class="solo-stage"></main>`;
    root.querySelector('.back-btn').addEventListener('click', () => show('hub'));
    document.body.appendChild(root);
    mod.mount(root.querySelector('.solo-stage'));
    instances[id] = { root };
  }
  return instances[id];
}
async function getGame(id) {
  if (!instances[id]) {
    const [{ createGame }, mod] = await Promise.all([import('./shell.js'), PLUGINS[id]()]);
    instances[id] = createGame(mod.default);
  }
  return instances[id];
}

async function show(game, opts) {
  let target;
  if (SOLO[game]) target = (await getSolo(game)).root;
  else if (PLUGINS[game]) { const g = await getGame(game); g.open(opts); target = g.root; }
  else if (game === 'amiral') { await import('./ui.js'); target = $('gameAmiral'); }
  else if (game === 'morpion') { (await import('./morpion.js')).open(opts); target = $('gameMorpion'); }
  else target = $('hub');
  document.querySelectorAll('.app').forEach(el => { el.hidden = el !== target; });
  document.title = game === 'hub' ? NAMES.hub : `${NAMES[game]} · ${NAMES.hub}`;
  document.body.dataset.game = game;
  $('themeColor').setAttribute('content', THEME[game]);
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => { const b = e.target.closest('.game-card[data-game]'); if (b) show(b.dataset.game); });
window.addEventListener('tc:open', e => show(e.detail));

// Lien d'invitation (?partie=CODE&jeu=...), partie en ligne à reprendre, sinon l'accueil.
const params = new URLSearchParams(location.search);
const invited = normalizeCode(params.get('partie')), game = params.get('jeu') || 'amiral';
if (CODE_RE.test(invited) && (game === 'morpion' || PLUGINS[game])) { history.replaceState(null, '', location.pathname + location.hash); show(game, { invite: invited }); }
else if (CODE_RE.test(invited)) show('amiral');                 // Amiral lit lui-même le lien
else {
  const resume = ['amiral', 'morpion', ...Object.keys(PLUGINS)].find(g => savedOnline(g));
  if (resume === 'amiral') show('amiral');
  else if (resume) show(resume, { resume: true });
  else show('hub');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
  });
}
