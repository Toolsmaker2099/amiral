// Morpion : solo contre l'ordinateur, ou en ligne à deux avec un code (même serveur qu'Amiral).
import { createOnline, CODE_RE, normalizeCode } from './online.js';
import { showToast, hideToast, toastKeyNow, buzz, alertRematch } from './notify.js';
import { openQr, closeQr, openScanner, copyCode, shareInvite } from './share.js';

const root = document.getElementById('gameMorpion');
const $ = id => document.getElementById(id);
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const LEVELS = { easy: 'Facile', medium: 'Moyen', hard: 'Imbattable' };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};

/* ---------- Règles et ordinateur ---------- */
const judge = b => {
  for (const l of LINES) if (b[l[0]] !== null && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { winner: b[l[0]], line: l };
  return b.every(v => v !== null) ? { winner: 'draw', line: null } : null;
};
const empties = b => b.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
const pick = a => a[Math.floor(Math.random() * a.length)];

function minimax(b, turn, me) {            // score du point de vue de `me` : +1 gagne, -1 perd
  const j = judge(b);
  if (j) return j.winner === 'draw' ? 0 : j.winner === me ? 1 : -1;
  let best = turn === me ? -2 : 2;
  for (const i of empties(b)) {
    b[i] = turn;
    const sc = minimax(b, 1 - turn, me);
    b[i] = null;
    best = turn === me ? Math.max(best, sc) : Math.min(best, sc);
  }
  return best;
}
function aiMove(b, level, me) {
  const free = empties(b);
  if (level === 'easy') return pick(free);
  const tryWin = who => free.find(i => { b[i] = who; const w = judge(b)?.winner === who; b[i] = null; return w; });
  if (level === 'medium') {
    const w = tryWin(me), blk = tryWin(1 - me);
    if (w !== undefined) return w;
    if (blk !== undefined) return blk;
    if (b[4] === null && Math.random() < .8) return 4;
    return pick(free);
  }
  let best = -2, moves = [];
  for (const i of free) {
    b[i] = me;
    const sc = minimax(b, 1 - me, me);
    b[i] = null;
    if (sc > best) { best = sc; moves = [i]; } else if (sc === best) moves.push(i);
  }
  return pick(moves);
}

/* ---------- État ---------- */
let M = null, net = null, built = false, aiTimer = null;
const fresh = () => ({
  mode: 'solo', screen: 'play',         // solo | online ; play | lobby
  level: store.get('ttt:level') || 'medium',
  board: new Array(9).fill(null), turn: 0, starter: 0, over: false, result: null, line: null, last: null,
  score: [0, 0, 0], online: { code: null, status: 'connecting' },
});

const MARK = ['X', 'O'];
const markSvg = (who, size = 100) => who === 0
  ? `<svg viewBox="0 0 100 100" width="${size}%" height="${size}%" class="mk mk-x"><path pathLength="100" d="M24 24L76 76M76 24L24 76"/></svg>`
  : `<svg viewBox="0 0 100 100" width="${size}%" height="${size}%" class="mk mk-o"><circle pathLength="100" cx="50" cy="50" r="27"/></svg>`;

function build() {
  built = true;
  root.innerHTML = `
  <header class="top">
    <button type="button" class="back-btn" id="mHub" aria-label="Retour à l'accueil">‹ Jeux</button>
    <div class="brand">
      <svg viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="#e2ab45" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5v30M25 5v30M5 15h30M5 25h30"/></svg>
      <div><h1>Mor<span>pion</span></h1><small>Trois à la suite</small></div>
    </div>
    <div class="modes" role="tablist" aria-label="Mode de jeu">
      <button type="button" role="tab" id="mSolo">Solo</button>
      <button type="button" role="tab" id="mOnline">En ligne</button>
    </div>
  </header>

  <section id="mLobby" hidden>
    <div class="lobby-grid">
      <div class="panel plate">
        <h2>Créer une partie</h2>
        <p class="level-desc">Vous recevez un code à envoyer à votre adversaire. Le score se cumule d'une manche à l'autre.</p>
        <button class="btn primary" id="mCreate" type="button">Créer la partie</button>
      </div>
      <form class="panel plate" id="mJoinForm">
        <h2>Rejoindre</h2>
        <p class="level-desc">Entrez le code que votre adversaire vous a envoyé.</p>
        <label class="sr" for="mJoinCode">Code de la partie</label>
        <input class="code-input" id="mJoinCode" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7QPM">
        <button class="btn primary" type="submit">Rejoindre</button>
        <button class="btn" id="mScan" type="button">Scanner un QR code</button>
      </form>
    </div>
    <p class="lobby-msg" id="mLobbyMsg" role="status"></p>
  </section>

  <section id="mPlay" class="ttt-wrap" hidden>
    <div class="netbar plate" id="mNetbar" hidden>
      <div class="net-code"><span>Code de la partie</span><b id="mNetCode">-----</b></div>
      <button class="btn copy-btn" id="mCopy" type="button">Copier le code</button>
      <span class="chip" id="mChip"></span>
      <div class="net-actions">
        <button class="btn" id="mQr" type="button">QR code</button>
        <button class="btn" id="mShare" type="button">Envoyer le lien</button>
        <button class="btn" id="mLeave" type="button">Quitter</button>
      </div>
    </div>
    <div class="ttt-solo-opts plate" id="mOpts">
      <span class="opt-label">Niveau</span>
      <div class="seg" role="radiogroup" aria-label="Niveau de l'ordinateur">
        ${Object.entries(LEVELS).map(([k, l]) => `<label><input type="radio" name="mlevel" value="${k}">${l}</label>`).join('')}
      </div>
    </div>
    <div class="ttt-score plate" id="mScore" aria-live="polite"></div>
    <p class="ttt-status" id="mStatus" role="status"></p>
    <div class="ttt-board" id="mBoard" role="grid" aria-label="Plateau de morpion">
      ${Array.from({ length: 9 }, (_, i) => `<button type="button" class="ttt-cell" data-i="${i}" aria-label="Case ${i % 3 + 1}, ligne ${Math.floor(i / 3) + 1}"></button>`).join('')}
    </div>
    <div class="rematch-call" id="mCall" role="status" hidden>
      <span class="rematch-icon" aria-hidden="true">⚔</span>
      <span><b>Votre adversaire propose une revanche !</b><small>Acceptez pour jouer la manche suivante.</small></span>
    </div>
    <p class="end-note" id="mNote" hidden></p>
    <div class="ttt-actions" id="mActions" hidden>
      <button class="btn primary" id="mAgain" type="button">Rejouer</button>
      <button class="btn" id="mQuit" type="button" hidden>Quitter la partie</button>
    </div>
  </section>`;
  wire();
}

/* ---------- Affichage ---------- */
function render() {
  $('mSolo').setAttribute('aria-selected', M.mode === 'solo' && M.screen === 'play');
  $('mOnline').setAttribute('aria-selected', M.mode === 'online' || M.screen === 'lobby');
  $('mLobby').hidden = M.screen !== 'lobby';
  $('mPlay').hidden = M.screen !== 'play';
  if (M.screen === 'lobby') return;
  const online = M.mode === 'online', v = net?.state;
  $('mOpts').hidden = online;
  document.querySelectorAll('input[name="mlevel"]').forEach(i => { i.checked = i.value === M.level; });
  renderNet();

  // Plateau
  const cells = $('mBoard').children;
  const myTurn = online ? !!v?.myTurn : !M.over && M.turn === 0;
  for (let i = 0; i < 9; i++) {
    const c = cells[i], val = M.board[i];
    if (c.dataset.v !== String(val)) { c.dataset.v = String(val); c.innerHTML = val === null ? '' : markSvg(val); }
    c.disabled = val !== null || M.over || !myTurn;
    c.classList.toggle('win', !!M.line?.includes(i));
    c.classList.toggle('last', M.last === i && !M.over);
    c.classList.toggle('dim', M.over && !!M.line && !M.line.includes(i));
  }
  $('mBoard').classList.toggle('waiting', !M.over && !myTurn);

  // Score
  const [a, b, d] = M.score;
  $('mScore').innerHTML = `<div class="sc me">${markSvg(0, 100)}<span>Vous</span><b>${a}</b></div><div class="sc nul"><span>Nuls</span><b>${d}</b></div><div class="sc op">${markSvg(1, 100)}<span>${online ? 'Adversaire' : 'Ordinateur'}</span><b>${b}</b></div>`;
  if (online && v) $('mScore').firstChild.innerHTML = `${markSvg(v.seat)}<span>Vous</span><b>${a}</b>`, $('mScore').lastChild.innerHTML = `${markSvg(1 - v.seat)}<span>Adversaire</span><b>${b}</b>`;

  // Message d'état
  let status;
  if (online && (!v || !v.opponent.present)) status = 'En attente de votre adversaire…';
  else if (M.over) {
    status = M.result === 'win' ? 'Victoire !' : M.result === 'lose' ? 'Défaite' : 'Match nul';
    if (online && v.forfeit === 'opponent') status = 'Victoire : votre adversaire a quitté la partie.';
  } else status = myTurn ? 'À vous de jouer' : online ? 'L\'adversaire joue…' : 'L\'ordinateur réfléchit…';
  const st = $('mStatus'); st.textContent = status;
  st.className = 'ttt-status' + (M.over ? ' over ' + (M.result || '') : myTurn ? ' go' : '');

  // Fin de manche
  const actions = $('mActions');
  const waiting = online && (!v || !v.opponent.present);
  actions.hidden = waiting || !M.over;
  $('mQuit').hidden = !online;
  let note = '', invited = false;
  if (online && v && M.over) {
    const op = v.opponent, left = !!op.left, asked = !!v.me.rematch;
    invited = !!op.rematch && !asked && !left;
    note = left ? 'Votre adversaire a quitté la partie. Plus de revanche possible.'
      : asked ? 'En attente de la réponse de votre adversaire…'
      : op.away ? 'Votre adversaire est revenu à l\'accueil. Il sera prévenu si vous proposez une revanche.'
      : !op.connected ? 'Votre adversaire est déconnecté.' : '';
    const again = $('mAgain');
    again.textContent = asked ? 'Revanche demandée…' : invited ? 'Accepter la revanche' : 'Revanche';
    again.disabled = asked || left;
    again.classList.toggle('pulse', invited);
  } else { $('mAgain').textContent = 'Nouvelle manche'; $('mAgain').disabled = false; $('mAgain').classList.remove('pulse'); }
  $('mCall').hidden = !invited;
  $('mNote').textContent = note; $('mNote').hidden = !note;
}

function renderNet() {
  const online = M.mode === 'online', bar = $('mNetbar');
  bar.hidden = !online;
  if (!online) return;
  const v = net.state, st = M.online.status;
  $('mNetCode').textContent = M.online.code;
  let text, cls;
  if (st !== 'online') { text = st === 'connecting' ? 'Connexion…' : 'Connexion perdue, reconnexion…'; cls = 'wait'; }
  else if (!v || !v.opponent.present) { text = 'En attente de votre adversaire'; cls = 'wait'; }
  else if (v.opponent.left) { text = 'Adversaire parti'; cls = 'bad'; }
  else if (!v.opponent.connected) { text = 'Adversaire déconnecté'; cls = 'bad'; }
  else { text = 'Adversaire connecté'; cls = 'ok'; }
  $('mChip').textContent = text; $('mChip').className = 'chip ' + cls;
  const waiting = !v || !v.opponent.present;
  $('mShare').hidden = $('mQr').hidden = !waiting;
  if (!waiting) closeQr();
}

/* ---------- Solo ---------- */
function newRound() {
  clearTimeout(aiTimer);
  Object.assign(M, { board: new Array(9).fill(null), over: false, result: null, line: null, last: null, turn: M.starter });
  render();
  scheduleAI();
}
function scheduleAI() {
  clearTimeout(aiTimer);
  if (M.mode !== 'solo' || M.over || M.turn !== 1) return;
  aiTimer = setTimeout(() => { place(aiMove(M.board.slice(), M.level, 1)); }, 550);
}
function place(i) {
  if (M.board[i] !== null || M.over) return;
  M.board[i] = M.turn; M.last = i;
  const j = judge(M.board);
  if (j) {
    M.over = true; M.line = j.line;
    if (j.winner === 'draw') { M.result = 'draw'; M.score[2]++; M.starter = 1 - M.starter; }
    else { M.result = j.winner === 0 ? 'win' : 'lose'; M.score[j.winner === 0 ? 0 : 1]++; M.starter = 1 - j.winner; }
  } else M.turn = 1 - M.turn;
  render();
  scheduleAI();
}

/* ---------- En ligne ---------- */
function initNet() {
  if (net) return;
  net = Object.assign(createOnline({
    game: 'morpion',
    onState: onServerState,
    onError: onServerError,
    onStatus: s => { if (M.mode !== 'online') return; M.online.status = s; render(); },
  }), { state: null, watching: null, bgState: null });
}
function enterOnline(code) {
  clearTimeout(aiTimer); hideToast('leave');
  Object.assign(M, { mode: 'online', screen: 'play', board: new Array(9).fill(null), over: false, result: null, line: null, last: null, score: [0, 0, 0] });
  M.online = { code, status: 'connecting' }; net.state = null;
  render();
}
function joinOnline(code) { dropWatch(); net.join(code); enterOnline(code); }
async function createOnline_() {
  const btn = $('mCreate'); btn.disabled = true; lobbyMsg(''); dropWatch();
  try { enterOnline(await net.create({})); }
  catch { lobbyMsg('Impossible de joindre le serveur de parties. Vérifiez votre connexion et réessayez.'); }
  finally { btn.disabled = false; }
}
const lobbyMsg = t => { $('mLobbyMsg').textContent = t; };

function backHome(msg) {
  clearTimeout(dcTimer); dcShown = false; hideToast('opp');
  M = Object.assign(fresh(), { level: M.level });
  if (msg) { M.screen = 'lobby'; render(); lobbyMsg(msg); } else { M.screen = 'lobby'; render(); lobbyMsg(''); }
}
function leaveOnline(msg) { net.leave(); net.state = null; backHome(msg); }
function quitToHome() {
  const v = net.state;
  if (!(v && v.phase === 'over' && v.opponent.present && !v.opponent.left)) return leaveOnline();
  net.send({ t: 'away' }); net.background(true);
  net.watching = M.online.code; net.bgState = v; net.state = null;
  backHome();
}
function dropWatch() {
  if (!net?.watching) return;
  net.watching = null; net.bgState = null; net.leave(); hideToast('invite');
}
function acceptWatch() {
  const code = net.watching; if (!code) return;
  net.watching = null; net.bgState = null; net.background(false);
  window.dispatchEvent(new CustomEvent('tc:open', { detail: 'morpion' }));
  enterOnline(code); net.send({ t: 'rematch' });
}
function onBackgroundState(v) {
  const prev = net.bgState; net.bgState = v;
  if (v.phase === 'over' && !v.me.away && !v.opponent.left) net.send({ t: 'away' });
  if (v.opponent.left) {
    const was = toastKeyNow() === 'invite';
    dropWatch();
    if (was) showToast({ key: 'opp', kind: 'bad', title: 'Votre adversaire a quitté la partie', text: 'La revanche n\'est plus possible.', ms: 5000 });
    return;
  }
  if (v.phase === 'over' && v.opponent.rematch && !v.me.rematch && !prev?.opponent.rematch) {
    alertRematch();
    showToast({ key: 'invite', kind: 'call', title: 'Votre adversaire propose une revanche !', text: `Morpion, partie ${v.code}.`,
      actions: [{ label: 'Accepter la revanche', primary: true, fn: acceptWatch }, { label: 'Non merci', fn: dropWatch }] });
  }
}

let dcTimer = null, dcShown = false;
function watchOpponent(prev, v) {
  const was = prev?.opponent, op = v.opponent;
  if (!was || !was.present) return;
  if (op.left && !was.left) {
    clearTimeout(dcTimer); dcShown = false; buzz([200, 100, 200]);
    showToast({ key: 'opp', kind: 'bad', title: 'Votre adversaire a quitté la partie', text: v.forfeit === 'opponent' ? 'Il a abandonné : la victoire est pour vous.' : v.phase === 'over' ? 'Plus de revanche possible.' : '' });
    return;
  }
  if (was.left && !op.left) { showToast({ key: 'opp', kind: 'ok', title: 'Votre adversaire est revenu dans la partie', ms: 3500 }); return; }
  if (op.left) return;
  if (was.connected && !op.connected) {
    clearTimeout(dcTimer);
    dcTimer = setTimeout(() => {
      const s = net.state;
      if (M.mode !== 'online' || !s || s.opponent.connected || s.opponent.left) return;
      dcShown = true; buzz([200, 100, 200]);
      showToast({ key: 'opp', kind: 'bad', title: 'Votre adversaire s\'est déconnecté', text: 'Vous serez prévenu dès son retour.' });
    }, 2500);
  }
  if (!was.connected && op.connected) {
    clearTimeout(dcTimer);
    if (dcShown) { dcShown = false; showToast({ key: 'opp', kind: 'ok', title: 'Votre adversaire est de retour', ms: 3500 }); }
  }
}

function onServerState(v) {
  if (net.watching) return onBackgroundState(v);
  if (M.mode !== 'online') return;
  const prev = net.state;
  net.state = v; M.online.status = 'online';
  watchOpponent(prev, v);
  M.board = v.board; M.over = v.phase === 'over'; M.result = v.result; M.line = v.line; M.score = v.score; M.last = v.last?.i ?? null;
  // L'adversaire propose une revanche : on prévient, même si l'on regardait ailleurs.
  if (v.phase === 'over' && v.opponent.rematch && !v.me.rematch && !(prev && prev.opponent.rematch)) alertRematch();
  render();
}
function onServerError(e) {
  if (net.watching) { dropWatch(); return; }
  if (M.mode !== 'online') return;
  leaveOnline(e.code === 'full' ? 'Cette partie a déjà deux joueurs.'
    : e.code === 'gone' ? 'Ce code ne correspond à aucune partie en cours. Elle a peut-être expiré.'
    : e.text || 'La partie a été interrompue.');
}

/* ---------- Gestes ---------- */
function wire() {
  $('mBoard').addEventListener('click', e => {
    const c = e.target.closest('.ttt-cell'); if (!c || c.disabled) return;
    const i = +c.dataset.i;
    if (M.mode === 'online') { if (net.state?.myTurn) net.send({ t: 'move', i }); }
    else if (M.turn === 0) place(i);
  });
  document.querySelectorAll('input[name="mlevel"]').forEach(inp => inp.addEventListener('change', () => {
    M.level = inp.value; store.set('ttt:level', M.level); M.score = [0, 0, 0]; M.starter = 0; newRound();
  }));
  $('mAgain').addEventListener('click', () => { if (M.mode === 'online') net.send({ t: 'rematch' }); else newRound(); });
  $('mQuit').addEventListener('click', quitToHome);
  $('mSolo').addEventListener('click', () => {
    if (M.mode === 'online') { quitToHome(); }
    M.mode = 'solo'; M.screen = 'play'; newRound();
  });
  $('mOnline').addEventListener('click', () => {
    if (M.mode === 'online') return;
    clearTimeout(aiTimer); M.screen = 'lobby'; lobbyMsg(''); render();
  });
  $('mCreate').addEventListener('click', createOnline_);
  $('mJoinCode').addEventListener('input', e => { const t = e.target, v = normalizeCode(t.value).slice(0, 5); if (t.value !== v) t.value = v; });
  $('mJoinForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = normalizeCode($('mJoinCode').value);
    if (!CODE_RE.test(code)) { lobbyMsg('Le code fait 5 caractères, par exemple K7QPM.'); return; }
    joinOnline(code);
  });
  $('mScan').addEventListener('click', () => openScanner(joinOnline, 'morpion'));
  $('mCopy').addEventListener('click', () => copyCode($('mCopy'), M.online.code, $('mNetCode')));
  $('mQr').addEventListener('click', () => openQr(M.online.code, net.shareUrl(M.online.code)));
  $('mShare').addEventListener('click', () => shareInvite($('mShare'), M.online.code, net.shareUrl(M.online.code), 'Morpion', $('mNetCode')));
  $('mLeave').addEventListener('click', () => leaveOnline());
  $('mHub').addEventListener('click', () => {
    const inRound = M.over === false && (M.mode === 'online' ? net.state?.phase === 'battle' : M.board.some(v => v !== null));
    const go = fn => { fn(); window.dispatchEvent(new CustomEvent('tc:open', { detail: 'hub' })); };
    const leave = () => { clearTimeout(aiTimer); if (M.mode === 'online') quitToHome(); else { M = Object.assign(fresh(), { level: M.level }); render(); } };
    if (!inRound || M.mode !== 'online') return go(leave);
    showToast({ key: 'leave', kind: 'bad', title: 'Quitter la partie en cours ?', text: 'Votre adversaire gagnera par abandon.',
      actions: [{ label: 'Quitter', primary: true, fn: () => go(() => leaveOnline()) }, { label: 'Rester', fn: () => {} }], ms: 6000 });
  });
}

// Exposé pour le débogage dans la console.
window.TCM = { get over() { return M.over; }, get turn() { return M.turn; }, get result() { return M.result; }, get score() { return M.score; }, get net() { return net; } };

/* ---------- Entrée ---------- */
// Appelé par l'accueil de La boîte à jeux à chaque ouverture du jeu. `invite` : code reçu par lien ou QR code.
export function open({ invite = null, resume = false } = {}) {
  if (!built) { build(); initNet(); }
  if (!M) { M = fresh(); }
  if (invite) { joinOnline(invite); return; }
  if (resume && M.mode !== 'online') { const s = net.resume(); if (s) { enterOnline(s); return; } }
  if (M.mode === 'solo' && M.screen === 'play' && !M.board.some(v => v !== null)) newRound(); else render();
}
