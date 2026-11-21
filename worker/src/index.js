// Serveur de parties en ligne d'Amiral (Cloudflare Worker).
//   POST /rooms               crée une partie et renvoie son code
//   GET  /rooms/CODE/ws       WebSocket de la partie (le Durable Object arbitre)
export { GameRoom } from './room.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });

// Codes sans caractères ambigus (pas de 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJKMNP-Z2-9]{5}$/;
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/rooms' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      for (let i = 0; i < 5; i++) {
        const code = makeCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ ...body, code }) });
        if (res.status === 200) return json({ code });
        if (res.status !== 409) return json({ error: 'Requête invalide.' }, 400);
      }
      return json({ error: 'Impossible de créer la partie, réessayez.' }, 503);
    }

    const m = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Code invalide.' }, 400);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu.' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }

    if (url.pathname === '/') return new Response('Amiral : serveur de parties en ligne.', { headers: CORS });
    return json({ error: 'Introuvable.' }, 404);
  },
};
