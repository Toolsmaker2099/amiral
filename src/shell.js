// Moteur commun des jeux au tour par tour : écran, solo contre l'ordinateur, partie en ligne,
// revanche, alertes. Chaque jeu fournit un « plugin » (règles, ordinateur, dessin du plateau).
//
// Plugin : { id, title: ['Puissance', '4'], tagline, theme, rules, solo: 'ai' | 'single',
//            levels?: [{ id, label }], defaultLevel?, badge?(seat), aiMove?(state, level, view), aiDelay?(view),
//            observe?(view), mount(stage, api), render(stage, view, ctx), statusText?(view, ctx),
//            endNote?(view, ctx), singleLabels? }
import { createOnline, CODE_RE, normalizeCode } from './online.js';
import { showToast, hideToast, toastKeyNow, buzz, alertRematch } from './notify.js';
import { openQr, closeQr, openScanner, copyCode, shareInvite } from './share.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};

export function createGame(P) {
  const rules = P.rules, single = P.solo === 'single';
  let root = null, M = null, net = null, aiTimer = null, dcTimer = null, dcShown = false;
  const q = r => root.querySelector(`[data-r="${r}"]`);
  const fresh = () => ({
    mode: 'solo', screen: 'play',
    level: store.get(P.id + ':level') || P.defaultLevel || (P.levels && P.levels[0].id) || null,
    g: null, starter: 0, over: false, score: [0, 0, 0], online: { code: null, status: 'connecting' },
  });

  /* ---------- Construction ---------- */
  function build() {
    root = document.createElement('div');
    root.className = `app game-app theme-${P.theme || P.id}`;
    root.id = 'game-' + P.id; root.hidden = true;
    root.innerHTML = `
    <header class="top">
      <button type="button" class="back-btn" data-r="hub" aria-label="Retour à l'accueil">‹ Jeux</button>
      <div class="brand">
        <div><h1>${P.title[0]}${P.title[1] ? ` <span>${P.title[1]}</span>` : ''}</h1><small>${P.tagline}</small></div>
      </div>
      <div class="modes" role="tablist" aria-label="Mode de jeu">
        <button type="button" role="tab" data-r="solo">Solo</button>
        <button type="button" role="tab" data-r="online">En ligne</button>
      </div>
    </header>

    <section data-r="lobby" hidden>
      <div class="lobby-grid">
        <div class="panel plate">
          <h2>Créer une partie</h2>
          <p class="level-desc">Vous recevez un code à envoyer à votre adversaire. Le score se cumule d'une manche à l'autre.</p>
          <button class="btn primary" data-r="create" type="button">Créer la partie</button>
        </div>
        <form class="panel plate" data-r="joinForm">
          <h2>Rejoindre</h2>
          <p class="level-desc">Entrez le code que votre adversaire vous a envoyé.</p>
          <input class="code-input" data-r="joinCode" aria-label="Code de la partie" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7QPM">
          <button class="btn primary" type="submit">Rejoindre</button>
          <button class="btn" data-r="scan" type="button">Scanner un QR code</button>
        </form>
      </div>
      <p class="lobby-msg" data-r="lobbyMsg" role="status"></p>
    </section>

    <section data-r="play" class="gk-wrap" hidden>
      <div class="netbar plate" data-r="netbar" hidden>
        <div class="net-code"><span>Code de la partie</span><b data-r="netCode">-----</b></div>
        <button class="btn copy-btn" data-r="copy" type="button">Copier le code</button>
        <span class="chip" data-r="chip"></span>
        <div class="net-actions">
          <button class="btn" data-r="qr" type="button">QR code</button>
          <button class="btn" data-r="share" type="button">Envoyer le lien</button>
          <button class="btn" data-r="leave" type="button">Quitter</button>
        </div>
      </div>
      <div class="gk-opts plate" data-r="opts" hidden>
        <span class="opt-label">Niveau</span>
        <div class="seg" role="radiogroup" aria-label="Niveau de l'ordinateur">
          ${(P.levels || []).map(l => `<label><input type="radio" name="lvl-${P.id}" value="${l.id}">${l.label}</label>`).join('')}
        </div>
      </div>
      <div class="gk-score plate" data-r="score" aria-live="polite"></div>
      <p class="gk-status" data-r="status" role="status"></p>
      <div class="gk-stage" data-r="stage"></div>
      <div class="rematch-call" data-r="call" role="status" hidden>
        <span class="rematch-icon" aria-hidden="true">⚔</span>
        <span><b>Votre adversaire propose une revanche !</b><small>Acceptez pour jouer la manche suivante.</small></span>
      </div>
      <p class="end-note" data-r="note" hidden></p>
      <div class="gk-actions" data-r="actions" hidden>
        <button class="btn primary" data-r="again" type="button">Rejouer</button>
        <button class="btn" data-r="quit" type="button" hidden>Quitter la partie</button>
      </div>
    </section>`;
    document.body.appendChild(root);
    P.mount(q('stage'), { play: userPlay, rerender: () => M && render() });
    wire();
  }

  /* ---------- Lecture de l'état courant ---------- */
  const online = () => M.mode === 'online';
  const view = () => online() ? net.state?.g || null : M.g ? rules.view(M.g, 0) : null;
  const seat = () => online() ? net.state?.seat ?? 0 : 0;
  const myTurn = () => online() ? !!net.state?.myTurn : !M.over && M.g && rules.toMove(M.g) === 0;
  const result = () => {
    if (!M.over) return null;
    if (online()) return net.state?.result || null;
    const w = rules.outcome(M.g)?.winner;
    return w === 'draw' ? 'draw' : w === 0 ? 'win' : 'lose';
  };

  /* ---------- Affichage ---------- */
  function render() {
    q('solo').setAttribute('aria-selected', M.mode === 'solo' && M.screen === 'play');
    q('online').setAttribute('aria-selected', M.mode === 'online' || M.screen === 'lobby');
    q('lobby').hidden = M.screen !== 'lobby';
    q('play').hidden = M.screen !== 'play';
    if (M.screen === 'lobby') return;
    const v = view(), on = online(), st = net?.state;
    renderNet();
    if (!v) {
      q('status').textContent = 'Connexion…'; q('status').className = 'gk-status';
      q('actions').hidden = true; q('call').hidden = true; q('note').hidden = true;
      return;
    }
    P.observe?.(v);
    q('opts').hidden = on || !P.levels;
    root.querySelectorAll(`input[name="lvl-${P.id}"]`).forEach(i => { i.checked = i.value === M.level; });

    const res = result(), mine = myTurn();
    const ctx = { seat: seat(), myTurn: mine, over: M.over, online: on, result: res, interactive: !!mine && !M.over, level: M.level, play: userPlay,
      waiting: on && (!st || !st.opponent.present), forfeit: on ? st?.forfeit : null };
    ctx.interactive = ctx.interactive && !ctx.waiting;
    P.render(q('stage'), v, ctx);

    // Score
    const [a, b, d] = M.score;
    if (single && !on) {
      const L = P.singleLabels || ['Gagnées', 'Perdues'];
      q('score').innerHTML = `<div class="sc me"><span>${L[0]}</span><b>${a}</b></div><div class="sc op"><span>${L[1]}</span><b>${b}</b></div>`;
      q('score').classList.add('two');
    } else {
      q('score').classList.remove('two');
      const mk = s => (P.badge ? P.badge(s) : '');
      const sMe = ctx.seat, nameOp = on ? 'Adversaire' : 'Ordinateur';
      q('score').innerHTML = `<div class="sc me">${mk(sMe)}<span>Vous</span><b>${a}</b></div><div class="sc nul"><span>Nuls</span><b>${d}</b></div><div class="sc op">${mk(1 - sMe)}<span>${nameOp}</span><b>${b}</b></div>`;
    }

    // Message d'état
    let text;
    if (ctx.waiting) text = 'En attente de votre adversaire…';
    else if (M.over) {
      text = P.statusText?.(v, ctx) || (res === 'win' ? 'Victoire !' : res === 'lose' ? 'Défaite' : 'Match nul');
      if (on && st.forfeit === 'opponent') text = 'Victoire : votre adversaire a quitté la partie.';
    } else text = P.statusText?.(v, ctx) || (mine ? 'À vous de jouer' : on ? 'L\'adversaire joue…' : 'L\'ordinateur réfléchit…');
    const stEl = q('status');
    stEl.textContent = text;
    stEl.className = 'gk-status' + (M.over ? ' over ' + (res || '') : mine && !ctx.waiting ? ' go' : '');

    // Fin de manche
    q('actions').hidden = ctx.waiting || !M.over;
    q('quit').hidden = !on;
    let note = P.endNote?.(v, ctx) || '', invited = false;
    const again = q('again');
    if (on && st && M.over) {
      const op = st.opponent, left = !!op.left, asked = !!st.me.rematch;
      invited = !!op.rematch && !asked && !left;
      note = left ? 'Votre adversaire a quitté la partie. Plus de revanche possible.'
        : asked ? 'En attente de la réponse de votre adversaire…'
        : op.away ? 'Votre adversaire est revenu à l\'accueil. Il sera prévenu si vous proposez une revanche.'
        : !op.connected ? 'Votre adversaire est déconnecté.' : note;
      again.textContent = asked ? 'Revanche demandée…' : invited ? 'Accepter la revanche' : 'Revanche';
      again.disabled = asked || left;
      again.classList.toggle('pulse', invited);
    } else { again.textContent = single ? 'Nouvelle partie' : 'Nouvelle manche'; again.disabled = false; again.classList.remove('pulse'); }
    q('call').hidden = !invited;
    q('note').textContent = note; q('note').hidden = !note;
  }

  function renderNet() {
    const on = online(), bar = q('netbar');
    bar.hidden = !on;
    if (!on) return;
    const v = net.state, st = M.online.status;
    q('netCode').textContent = M.online.code;
    let text, cls;
    if (st !== 'online') { text = st === 'connecting' ? 'Connexion…' : 'Connexion perdue, reconnexion…'; cls = 'wait'; }
    else if (!v || !v.opponent.present) { text = 'En attente de votre adversaire'; cls = 'wait'; }
    else if (v.opponent.left) { text = 'Adversaire parti'; cls = 'bad'; }
    else if (!v.opponent.connected) { text = 'Adversaire déconnecté'; cls = 'bad'; }
    else { text = 'Adversaire connecté'; cls = 'ok'; }
    q('chip').textContent = text; q('chip').className = 'chip ' + cls;
    const waiting = !v || !v.opponent.present;
    q('share').hidden = q('qr').hidden = !waiting;
    if (!waiting) closeQr();
  }

  /* ---------- Solo ---------- */
  function newRound() {
    clearTimeout(aiTimer);
    M.g = rules.create({ solo: single }, { starter: single ? 0 : M.starter });
    M.over = false;
    P.reset?.();
    render();
    scheduleAI();
  }
  function afterMove() {
    const r = rules.outcome(M.g);
    if (r) {
      M.over = true;
      if (r.winner === 'draw') { M.score[2]++; M.starter = 1 - M.starter; }
      else { M.score[r.winner === 0 ? 0 : 1]++; M.starter = 1 - r.winner; }
    }
    render();
    scheduleAI();
  }
  function scheduleAI() {
    clearTimeout(aiTimer);
    if (M.mode !== 'solo' || single || M.over || rules.toMove(M.g) !== 1) return;
    const delay = P.aiDelay ? P.aiDelay(rules.view(M.g, 0)) : 600;
    aiTimer = setTimeout(async () => {
      if (M.mode !== 'solo' || M.over || rules.toMove(M.g) !== 1) return;
      let mv = await P.aiMove(M.g, M.level, rules.view(M.g, 1));
      let ns = mv && rules.apply(M.g, 1, mv);
      if (!ns) { const lm = rules.legalMoves(M.g); ns = lm.length && rules.apply(M.g, 1, lm[Math.floor(Math.random() * lm.length)]); }
      if (!ns) return;
      M.g = ns; afterMove();
    }, delay);
  }
  function userPlay(move) {
    if (online()) { if (net.state?.myTurn && net.state.phase === 'battle') net.send({ t: 'move', m: move }); return; }
    if (M.over || rules.toMove(M.g) !== 0) return;
    const ns = rules.apply(M.g, 0, move);
    if (!ns) return;
    M.g = ns; afterMove();
  }

  /* ---------- En ligne ---------- */
  function initNet() {
    if (net) return;
    net = Object.assign(createOnline({
      game: P.id, onState: onServerState, onError: onServerError,
      onStatus: s => { if (M.mode !== 'online') return; M.online.status = s; render(); },
    }), { state: null, watching: null, bgState: null });
  }
  function enterOnline(code) {
    clearTimeout(aiTimer); hideToast('leave');
    Object.assign(M, { mode: 'online', screen: 'play', over: false, g: null, score: [0, 0, 0] });
    M.online = { code, status: 'connecting' }; net.state = null;
    P.reset?.();
    render();
  }
  function joinOnline(code) { dropWatch(); net.join(code); enterOnline(code); }
  async function createOnlineGame() {
    const btn = q('create'); btn.disabled = true; lobbyMsg(''); dropWatch();
    try { enterOnline(await net.create({})); }
    catch { lobbyMsg('Impossible de joindre le serveur de parties. Vérifiez votre connexion et réessayez.'); }
    finally { btn.disabled = false; }
  }
  const lobbyMsg = t => { q('lobbyMsg').textContent = t; };

  function backHome(msg) {
    clearTimeout(dcTimer); dcShown = false; hideToast('opp'); clearTimeout(aiTimer);
    M = Object.assign(fresh(), { level: M.level });
    M.screen = 'lobby'; render(); lobbyMsg(msg || '');
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
    window.dispatchEvent(new CustomEvent('tc:open', { detail: P.id }));
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
      showToast({ key: 'invite', kind: 'call', title: 'Votre adversaire propose une revanche !', text: `${P.title.join(' ')}, partie ${v.code}.`,
        actions: [{ label: 'Accepter la revanche', primary: true, fn: acceptWatch }, { label: 'Non merci', fn: dropWatch }] });
    }
  }
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
    if (prev && prev.phase === 'over' && v.phase === 'battle') P.reset?.();
    M.g = v.g; M.over = v.phase === 'over'; M.score = v.score;
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
    root.querySelectorAll(`input[name="lvl-${P.id}"]`).forEach(inp => inp.addEventListener('change', () => {
      M.level = inp.value; store.set(P.id + ':level', M.level); M.score = [0, 0, 0]; M.starter = 0; newRound();
    }));
    q('again').addEventListener('click', () => { if (online()) net.send({ t: 'rematch' }); else newRound(); });
    q('quit').addEventListener('click', quitToHome);
    q('solo').addEventListener('click', () => {
      if (online()) quitToHome();
      M.mode = 'solo'; M.screen = 'play'; newRound();
    });
    q('online').addEventListener('click', () => {
      if (online()) return;
      clearTimeout(aiTimer); M.screen = 'lobby'; lobbyMsg(''); render();
    });
    q('create').addEventListener('click', createOnlineGame);
    q('joinCode').addEventListener('input', e => { const t = e.target, v = normalizeCode(t.value).slice(0, 5); if (t.value !== v) t.value = v; });
    q('joinForm').addEventListener('submit', e => {
      e.preventDefault();
      const code = normalizeCode(q('joinCode').value);
      if (!CODE_RE.test(code)) { lobbyMsg('Le code fait 5 caractères, par exemple K7QPM.'); return; }
      joinOnline(code);
    });
    q('scan').addEventListener('click', () => openScanner(joinOnline, P.id));
    q('copy').addEventListener('click', () => copyCode(q('copy'), M.online.code, q('netCode')));
    q('qr').addEventListener('click', () => openQr(M.online.code, net.shareUrl(M.online.code)));
    q('share').addEventListener('click', () => shareInvite(q('share'), M.online.code, net.shareUrl(M.online.code), P.title.join(' '), q('netCode')));
    q('leave').addEventListener('click', () => leaveOnline());
    q('hub').addEventListener('click', () => {
      const inRound = !M.over && (online() ? net.state?.phase === 'battle' : false);
      const go = fn => { fn(); window.dispatchEvent(new CustomEvent('tc:open', { detail: 'hub' })); };
      const leave = () => {
        clearTimeout(aiTimer);
        if (online()) quitToHome(); else { M = Object.assign(fresh(), { level: M.level }); newRound(); }
      };
      if (!inRound) return go(leave);
      showToast({ key: 'leave', kind: 'bad', title: 'Quitter la partie en cours ?', text: 'Votre adversaire gagnera par abandon.',
        actions: [{ label: 'Quitter', primary: true, fn: () => go(() => leaveOnline()) }, { label: 'Rester', fn: () => {} }], ms: 6000 });
    });
  }

  /* ---------- Entrée ---------- */
  return {
    id: P.id,
    get root() { return root; },
    // `invite` : code reçu par lien ou QR code ; `resume` : retour dans une partie en ligne en cours.
    open({ invite = null, resume = false } = {}) {
      if (!root) { build(); initNet(); }
      if (!M) M = fresh();
      if (invite) { joinOnline(invite); return; }
      if (resume && M.mode !== 'online') { const c = net.resume(); if (c) { enterOnline(c); return; } }
      if (M.mode === 'solo' && M.screen === 'play' && !M.g) newRound(); else render();
    },
  };
}
