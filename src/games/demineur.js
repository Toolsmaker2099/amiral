// Démineur : comme le jeu de Windows. Premier clic sûr, drapeaux, « accord » sur un chiffre,
// compteur de mines, chronomètre, visage, trois niveaux et meilleurs temps.
const LEVELS = {
  debutant: { label: 'Débutant', rows: 9, cols: 9, mines: 10 },
  intermediaire: { label: 'Intermédiaire', rows: 16, cols: 16, mines: 40 },
  expert: { label: 'Expert', rows: 16, cols: 30, mines: 99 },
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('tc:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tc:' + k, JSON.stringify(v)); } catch {} },
};
const FACES = { play: '🙂', press: '😮', win: '😎', lose: '😵' };
const digits = n => (n < 0 ? '-' + String(Math.min(99, -n)).padStart(2, '0') : String(Math.min(999, n)).padStart(3, '0'));

export default {
  id: 'demineur', theme: 'win', title: ['Démineur', ''], tagline: 'Comme sur PC',
  mount(host) {
    let level = store.get('demineur:level') || 'debutant';
    let G = null, timer = null, flagMode = false, face = 'play', cells = [], press = null;
    host.innerHTML = `
    <div class="w95 mine-win">
      <div class="w95-menu" data-r="menu">${Object.entries(LEVELS).map(([k, l]) => `<button type="button" data-lvl="${k}">${l.label}</button>`).join('')}</div>
      <div class="w95-body">
        <div class="mine-panel bevel-in">
          <div class="led" data-r="mines">010</div>
          <div class="face-group"><button type="button" class="smiley bevel-out" data-r="face" aria-label="Nouvelle partie">🙂</button><button type="button" class="flagbtn bevel-out" data-r="flagmode" aria-pressed="false" aria-label="Mode drapeau" title="Mode drapeau : un appui pose un drapeau">🚩</button></div>
          <div class="led" data-r="time">000</div>
        </div>
        <div class="mine-scroll"><div class="mine-grid bevel-in" data-r="grid" role="grid" aria-label="Champ de mines"></div></div>
      </div>
      <div class="w95-status" data-r="msg"></div>
    </div>`;
    const q = r => host.querySelector(`[data-r="${r}"]`);
    const grid = q('grid');

    function newGame() {
      clearTimeout(timer); timer = null;
      const L = LEVELS[level];
      G = { ...L, cells: Array.from({ length: L.rows * L.cols }, () => ({ mine: false, adj: 0, s: 'h' })), started: false, over: false, won: false, t: 0, flags: 0, open: 0, boom: -1 };
      face = 'play';
      build();
      draw();
    }
    function build() {
      const L = G, scroll = host.querySelector('.mine-scroll');
      const avail = Math.min(window.innerWidth - 76, 760);
      const cs = Math.max(18, Math.min(34, Math.floor(avail / L.cols)));
      grid.style.setProperty('--cs', cs + 'px');
      grid.style.gridTemplateColumns = `repeat(${L.cols}, var(--cs))`;
      grid.innerHTML = '';
      cells = [];
      for (let i = 0; i < L.rows * L.cols; i++) {
        const b = document.createElement('div');
        b.className = 'mc95'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
        grid.appendChild(b); cells.push(b);
      }
      scroll.scrollLeft = 0;
      host.querySelectorAll('[data-lvl]').forEach(b => b.classList.toggle('on', b.dataset.lvl === level));
    }
    const nb = i => {
      const r = (i / G.cols) | 0, c = i % G.cols, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < G.rows && cc >= 0 && cc < G.cols) out.push(rr * G.cols + cc);
      }
      return out;
    };
    function plant(safe) {
      const ban = new Set([safe]);
      const free = []; for (let i = 0; i < G.cells.length; i++) if (!ban.has(i)) free.push(i);
      for (let k = free.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [free[k], free[j]] = [free[j], free[k]]; }
      for (let k = 0; k < G.mines; k++) G.cells[free[k]].mine = true;
      G.cells.forEach((c, i) => { c.adj = nb(i).filter(j => G.cells[j].mine).length; });
    }
    function tick() { timer = setTimeout(() => { G.t = Math.min(999, G.t + 1); q('time').textContent = digits(G.t); tick(); }, 1000); }
    function reveal(i) {
      if (G.over) return;
      const c = G.cells[i];
      if (c.s !== 'h') return;
      if (!G.started) { G.started = true; plant(i); G.t = 1; tick(); }
      if (c.mine) { c.s = 'o'; G.boom = i; return lose(); }
      const stack = [i];
      while (stack.length) {
        const k = stack.pop(), ck = G.cells[k];
        if (ck.s !== 'h') continue;
        ck.s = 'o'; G.open++;
        if (ck.adj === 0) for (const j of nb(k)) if (G.cells[j].s === 'h') stack.push(j);
      }
      if (G.open === G.cells.length - G.mines) win();
    }
    function flag(i) {
      if (G.over) return;
      const c = G.cells[i];
      if (c.s === 'h') { c.s = 'f'; G.flags++; } else if (c.s === 'f') { c.s = 'h'; G.flags--; }
    }
    function chord(i) {
      if (G.over) return;
      const c = G.cells[i];
      if (c.s !== 'o' || c.adj === 0) return;
      const around = nb(i);
      if (around.filter(j => G.cells[j].s === 'f').length !== c.adj) return;
      for (const j of around) if (G.cells[j].s === 'h') reveal(j);
    }
    function lose() {
      G.over = true; face = 'lose'; clearTimeout(timer);
      G.cells.forEach(c => { if (c.mine && c.s === 'h') c.s = 'o'; });
    }
    function win() {
      G.over = true; G.won = true; face = 'win'; clearTimeout(timer);
      G.cells.forEach(c => { if (c.mine && c.s !== 'f') { c.s = 'f'; G.flags++; } });
      const best = store.get('demineur:best') || {};
      if (!best[level] || G.t < best[level]) { best[level] = G.t; store.set('demineur:best', best); G.record = true; }
    }
    function draw() {
      const best = (store.get('demineur:best') || {})[level];
      q('mines').textContent = digits(G.mines - G.flags);
      q('time').textContent = digits(G.t);
      q('face').textContent = press ? FACES.press : FACES[face];
      G.cells.forEach((c, i) => {
        const el = cells[i];
        let cls = 'mc95', txt = '';
        if (c.s === 'o') {
          cls += ' open';
          if (c.mine) { txt = '💣'; if (i === G.boom) cls += ' boom'; }
          else if (c.adj) { txt = c.adj; cls += ' n' + c.adj; }
        } else if (c.s === 'f') { cls += ' raised'; txt = '🚩'; if (G.over && !G.won && !c.mine) { cls += ' wrong'; txt = '❌'; } }
        else cls += ' raised';
        if (el.className !== cls) el.className = cls;
        if (el.textContent !== String(txt)) el.textContent = txt;
      });
      q('msg').textContent = G.over
        ? (G.won ? `Gagné en ${G.t} s !${G.record ? ' Nouveau record.' : ''}` : 'Boum ! Cliquez sur le visage pour rejouer.')
        : best ? `Meilleur temps : ${best} s` : 'Clic : creuser · Clic droit ou appui long : drapeau';
    }
    const redraw = () => { draw(); };

    /* ----- Gestes : souris (gauche, droit, milieu, les deux) et toucher (tap, appui long) ----- */
    let lp = null;
    grid.addEventListener('contextmenu', e => e.preventDefault());
    grid.addEventListener('pointerdown', e => {
      const el = e.target.closest('.mc95'); if (!el || G.over) return;
      const i = +el.dataset.i;
      if (e.pointerType === 'mouse') {
        if (e.buttons === 2) { flag(i); return redraw(); }
        if (e.buttons >= 3 || e.buttons === 4) { chord(i); return redraw(); }
        press = i; redraw();
      } else {
        press = i; lp = { i, x: e.clientX, y: e.clientY, done: false };
        lp.t = setTimeout(() => { lp.done = true; press = null; flag(i); buzz(); redraw(); }, 420);
        redraw();
      }
    });
    const buzz = () => { try { navigator.vibrate?.(30); } catch {} };
    grid.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; press = null; redraw(); } });
    const up = e => {
      const had = press; press = null;
      if (e.pointerType === 'mouse') {
        if (e.button === 0 && had !== null && !G.over) {
          const el = e.target.closest('.mc95');
          if (el && +el.dataset.i === had) {
            const c = G.cells[had];
            if (flagMode) flag(had); else if (c.s === 'o') chord(had); else reveal(had);
          }
        }
      } else if (lp) {
        clearTimeout(lp.t);
        const l = lp; lp = null;
        if (!l.done && !G.over) {
          const c = G.cells[l.i];
          if (flagMode) { if (c.s === 'o') chord(l.i); else flag(l.i); }
          else if (c.s === 'o') chord(l.i); else reveal(l.i);
        }
      }
      redraw();
    };
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', () => { clearTimeout(lp?.t); lp = null; press = null; redraw(); });
    grid.addEventListener('pointerleave', () => { if (press !== null) { press = null; redraw(); } });
    grid.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    grid.addEventListener('mousedown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      const el = e.target.closest('.mc95'); if (el) { chord(+el.dataset.i); redraw(); }
    });

    q('face').addEventListener('click', newGame);
    q('menu').addEventListener('click', e => {
      const b = e.target.closest('[data-lvl]');
      if (b) { level = b.dataset.lvl; store.set('demineur:level', level); newGame(); }
    });
    q('flagmode').addEventListener('click', e => {
      flagMode = !flagMode; e.currentTarget.setAttribute('aria-pressed', flagMode); e.currentTarget.classList.toggle('on', flagMode);
    });
    window.addEventListener('resize', () => { if (G && !host.closest('.app')?.hidden) build(), draw(); });
    newGame();
    return { newGame };
  },
};
