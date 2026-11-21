import { SIZE, SIZES, LETTERS, FLEET, coord, Engine, Match, setGridSize } from './engine.js';
import { AI } from './ai.js';

/* ==========================================================
   3. INTERFACE — lit l'état, l'affiche, et transmet les gestes.
   ========================================================== */
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};

let S = null;          // état complet de l'application
let hover = null;      // case survolée (souris ou clavier) pendant le placement
let drag = null;       // glisser-déposer en cours
let ghost = null;      // coque qui suit le doigt hors de la grille
let endPending = false, endTimer = null;   // délai avant l'écran de fin
let view = 'enemy', viewTimer = null;   // grille affichée sur téléphone
let aiTimer = null, hintTimer = null, quitArmed = null;

function setSize(n) {
  setGridSize(n);
  document.documentElement.style.setProperty('--n', SIZE);
  for (const id of ['setupBoard', 'enemyBoard', 'myBoard']) { const el = $(id); if (el && el._sea) buildBoard(el); }
}
function savePrefs() { store.set('prefs2', { level: S.level, replayOnHit: S.replayOnHit, size: S.size }); }
function freshState(prev) {
  const prefs = store.get('prefs2') || {};
  return {
    screen: 'setup',
    level: prev?.level || prefs.level || 'medium',
    size: (setSize(prev?.size || prefs.size || 10), SIZE),
    replayOnHit: prev?.replayOnHit ?? prefs.replayOnHit ?? true,
    setup: { board: Engine.randomize(Engine.newBoard()), selected: null },
    match: null, ai: null, log: [], last: null, endDismissed: false,
  };
}

/* ---------- Construction des grilles ---------- */
function buildBoard(el, seaClass = '') {
  if (!el._sea) {
  el.innerHTML = `<div class="cols"></div>
    <div class="bwrap"><div class="rows"></div>
    <div class="sea ${seaClass}"><div class="layer"></div></div></div>`;
  el._sea = el.querySelector('.sea'); el._layer = el._sea.querySelector('.layer');
  }
  const sea = el._sea;
  el.querySelector('.cols').innerHTML = '<span></span>' + [...LETTERS.slice(0, SIZE)].map(l => `<span>${l}</span>`).join('');
  el.querySelector('.rows').innerHTML = Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join('');
  sea.querySelectorAll('.cell').forEach(c => c.remove());
  el._layer.innerHTML = '';
  el._cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cell'; b.dataset.r = r; b.dataset.c = c;
    sea.appendChild(b); el._cells.push(b);
  }
}
function hullEl(len, h, extra = '', rev = false) {
  const d = document.createElement('div');
  d.className = `hull ${h ? 'h' : 'v'}${rev ? ' rev' : ''} ${extra}`;
  d.style.setProperty('--len', len);
  return d;
}
function putHull(layer, len, r, c, h, extra, rev) {
  const d = hullEl(len, h, extra, rev);
  const u = 100 / SIZE;
  Object.assign(d.style, { left: c * u + '%', top: r * u + '%', width: (h ? len : 1) * u + '%', height: (h ? 1 : len) * u + '%' });
  layer.appendChild(d);
  return d;
}
const cellFrom = e => { const b = e.target.closest('.cell'); return b ? [+b.dataset.r, +b.dataset.c] : null; };
function cellAtPoint(sea, x, y) {
  const rc = sea.getBoundingClientRect();
  if (x < rc.left || x >= rc.right || y < rc.top || y >= rc.bottom) return null;
  return [Math.min(SIZE - 1, Math.floor((y - rc.top) / rc.height * SIZE)), Math.min(SIZE - 1, Math.floor((x - rc.left) / rc.width * SIZE))];
}
const pipsHTML = (len, dmg = 0) =>
  `<span class="pips" aria-hidden="true">${Array.from({ length: len }, (_, i) => `<i class="${i < dmg ? 'dmg' : ''}"></i>`).join('')}</span>`;

/* ---------- Placement ---------- */
const clampAnchor = (len, r, c, h) => h ? [Math.max(0, Math.min(r, SIZE - 1)), Math.max(0, Math.min(c, SIZE - len))]
                                        : [Math.max(0, Math.min(r, SIZE - len)), Math.max(0, Math.min(c, SIZE - 1))];
const nextUnplaced = () => FLEET.find(f => !S.setup.board.ships.some(s => s.id === f.id))?.id || null;
const def = id => FLEET.find(f => f.id === id);

function flashHint(msg) {
  const el = $('setupHint'); el.textContent = msg; el.classList.add('warn');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintTimer = null; renderSetup(); }, 2000);
}

// Pivote un navire posé autour de la case touchée ; essaie d'autres ancrages s'il bute.
// Orientations dans le sens horaire : proue vers l'est, le sud, l'ouest, le nord.
const ORIENTS = [[true, false], [false, false], [true, true], [false, true]];
const orientIndex = (h, rev) => ORIENTS.findIndex(([oh, orv]) => oh === h && orv === !!rev);
const nextOrient = (h, rev) => ORIENTS[(orientIndex(h, rev) + 1) % 4];
function rotateShip(id, pivot) {
  const b = S.setup.board, s = b.ships.find(x => x.id === id);
  if (!s) return false;
  const p = pivot || (s.rev ? (s.h ? [s.r, s.c + s.len - 1] : [s.r + s.len - 1, s.c]) : [s.r, s.c]);
  const pos = s.h ? p[1] - s.c : p[0] - s.r;
  const fromStern = s.rev ? s.len - 1 - pos : pos;
  const k0 = orientIndex(s.h, s.rev);
  for (let step = 1; step < 4; step++) {
    const [h, rv] = ORIENTS[(k0 + step) % 4];
    const want = rv ? s.len - 1 - fromStern : fromStern;
    const idx = [want, ...Array.from({ length: s.len }, (_, k) => k).filter(k => k !== want)];
    for (const k of idx) {
      const [r, c] = h ? [p[0], p[1] - k] : [p[0] - k, p[1]];
      if (Engine.place(b, id, r, c, h, rv)) return true;
    }
  }
  return false;
}

function tapCell(r, c) {
  const st = S.setup, b = st.board, there = Engine.shipAt(b, r, c);
  if (there) {
    st.selected = there.id;
    if (!rotateShip(there.id, [r, c])) flashHint(`Pas assez de place pour faire pivoter le ${there.name.toLowerCase()} ici.`);
    else renderSetup();
    return;
  }
  const sel = st.selected && def(st.selected);
  if (sel && !b.ships.some(s => s.id === sel.id)) {
    const [pr, pc] = clampAnchor(sel.len, r, c, true);
    if (Engine.place(b, sel.id, pr, pc, true)) { st.selected = nextUnplaced(); hover = null; renderSetup(); }
    else flashHint('Un autre navire occupe déjà cet emplacement.');
    return;
  }
  st.selected = null; renderSetup();
}

function rotateSelected() {
  const st = S.setup;
  if (!st.selected || !st.board.ships.some(s => s.id === st.selected)) { flashHint('Touchez d\'abord un navire posé sur la grille.'); return; }
  if (!rotateShip(st.selected)) flashHint('Pas assez de place pour pivoter ici.');
  else renderSetup();
}

/* Glisser-déposer : depuis le chantier naval ou depuis la grille. */
function beginDrag(e, d) {
  if (e.button > 0) return;
  e.preventDefault();
  drag = { ...d, pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, target: null, valid: false };
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
}
function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) return;
  drag.moved = true;
  S.setup.selected = drag.id;
  const sea = $('setupBoard')._sea, p = cellAtPoint(sea, e.clientX, e.clientY);
  if (p) {
    const [r, c] = clampAnchor(drag.len, drag.h ? p[0] : p[0] - drag.offset, drag.h ? p[1] - drag.offset : p[1], drag.h);
    drag.target = [r, c];
    drag.valid = Engine.canPlace(S.setup.board, drag.len, r, c, drag.h, drag.id);
  } else drag.target = null;
  drawGhost(e.clientX, e.clientY);
  renderSetup();
}
function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null; drawGhost();
  if (cancelled) { renderSetup(); return; }
  if (!d.moved) {
    if (d.fromGrid) tapCell(...d.cell);
    else { S.setup.selected = S.setup.selected === d.id ? null : d.id; renderSetup(); }
    return;
  }
  if (d.target && d.valid) {
    Engine.place(S.setup.board, d.id, d.target[0], d.target[1], d.h, d.rev);
    S.setup.selected = d.fromGrid ? d.id : nextUnplaced();
    renderSetup();
  } else if (d.target) flashHint('Un autre navire occupe déjà cet emplacement.');
  else renderSetup();
}
function drawGhost(x, y) {
  if (!drag || !drag.moved || drag.target) { if (ghost) { ghost.remove(); ghost = null; } return; }
  const cell = $('setupBoard')._sea.getBoundingClientRect().width / SIZE;
  if (!ghost || ghost._h !== drag.h || ghost._rev !== !!drag.rev) {
    if (ghost) ghost.remove();
    ghost = hullEl(drag.len, drag.h, 'ghost', drag.rev); ghost._h = drag.h; ghost._rev = !!drag.rev; document.body.appendChild(ghost);
  }
  Object.assign(ghost.style, {
    width: (drag.h ? drag.len : 1) * cell + 'px', height: (drag.h ? 1 : drag.len) * cell + 'px',
    left: x - (drag.h ? drag.offset + .5 : .5) * cell + 'px', top: y - (drag.h ? .5 : drag.offset + .5) * cell + 'px',
  });
}

function renderSetup() {
  const st = S.setup, b = st.board, board = $('setupBoard');
  // Coques posées
  const layer = board._layer; layer.innerHTML = '';
  for (const s of b.ships) {
    const extra = [s.id === st.selected ? 'selected' : '', drag && drag.moved && drag.id === s.id ? 'lifted' : ''].join(' ');
    putHull(layer, s.len, s.r, s.c, s.h, extra, s.rev);
  }
  // Aperçu : glisser en cours, ou survol avec un navire du chantier sélectionné
  if (drag && drag.moved && drag.target) {
    putHull(layer, drag.len, drag.target[0], drag.target[1], drag.h, 'pv' + (drag.valid ? '' : ' bad'), drag.rev);
  } else if (!drag && hover && st.selected && !b.ships.some(s => s.id === st.selected)) {
    const d = def(st.selected), [r, c] = clampAnchor(d.len, hover[0], hover[1], true);
    putHull(layer, d.len, r, c, true, 'pv' + (Engine.canPlace(b, d.len, r, c, true, d.id) ? '' : ' bad'));
  }
  board._cells.forEach((el, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE, s = Engine.shipAt(b, r, c);
    el.setAttribute('aria-label', coord(r, c) + (s ? ` : ${s.name}, touchez pour pivoter` : ' : eau'));
  });

  // Chantier naval
  const waiting = FLEET.filter(f => !b.ships.some(s => s.id === f.id));
  $('dockCount').textContent = `${FLEET.length - waiting.length} / ${FLEET.length} en position`;
  $('dockCount').textContent = waiting.length ? `${FLEET.length - waiting.length} / ${FLEET.length} en position` : 'Flotte au complet';
  $('dockCount').classList.toggle('done', !waiting.length);
  // Chaque navire garde sa place dans le chantier : la grille ne bouge pas pendant le placement.
  $('dockShips').innerHTML = FLEET.map(f => {
    const placed = !waiting.includes(f);
    return `<button type="button" class="dock-item${f.id === st.selected ? ' selected' : ''}${placed ? ' placed' : ''}" data-id="${f.id}" aria-pressed="${f.id === st.selected}" aria-label="${f.name}, ${f.len} cases${placed ? ', en position' : ''}">
        <span class="hull h" style="--len:${f.len}"></span><span class="dock-name"><b>${f.name}</b> · ${placed ? 'en position' : f.len + ' cases'}</span></button>`;
  }).join('');
  if (drag && drag.moved && !drag.fromGrid) {
    const it = $('dockShips').querySelector(`[data-id="${drag.id}"]`); if (it) it.style.opacity = '.3';
  }

  const done = Engine.isComplete(b);
  $('startBtn').disabled = !done;
  const selPlaced = st.selected && b.ships.some(s => s.id === st.selected);
  $('rotateBtn').disabled = !selPlaced;
  const hint = $('setupHint');
  if (!hint.classList.contains('warn') || !hintTimer) {
    hint.classList.remove('warn');
    const sel = st.selected && def(st.selected);
    hint.textContent = sel && !selPlaced
      ? `Glissez le ${sel.name.toLowerCase()} sur la grille, ou touchez une case pour le poser.`
      : done ? 'Flotte en position. Glissez un navire pour le déplacer, touchez-le pour le faire pivoter.'
             : 'Glissez les navires du chantier naval vers la grille. Touchez un navire posé pour le faire pivoter.';
  }
  for (const k of Object.keys(AI.LEVELS)) $('lvl-' + k).checked = S.level === k;
  $('levelDesc').textContent = AI.LEVELS[S.level].desc;
  for (const n of [8, 10, 12]) $('size-' + n).checked = SIZE === n;
  $('sizeDesc').textContent = SIZES[SIZE];
  $('replayOpt').checked = S.replayOnHit;
}

/* ---------- Bataille ---------- */
function startBattle() {
  if (!Engine.isComplete(S.setup.board)) return;
  const mine = JSON.parse(JSON.stringify(S.setup.board));
  const enemy = Engine.randomize(Engine.newBoard());
  S.match = Match.create([mine, enemy], { replayOnHit: S.replayOnHit });
  S.ai = AI.create(S.level);
  S.log = []; S.last = null; S.endDismissed = false;
  S.screen = 'battle'; S.setup.selected = null; view = 'enemy';
  addLog({ sys: true, text: `Bataille engagée contre l'ordinateur (${AI.LEVELS[S.level].label.toLowerCase()}). Vous tirez en premier.` });
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function addLog(entry) { S.log.unshift({ n: S.match.round, ...entry }); }
function describe(res) {
  const at = coord(res.r, res.c);
  if (res.shooter === 0) {
    if (res.result === 'miss') return { at, text: 'À l\'eau.' };
    if (res.result === 'hit') return { at, text: 'Touché !' };
    return { at, text: `Touché, coulé ! Le ${res.ship.name.toLowerCase()} ennemi sombre.` };
  }
  if (res.result === 'miss') return { at, text: 'L\'ennemi tire dans l\'eau.' };
  if (res.result === 'hit') return { at, text: `Votre ${res.ship.name.toLowerCase()} est touché.` };
  return { at, text: `Coulé ! Votre ${res.ship.name.toLowerCase()} est perdu.` };
}

function resolveShot(res) {
  const d = describe(res);
  S.last = { side: res.shooter === 0 ? 1 : 0, r: res.r, c: res.c };
  if (res.result === 'sunk') S.boom = { side: S.last.side, id: res.ship.id, t: Date.now() };
  addLog({ who: res.shooter, at: d.at, text: d.text });
  if (S.match.phase === 'over') {
    addLog({ sys: true, text: S.match.winner === 0 ? 'La flotte ennemie est détruite.' : 'Votre flotte est détruite.' });
    // Laisse le temps de voir la dernière explosion avant l'écran de fin.
    endPending = true; clearTimeout(endTimer);
    endTimer = setTimeout(() => { endPending = false; render(); }, reduceMotion ? 900 : 3000);
  }
  render();
  const m = S.match;
  if (m.phase !== 'battle') return;
  clearTimeout(viewTimer);
  const extra = reduceMotion ? 0 : res.result === 'sunk' ? 1400 : 0;
  if (res.shooter === 0 && m.turn === 1) {
    // Laisse voir son propre tir, puis montre sa flotte avant le tir de l'ordinateur.
    viewTimer = setTimeout(() => { showView('mine'); scheduleAI(); }, (reduceMotion ? 300 : 1000) + extra);
  } else if (res.shooter === 1 && m.turn === 1) scheduleAI((reduceMotion ? 300 : 1100) + extra);
  else if (res.shooter === 1 && m.turn === 0) {
    viewTimer = setTimeout(() => showView('enemy'), (reduceMotion ? 600 : 2300) + extra);
  }
}

function showView(v) {
  view = v;
  if (S.screen !== 'battle') return;
  renderBattle();
  const top = $('battle').getBoundingClientRect().top;
  if (top < 0) $('battle').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function onEnemyCell(r, c) {
  const m = S.match;
  if (!m || m.phase !== 'battle' || m.turn !== 0) return;
  const res = Match.shoot(m, 0, r, c);
  if (res.result === 'repeat' || res.result === 'refused') return;
  resolveShot(res);
}

function scheduleAI(delay) {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    if (!S.match || S.match.phase !== 'battle' || S.match.turn !== 1) return;
    const [r, c] = AI.choose(S.ai);
    const res = Match.shoot(S.match, 1, r, c);
    AI.learn(S.ai, res);
    resolveShot(res);
  }, delay ?? (reduceMotion ? 300 : 900));
}

function paintBoard(board, data, { own, over, armed }) {
  const lastHere = S.last && S.last.side === (own ? 0 : 1);
  const layer = board._layer; layer.innerHTML = '';
  for (const s of data.ships) {
    const sunk = Engine.isSunk(s);
    if (!(own || sunk || over)) continue;
    // Explosion du navire qui vient de couler (reprend où elle en est si l'écran se redessine).
    const age = S.boom && S.boom.side === (own ? 0 : 1) && S.boom.id === s.id ? Date.now() - S.boom.t : -1;
    const boom = age >= 0 && age < 2000;
    const el = putHull(layer, s.len, s.r, s.c, s.h, (sunk ? 'sunk' : own ? '' : 'reveal') + (boom ? ' boom' : ''), s.rev);
    if (boom) {
      el.style.setProperty('--d0', -age + 'ms');
      Engine.shipCells(s).forEach(([r, c], i) => {
        const bl = document.createElement('div');
        bl.className = 'blast';
        bl.style.left = c * 100 / SIZE + '%'; bl.style.top = r * 100 / SIZE + '%';
        bl.style.setProperty('--d', (i * 120 - age) + 'ms');
        layer.appendChild(bl);
      });
    }
  }
  board._sea.classList.toggle('armed', !!armed);
  board._cells.forEach((el, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE, shot = data.shots[i], s = Engine.shipAt(data, r, c);
    const cls = ['cell'];
    let label = own ? (s ? s.name : 'eau') : 'inconnu';
    if (shot === 1) { cls.push('miss'); label = 'à l\'eau'; }
    if (shot === 2) {
      cls.push('hit');
      if (own || Engine.isSunk(s)) cls.push('onship');
      if (Engine.isSunk(s)) cls.push('sunk');
      label = Engine.isSunk(s) ? 'coulé' : 'touché';
    }
    if (!shot) cls.push('unknown');
    if (lastHere && S.last.r === r && S.last.c === c) cls.push('last');
    el.className = cls.join(' ');
    el.disabled = own || !armed || !!shot;
    el.setAttribute('aria-label', `${coord(r, c)} : ${label}`);
  });
}

function trackerHTML(data, own) {
  return FLEET.map(f => {
    const s = data.ships.find(x => x.id === f.id), down = Engine.isSunk(s);
    return `<li class="${down ? 'down' : ''}">${pipsHTML(f.len, own || down ? s.hits : 0)}<span>${f.name}</span></li>`;
  }).join('');
}

function renderBattle() {
  const m = S.match, over = m.phase === 'over', mine = m.boards[0], enemy = m.boards[1];
  const armed = !over && m.turn === 0;
  $('boards').dataset.view = view;
  $('tabEnemy').setAttribute('aria-selected', view === 'enemy');
  $('tabMine').setAttribute('aria-selected', view === 'mine');
  $('tabEnemy').classList.toggle('live', !over && m.turn === 0);
  $('tabMine').classList.toggle('live', !over && m.turn === 1);
  paintBoard($('enemyBoard'), enemy, { own: false, over, armed });
  paintBoard($('myBoard'), mine, { own: true, over });
  $('enemyBoard')._sea.classList.toggle('waiting', !over && m.turn === 1);
  $('enemyTracker').innerHTML = trackerHTML(enemy, false);
  $('myTracker').innerHTML = trackerHTML(mine, true);

  const pct = st => st.shots ? Math.round(100 * st.hits / st.shots) + ' %' : '–';
  $('enemyTag').textContent = `Vos tirs ${m.stats[0].shots} · ${pct(m.stats[0])}`;
  $('myTag').textContent = `IA ${AI.LEVELS[S.ai.level].label.toLowerCase()} · ${m.stats[1].shots} tirs`;

  $('beacon').className = 'beacon' + (over ? ' over' : m.turn === 1 ? ' enemy' : '');
  $('turnLabel').textContent = over ? (m.winner === 0 ? 'Victoire' : 'Défaite') : m.turn === 0 ? 'À vous de tirer' : 'L\'ennemi vise…';
  const lastShot = S.log.find(e => !e.sys);
  $('lastMsg').innerHTML = lastShot ? `<b>${lastShot.who === 0 ? 'Vous' : 'Ennemi'} · ${lastShot.at}</b> · ${esc(lastShot.text)}` : 'Touchez une case des eaux ennemies pour tirer.';

  $('log').innerHTML = S.log.map(e => e.sys
    ? `<li class="sys"><span class="n">${pad(e.n)}</span><span>${esc(e.text)}</span></li>`
    : `<li class="who-${e.who}"><span class="n">${pad(e.n)}</span><span class="at">${e.who === 0 ? '▸' : '◂'} ${e.at}</span><span>${esc(e.text)}</span></li>`).join('');

  const qb = $('quitBtn');
  qb.textContent = quitArmed ? 'Confirmer l\'abandon' : 'Nouvelle partie';
  qb.classList.toggle('danger', !!quitArmed);

  const endShown = over && !S.endDismissed && !endPending;
  $('endScreen').hidden = !endShown;
  if (endShown) {
    const win = m.winner === 0, st = m.stats[0];
    $('endCard').className = 'card plate ' + (win ? 'win' : 'lose');
    $('endTitle').textContent = win ? 'Victoire' : 'Défaite';
    $('endText').textContent = win
      ? `Toute la flotte ennemie est par le fond, en ${st.shots} tirs.`
      : `L'ordinateur a coulé vos cinq navires en ${m.stats[1].shots} tirs. Ses navires restants sont dévoilés sur la grille.`;
    $('stShots').textContent = st.shots;
    $('stHits').textContent = st.hits;
    $('stAcc').textContent = pct(st);
  }
}
const pad = n => String(n).padStart(3, '0');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function render() {
  $('setup').hidden = S.screen !== 'setup';
  $('battle').hidden = S.screen !== 'battle';
  if (S.screen === 'setup') { $('endScreen').hidden = true; syncCellSize(); renderSetup(); }
  else renderBattle();
}
function syncCellSize() {
  const w = $('setupBoard')._sea?.getBoundingClientRect().width;
  if (w) document.documentElement.style.setProperty('--cell', (w / SIZE).toFixed(2) + 'px');
}

function newGame() {
  clearTimeout(aiTimer); clearTimeout(viewTimer); clearTimeout(endTimer); endPending = false; view = 'enemy'; quitArmed = null; hover = null; drag = null;
  S = freshState(S);
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* ---------- Événements ---------- */
function wire() {
  buildBoard($('setupBoard'), 'setup-sea'); buildBoard($('enemyBoard')); buildBoard($('myBoard'));
  const sea = $('setupBoard')._sea;
  if ('ResizeObserver' in window) new ResizeObserver(syncCellSize).observe(sea);

  // Grille de placement : glisser un navire posé, toucher pour pivoter ou poser.
  sea.addEventListener('pointerdown', e => {
    const p = cellAtPoint(sea, e.clientX, e.clientY); if (!p) return;
    const s = Engine.shipAt(S.setup.board, ...p);
    beginDrag(e, s ? { id: s.id, len: s.len, h: s.h, rev: !!s.rev, offset: s.h ? p[1] - s.c : p[0] - s.r, fromGrid: true, cell: p }
                   : { id: null, fromGrid: true, cell: p });
    if (!s) drag.noShip = true;
  });
  sea.addEventListener('pointermove', e => {
    if (drag && drag.noShip) return;
    if (drag) return moveDrag(e);
    if (e.pointerType === 'mouse') { const p = cellAtPoint(sea, e.clientX, e.clientY); if (String(p) !== String(hover)) { hover = p; renderSetup(); } }
  });
  sea.addEventListener('pointerup', e => {
    if (drag && drag.noShip) { const p = drag.cell; drag = null; tapCell(...p); return; }
    endDrag(e, false);
  });
  sea.addEventListener('pointercancel', e => endDrag(e, true));
  sea.addEventListener('pointerleave', e => { if (!drag && hover && e.pointerType === 'mouse') { hover = null; renderSetup(); } });
  // Clavier : Entrée / Espace sur une case
  sea.addEventListener('click', e => { if (e.detail !== 0) return; const p = cellFrom(e); if (p) tapCell(...p); });
  sea.addEventListener('focusin', e => { if (!e.target.matches(':focus-visible')) return; const p = cellFrom(e); if (p) { hover = p; renderSetup(); } });

  // Chantier naval : glisser vers la grille, ou toucher pour sélectionner.
  const dock = $('dockShips');
  dock.addEventListener('pointerdown', e => {
    const it = e.target.closest('.dock-item'); if (!it) return;
    const f = def(it.dataset.id), hull = it.querySelector('.hull').getBoundingClientRect();
    const offset = Math.max(0, Math.min(f.len - 1, Math.floor((e.clientX - hull.left) / (hull.width / f.len))));
    const onGrid = S.setup.board.ships.find(s => s.id === f.id);
    beginDrag(e, { id: f.id, len: f.len, h: onGrid ? onGrid.h : true, rev: !!onGrid?.rev, offset: onGrid && !onGrid.h ? 0 : offset, fromGrid: false });
  });
  dock.addEventListener('pointermove', moveDrag);
  dock.addEventListener('pointerup', e => endDrag(e, false));
  dock.addEventListener('pointercancel', e => endDrag(e, true));
  dock.addEventListener('click', e => {
    if (e.detail !== 0) return;
    const it = e.target.closest('.dock-item'); if (!it) return;
    S.setup.selected = S.setup.selected === it.dataset.id ? null : it.dataset.id; renderSetup();
  });

  $('rotateBtn').addEventListener('click', rotateSelected);
  $('randomBtn').addEventListener('click', () => { Engine.randomize(S.setup.board); S.setup.selected = null; renderSetup(); });
  $('clearBtn').addEventListener('click', () => { S.setup.board.ships = []; S.setup.selected = FLEET[0].id; renderSetup(); });
  document.querySelectorAll('input[name="level"]').forEach(inp => inp.addEventListener('change', () => {
    S.level = inp.value; savePrefs(); renderSetup();
  }));
  $('replayOpt').addEventListener('change', e => { S.replayOnHit = e.target.checked; savePrefs(); });
  document.querySelectorAll('input[name="size"]').forEach(inp => inp.addEventListener('change', () => {
    S.size = +inp.value; setSize(S.size); savePrefs();
    S.setup.board = Engine.randomize(Engine.newBoard()); S.setup.selected = null; hover = null;
    render();
  }));
  $('startBtn').addEventListener('click', startBattle);
  document.addEventListener('keydown', e => {
    if (S.screen === 'setup' && (e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (drag && drag.moved) { [drag.h, drag.rev] = nextOrient(drag.h, drag.rev); drag.offset = 0; drag.target = null; drawGhost(drag.x0, drag.y0); renderSetup(); }
      else rotateSelected();
    }
    if (e.key === 'Escape' && !$('endScreen').hidden) { S.endDismissed = true; render(); }
  });

  $('enemyBoard')._sea.addEventListener('click', e => { const p = cellFrom(e); if (p) onEnemyCell(...p); });
  $('quitBtn').addEventListener('click', () => {
    if (S.match.phase === 'over' || quitArmed) return newGame();
    quitArmed = setTimeout(() => { quitArmed = null; renderBattle(); }, 3000);
    renderBattle();
  });
  document.querySelector('.viewswitch').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { clearTimeout(viewTimer); showView(b.dataset.v); } });
  $('againBtn').addEventListener('click', newGame);
  $('viewBtn').addEventListener('click', () => { S.endDismissed = true; render(); });
}

function start(data) {
  S = data && data.S ? data.S : freshState();
  setSize(S.size || 10); S.size = SIZE;
  wire();
  render();
  if (S.screen === 'battle' && S.match.phase === 'battle' && S.match.turn === 1) { view = 'mine'; render(); scheduleAI(); }
}

start({});

// Hors ligne : le service worker garde le jeu en cache.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Exposé pour le débogage dans la console.
window.TC = { Engine, Match, AI, FLEET, size: () => SIZE, state: () => S };
