// Une partie en ligne = un Durable Object. Il garde l'état, arbitre les tirs
// et n'envoie à chaque joueur que ce qu'il a le droit de voir.
import { DurableObject } from 'cloudflare:workers';
import { SIZES, validateFleet, fire } from './rules.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000; // une partie inactive disparaît après 24 h

const newSeat = token => ({ token: token || null, ships: null, shots: [], ready: false, rematch: false, stats: { shots: 0, hits: 0 } });

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.st = (await ctx.storage.get('state')) || null; });
  }

  async save() {
    await this.ctx.storage.put('state', this.st);
    await this.ctx.storage.setAlarm(Date.now() + EXPIRY_MS);
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, 'expired'); } catch {}
    await this.ctx.storage.deleteAll();
    this.st = null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (this.st) return new Response('taken', { status: 409 });
      const b = await req.json().catch(() => ({}));
      const token = String(b.token || '').slice(0, 64);
      if (!token) return new Response('token', { status: 400 });
      this.st = {
        code: b.code,
        size: SIZES.includes(b.size) ? b.size : 10,
        replayOnHit: b.replayOnHit !== false,
        phase: 'lobby', turn: 0, winner: null, starter: null, round: 0, seq: 0, last: null,
        seats: [newSeat(token), newSeat(null)],
      };
      await this.save();
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket attendu', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  seatOf(ws) { return (ws.deserializeAttachment() || {}).seat ?? null; }
  connected(seat) { return this.ctx.getWebSockets().some(w => w.readyState === 1 && this.seatOf(w) === seat); }

  view(seat) {
    const st = this.st, me = st.seats[seat], op = st.seats[1 - seat], over = st.phase === 'over';
    const blank = () => new Array(st.size * st.size).fill(0);
    return {
      t: 'state',
      code: st.code, seat, phase: st.phase, size: st.size, replayOnHit: st.replayOnHit,
      myTurn: st.phase === 'battle' && st.turn === seat,
      youWon: over ? st.winner === seat : null,
      round: st.round,
      opponent: { present: !!op.token, connected: this.connected(1 - seat), ready: op.ready, rematch: op.rematch },
      me: { ready: me.ready, rematch: me.rematch, ships: me.ships, shots: me.shots.length ? me.shots : blank() },
      enemy: {
        shots: op.shots.length ? op.shots : blank(),
        // Seuls les navires coulés sont dévoilés, sauf en fin de partie.
        ships: (op.ships || []).filter(s => over || s.hits >= s.len),
      },
      stats: [me.stats, op.stats],
      last: st.last ? { ...st.last, mine: st.last.by === seat } : null,
    };
  }

  broadcast() {
    if (!this.st) return;
    for (const ws of this.ctx.getWebSockets()) {
      const seat = this.seatOf(ws);
      if (seat === null || ws.readyState !== 1) continue;
      try { ws.send(JSON.stringify(this.view(seat))); } catch {}
    }
  }

  error(ws, code, text) { try { ws.send(JSON.stringify({ t: 'error', code, text })); } catch {} }

  startBattle() {
    const st = this.st;
    st.phase = 'battle';
    st.turn = st.starter ?? (Math.random() < .5 ? 0 : 1);
    st.round = 0; st.winner = null; st.last = null;
    for (const s of st.seats) { s.stats = { shots: 0, hits: 0 }; s.rematch = false; }
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const st = this.st;
    if (!st) return this.error(ws, 'gone', 'Cette partie n\'existe plus.');

    if (m.t === 'hello') {
      const token = String(m.token || '').slice(0, 64);
      if (!token) return;
      let seat = st.seats.findIndex(s => s.token === token);
      if (seat < 0) {
        if (st.seats[1].token) return this.error(ws, 'full', 'Cette partie a déjà deux joueurs.');
        seat = 1;
        st.seats[1].token = token;
        if (st.phase === 'lobby') st.phase = 'placing';
      }
      // Une seule connexion par joueur : la plus récente remplace l'ancienne.
      for (const o of this.ctx.getWebSockets()) if (o !== ws && this.seatOf(o) === seat) try { o.close(4001, 'replaced'); } catch {}
      ws.serializeAttachment({ seat });
      await this.save();
      return this.broadcast();
    }

    const seat = this.seatOf(ws);
    if (seat === null) return;
    const me = st.seats[seat], op = st.seats[1 - seat];

    switch (m.t) {
      case 'fleet': {
        if (st.phase !== 'lobby' && st.phase !== 'placing') return;
        const ships = validateFleet(m.ships, st.size);
        if (!ships) return this.error(ws, 'fleet', 'Flotte invalide.');
        me.ships = ships; me.ready = true; me.shots = new Array(st.size * st.size).fill(0);
        if (op.ready && st.phase === 'placing') this.startBattle();
        break;
      }
      case 'unready':
        if (st.phase !== 'lobby' && st.phase !== 'placing') return;
        me.ready = false;
        break;
      case 'fire': {
        if (st.phase !== 'battle' || st.turn !== seat) return;
        const res = fire(op.ships, op.shots, st.size, m.r, m.c);
        if (res.result === 'repeat' || res.result === 'invalid') return;
        st.round++;
        me.stats.shots++;
        if (res.result !== 'miss') me.stats.hits++;
        st.last = { seq: ++st.seq, by: seat, r: res.r, c: res.c, result: res.result, ship: res.ship || null };
        if (res.fleetDestroyed) { st.phase = 'over'; st.winner = seat; }
        else if (!(res.result !== 'miss' && st.replayOnHit)) st.turn = 1 - seat;
        break;
      }
      case 'rematch':
        if (st.phase !== 'over') return;
        me.rematch = true;
        if (op.rematch) {
          st.starter = 1 - st.winner; // le perdant commence la revanche
          st.phase = 'placing'; st.winner = null; st.last = null; st.round = 0;
          for (const s of st.seats) { s.ships = null; s.shots = []; s.ready = false; s.rematch = false; }
        }
        break;
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) { ws.serializeAttachment({ seat: null }); this.broadcast(); }
  async webSocketError(ws) { ws.serializeAttachment({ seat: null }); this.broadcast(); }
}
