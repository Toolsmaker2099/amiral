// Connexion au serveur de parties en ligne : création, WebSocket et reconnexion automatique.
// Ne touche pas à l'affichage : il prévient l'interface par des rappels.
import { SERVER_URL } from './config.js';

function serverUrl() {
  try { const s = JSON.parse(localStorage.getItem('tc:server')); if (s) return s; } catch {}
  return SERVER_URL;
}
const randomToken = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Jeton par partie : dans l'onglet (pour pouvoir jouer à deux onglets sur le même appareil)
// et sur l'appareil (pour revenir dans la partie après avoir fermé l'appli).
const session = {
  tokenFor(code) { try { return sessionStorage.getItem('tc:tok:' + code); } catch { return null; } },
  save(code, token) {
    try { sessionStorage.setItem('tc:tok:' + code, token); } catch {}
    try { localStorage.setItem('tc:online', JSON.stringify({ code, token })); } catch {}
  },
  saved() { try { return JSON.parse(localStorage.getItem('tc:online')); } catch { return null; } },
  clear() { try { localStorage.removeItem('tc:online'); } catch {} },
};

export const CODE_RE = /^[A-HJKMNP-Z2-9]{5}$/;
export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function createOnline({ onState, onError, onStatus }) {
  let net = null;

  function open() {
    if (!net) return;
    const ws = new WebSocket(serverUrl().replace(/^http/, 'ws') + '/rooms/' + net.code + '/ws');
    net.ws = ws;
    onStatus(net.everConnected ? 'reconnecting' : 'connecting');
    ws.onopen = () => {
      if (!net || net.ws !== ws) return;
      net.retry = 0; net.everConnected = true;
      ws.send(JSON.stringify({ t: 'hello', token: net.token }));
      onStatus('online');
    };
    ws.onmessage = e => {
      if (!net || net.ws !== ws) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'state') onState(m);
      else if (m.t === 'error') {
        if (m.code === 'full' || m.code === 'gone') { stop(); session.clear(); }
        onError(m);
      }
    };
    ws.onclose = e => {
      if (!net || net.ws !== ws || net.stopped) return;
      if (e.code === 4001) { stop(); onError({ code: 'replaced', text: 'Cette partie est ouverte ailleurs (autre onglet ou appareil).' }); return; }
      if (e.code === 4004) { stop(); session.clear(); onError({ code: 'gone', text: 'Cette partie a expiré.' }); return; }
      onStatus('offline');
      const delay = Math.min(10000, 800 * 2 ** net.retry++);
      net.timer = setTimeout(open, delay);
    };
  }

  function connect(code, token) {
    stop();
    session.save(code, token);
    net = { code, token, retry: 0, everConnected: false, stopped: false };
    open();
  }

  function stop() {
    if (!net) return;
    net.stopped = true; clearTimeout(net.timer);
    try { net.ws && net.ws.close(1000); } catch {}
    net = null;
  }

  // Revient au premier plan (téléphone sorti de veille) : reconnecte tout de suite.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && net && net.ws && net.ws.readyState > 1) { clearTimeout(net.timer); net.retry = 0; open(); }
  });

  return {
    get code() { return net?.code || null; },
    async create(opts) {
      const token = randomToken();
      const res = await fetch(serverUrl() + '/rooms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...opts, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) throw new Error(data.error || 'Erreur du serveur.');
      connect(data.code, token);
      return data.code;
    },
    join(code) { connect(code, session.tokenFor(code) || randomToken()); },
    resume() { const s = session.saved(); if (s && CODE_RE.test(s.code)) { connect(s.code, s.token); return s.code; } return null; },
    send(m) { if (net && net.ws && net.ws.readyState === 1) { net.ws.send(JSON.stringify(m)); return true; } return false; },
    leave() { stop(); session.clear(); },
    shareUrl(code) { return location.origin + location.pathname + '?partie=' + code; },
  };
}
