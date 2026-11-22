// Morpion en ligne : un Durable Object par partie, qui arbitre les coups.
// Le joueur 0 joue les croix (X), le joueur 1 les ronds (O). Le score se cumule d'une revanche à l'autre.
import { DurableObject } from 'cloudflare:workers';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function judge(board) {
  for (const l of LINES) {
    const [a, b, c] = l;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: l };
  }
  return board.every(v => v !== null) ? { winner: 'draw', line: null } : null;
}

const newSeat = token => ({ token: token || null, rematch: false, left: false, away: false });

export class TttRoom extends DurableObject {
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
        code: b.code, phase: 'lobby', board: new Array(9).fill(null), turn: 0, starter: 0,
        winner: null, line: null, forfeit: null, last: null, seq: 0, score: [0, 0, 0],
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
    return {
      t: 'state', game: 'morpion', code: st.code, seat, phase: st.phase,
      board: st.board, myTurn: st.phase === 'battle' && st.turn === seat,
      mark: seat === 0 ? 'X' : 'O',
      result: over ? (st.winner === 'draw' ? 'draw' : st.winner === seat ? 'win' : 'lose') : null,
      line: st.line, forfeit: st.forfeit == null ? null : st.forfeit === seat ? 'me' : 'opponent',
      score: seat === 0 ? st.score : [st.score[1], st.score[0], st.score[2]], // [moi, adversaire, nuls]
      opponent: { present: !!op.token, connected: this.connected(1 - seat), rematch: op.rematch, left: !!op.left, away: !!op.away },
      me: { rematch: me.rematch, away: !!me.away },
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

  startRound() {
    const st = this.st;
    st.phase = 'battle'; st.board = new Array(9).fill(null); st.turn = st.starter;
    st.winner = null; st.line = null; st.forfeit = null; st.last = null;
    for (const s of st.seats) { s.rematch = false; s.away = false; }
  }

  finish(winner, line) {
    const st = this.st;
    st.phase = 'over'; st.winner = winner; st.line = line;
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
        if (st.phase === 'lobby') this.startRound();
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
        const i = m.i;
        if (st.phase !== 'battle' || st.turn !== seat || !Number.isInteger(i) || i < 0 || i > 8 || st.board[i] !== null) return;
        st.board[i] = seat;
        st.last = { seq: ++st.seq, by: seat, i };
        const j = judge(st.board);
        if (j) this.finish(j.winner, j.line); else st.turn = 1 - seat;
        break;
      }
      case 'leave':
        me.left = true; me.rematch = false;
        if (st.phase === 'battle') { this.finish(1 - seat, null); st.forfeit = seat; st.starter = 0; }
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
