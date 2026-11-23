// Parties au tour par tour (Puissance 4, Dames, Mastermind, Memory, Pendu) : un Durable Object par partie.
// Il arbitre avec les règles partagées (../../shared) et n'envoie à chaque joueur que ce qu'il a le droit de voir.
import { DurableObject } from 'cloudflare:workers';
import { RULES, OPTION_KEYS } from '../../shared/index.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const newSeat = token => ({ token: token || null, rematch: false, left: false, away: false });

export class PlayRoom extends DurableObject {
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

  get rules() { return RULES[this.st.game]; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (this.st) return new Response('taken', { status: 409 });
      const b = await req.json().catch(() => ({}));
      const token = String(b.token || '').slice(0, 64);
      if (!token || !RULES[b.game]) return new Response('invalid', { status: 400 });
      const opts = {};
      for (const k of OPTION_KEYS[b.game] || []) opts[k] = !!(b.opts && b.opts[k]);
      this.st = {
        game: b.game, code: b.code, phase: 'lobby', starter: 0, winner: null, forfeit: null, score: [0, 0, 0], opts,
        g: RULES[b.game].create(opts, { starter: 0 }), seats: [newSeat(token), newSeat(null)],
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
    const rel = st.winner === null ? null : st.winner === 'draw' ? 'draw' : st.winner === seat ? 'win' : 'lose';
    return {
      t: 'state', game: st.game, code: st.code, seat, phase: st.phase,
      myTurn: st.phase === 'battle' && this.rules.toMove(st.g) === seat,
      result: over ? rel : null,
      forfeit: st.forfeit == null ? null : st.forfeit === seat ? 'me' : 'opponent',
      score: seat === 0 ? st.score : [st.score[1], st.score[0], st.score[2]],
      opponent: { present: !!op.token, connected: this.connected(1 - seat), rematch: op.rematch, left: !!op.left, away: !!op.away },
      me: { rematch: me.rematch, away: !!me.away },
      g: this.rules.view(st.g, seat),
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

  startRound() {
    const st = this.st;
    st.phase = 'battle'; st.winner = null; st.forfeit = null;
    st.g = this.rules.create(st.opts || {}, { starter: st.starter });
    for (const s of st.seats) { s.rematch = false; s.away = false; }
  }

  finish(winner) {
    const st = this.st;
    st.phase = 'over'; st.winner = winner;
    st.score[winner === 'draw' ? 2 : winner]++;
    // Le perdant commence la manche suivante ; après une nulle, celui qui n'avait pas commencé.
    st.starter = winner === 'draw' ? 1 - st.starter : 1 - winner;
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
        if (st.phase === 'lobby') st.phase = 'battle';
      }
      for (const o of this.ctx.getWebSockets()) if (o !== ws && this.seatOf(o) === seat) try { o.close(4001, 'replaced'); } catch {}
      st.seats[seat].left = false; st.seats[seat].away = false;
      ws.serializeAttachment({ seat });
      await this.save();
      return this.broadcast();
    }

    const seat = this.seatOf(ws);
    if (seat === null) return;
    const me = st.seats[seat], op = st.seats[1 - seat];

    switch (m.t) {
      case 'move': {
        if (st.phase !== 'battle') return;
        const ng = this.rules.apply(st.g, seat, m.m);
        if (!ng) return;
        st.g = ng;
        const r = this.rules.outcome(ng);
        if (r) this.finish(r.winner);
        break;
      }
      case 'leave':
        me.left = true; me.rematch = false;
        if (st.phase === 'battle') { this.finish(1 - seat); st.forfeit = seat; }
        break;
      case 'away':
        if (st.phase !== 'over') return;
        me.away = true;
        break;
      case 'rematch':
        if (st.phase !== 'over' || op.left) return;
        me.rematch = true; me.away = false;
        if (op.rematch) this.startRound();
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
