// Serveur de parties en ligne d'Amiral (Cloudflare Worker).
//   POST /g/JEU                   (c4, dames, mastermind, memory, pendu) crée une partie
//   POST /rooms, /morpion         crée une partie et renvoie son code
//   GET  /rooms/CODE/ws, /morpion/CODE/ws   WebSocket de la partie (le Durable Object arbitre)
export { GameRoom } from './room.js';
export { TttRoom } from './ttt.js';
export { PlayRoom } from './play.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });

const GAMES = ['c4', 'dames', 'mastermind', 'memory', 'pendu'];

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

    // Un espace par jeu : Amiral (/rooms), Morpion (/morpion) et les jeux au tour par tour (/g/JEU).
    const parts = url.pathname.split('/').filter(Boolean);
    let ns = null, game = null, rest = [];
    if (parts[0] === 'rooms') { ns = env.ROOMS; rest = parts.slice(1); }
    else if (parts[0] === 'morpion') { ns = env.TTT; rest = parts.slice(1); }
    else if (parts[0] === 'g' && GAMES.includes(parts[1])) { ns = env.PLAY; game = parts[1]; rest = parts.slice(2); }
    const name = code => (game ? game + ':' + code : code);

    if (ns && rest.length === 0 && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      for (let i = 0; i < 5; i++) {
        const code = makeCode();
        const stub = ns.get(ns.idFromName(name(code)));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ ...body, code, game }) });
        if (res.status === 200) return json({ code });
        if (res.status !== 409) return json({ error: 'Requête invalide.' }, 400);
      }
      return json({ error: 'Impossible de créer la partie, réessayez.' }, 503);
    }

    if (ns && rest.length === 2 && rest[1] === 'ws') {
      const code = rest[0].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Code invalide.' }, 400);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu.' }, 426);
      return ns.get(ns.idFromName(name(code))).fetch(req);
    }

    if (url.pathname === '/') return new Response('La boîte de jeux : serveur de parties en ligne.', { headers: CORS });
    return json({ error: 'Introuvable.' }, 404);
  },
};
