/**
 * #85 — since about 9 Oct 2026 the Simperium sync server answers 403 to a
 * WebSocket handshake that carries no User-Agent header. The simperium
 * client's default provider opens `new w3cwebsocket(url)` with no headers,
 * so every connect was refused and snote stayed offline.
 *
 * #615 item 3 (owner, 9 Nov): the Apache-2.0 `websocket` package is not
 * shipped in the GPL-2.0-only build. snote opens its sync socket with its own
 * client (SnoteSocket below, RFC 6455, text messages only), with one header
 * more than the bare handshake, `User-Agent: snote/<version>`, and gives each
 * socket its own http(s) agent that is destroyed when the socket closes, so a
 * refused (non-101) retry leaves no TCP connection open.
 *
 * #196: the client has no handshake timeout of its own, and the simperium
 * heartbeat and snote's auth watchdog both start only after `open`. A server
 * that accepts the connection and never answers the upgrade would leave the
 * socket CONNECTING for the whole session, with no close event and no retry.
 * So each socket gets one timer: if it is still CONNECTING after
 * HANDSHAKE_TIMEOUT_MS, snote closes it, the client's own close handler runs
 * and its reconnect schedule starts. proof: test/core/snote-socket.test.ts
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { isUtf8 } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';
import { VERSION } from '../cli/version';
import { publishProblem } from './problem-signal';
import type { ConnectFailure } from './connection-word';

export const SNOTE_USER_AGENT = `snote/${VERSION}`;

/** #196: how long a websocket upgrade may go unanswered before snote gives up on it and retries. */
export const HANDSHAKE_TIMEOUT_MS = 15000;

/**
 * #625: a close the server does not answer (a link that died in a sleep or a network change) leaves the socket
 * CLOSING for minutes, with no close event and no retry. A socket still not CLOSED this long after its close()
 * (or after the handshake bound, when that is shorter) has its TCP connection destroyed, so the close event
 * fires and the client's own close handler starts its reconnect schedule. proof: test/core/stale-reconnect.test.ts
 */
export const CLOSE_GRACE_MS = 3000;

// #79: snote's live sockets; the status word tells `stale` (a socket is open, silent) from `offline` (none is open).
// Asks each socket's readyState, which is already CLOSED when the client's own close handler runs.
const sockets = new Set<SnoteSocket>();
// #79: upgrades given up on since the last open; from the second one the notice line says why.
let unanswered = 0;
// #632: how the last attempt failed before it opened; null once a socket opens. Read by the status word and reason.
let failure: ConnectFailure | null = null;

export function connectFailure(): ConnectFailure | null {
  return failure;
}

/** #649: each sign-in (store.ts) starts with no failure and no unanswered count from the session before. proof: test/tui/status-reason.test.tsx */
export function startConnectSession(): void {
  failure = null;
  unanswered = 0;
}

export function hasOpenSocket(): boolean {
  for (const s of sockets) if (s.readyState === s.OPEN) return true;
  return false;
}

/** `handshakeTimeoutMs` is a test seam; the product always uses HANDSHAKE_TIMEOUT_MS. */
export function snoteWebsocketProvider(url: string, handshakeTimeoutMs: number = HANDSHAKE_TIMEOUT_MS): SnoteSocket {
  const agent = socketScheme(url) === true ? new https.Agent() : new http.Agent();
  // #625: keep this socket's TCP connection, so an unanswered close can end it
  let tcp: { destroy(): unknown } | null | undefined;
  const connect = agent.createConnection.bind(agent);
  agent.createConnection = (o, cb) => (tcp = connect(o, cb));
  const socket = new SnoteSocket(url, { 'User-Agent': SNOTE_USER_AGENT }, agent, Math.min(CLOSE_GRACE_MS, handshakeTimeoutMs));
  sockets.add(socket);
  const close = socket.close.bind(socket);
  socket.close = (code?: number, reason?: string) => {
    close(code, reason);
    setTimeout(() => {
      if (socket.readyState !== socket.CLOSED) tcp?.destroy();
    }, socket.closeGraceMs).unref();
  };
  let timedOut = false; // #632: this socket's upgrade was given up on by giveUp
  const giveUp = setTimeout(() => {
    if (socket.readyState !== socket.CONNECTING) return;
    if (++unanswered >= 2) publishProblem(`sync server not answering, retrying (attempt ${unanswered})`);
    timedOut = true;
    socket.close();
  }, handshakeTimeoutMs);
  giveUp.unref();
  socket.addEventListener('open', () => { clearTimeout(giveUp); unanswered = 0; });
  // #632: `error` comes only for an attempt that did not open, and before `close`, so the render that close starts sees it
  socket.addEventListener('error', () => { failure = timedOut ? 'unanswered' : 'unreachable'; });
  socket.addEventListener('open', () => { failure = null; });
  socket.addEventListener('close', () => { clearTimeout(giveUp); agent.destroy(); sockets.delete(socket); });
  return socket;
}

/** Spread into the simperium client options (see store.ts). */
export const snoteSocketOptions = { websocketClientProvider: snoteWebsocketProvider };

/** #615: the largest message snote takes from the sync server, the bound the old websocket library had (8 MiB). proof: test/core/snote-socket.test.ts */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
/** #615: the most fragments one message may have; one more fails the socket. proof: test/core/snote-socket.test.ts */
export const MAX_FRAGMENTS = 1024;
/** #615: small reads are joined into pieces of at least this size, so a frame is held in at most 2 * MAX_MESSAGE_BYTES / PIECE_BYTES + 2 pieces. */
export const PIECE_BYTES = 4096;

/** #615: the one scheme decision: true for wss and https, false for ws and http, null for any other scheme or a url that does not parse. */
export function socketScheme(url: string): boolean | null {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return null;
  }
  if (protocol === 'wss:' || protocol === 'https:') return true;
  return protocol === 'ws:' || protocol === 'http:' ? false : null;
}
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** RFC 6455 7.4 and the IANA close code registry: the codes a close frame may carry (not 0-999, 1004-1006, 1015, 1016-2999 or over 4999). */
function closeCodeOnWire(c: number): boolean {
  return (c >= 1000 && c <= 1003) || (c >= 1007 && c <= 1014) || (c >= 3000 && c <= 4999);
}
type Listener = (event: { type: string; data?: string; code?: number; reason?: string; message?: string }) => void;

/**
 * #615: the sync socket, the W3C WebSocket subset simperium and this provider use (onopen, onmessage, onclose,
 * addEventListener, readyState, send, close). Fails closed: a refused or malformed upgrade (a 101 needs
 * `Connection: Upgrade`), a masked, reserved, oversized, binary or non-UTF-8 frame from the server, a close frame
 * with a 1-byte body, a code no endpoint may send or a non-UTF-8 reason, more than MAX_FRAGMENTS fragments, or a ping while more than
 * MAX_MESSAGE_BYTES wait unread by the server, ends the TCP connection and `close` fires (`error` first only when
 * it never opened), and simperium's reconnect schedule starts. No redirect is followed and no extension is offered.
 * proof: test/core/snote-socket.test.ts
 */
export class SnoteSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;
  private listeners: { type: string; fn: Listener }[] = [];
  private req: http.ClientRequest | null = null;
  private sock: Socket | null = null;
  private chunks: Buffer[] = [];
  private have = 0;
  private parts: Buffer[] | null = null; // the fragments of a text message being assembled
  private partBytes = 0;
  private closeCode = 1006;
  private closeReason = '';
  private opened = false;
  private closeSeen = false; // the server's close frame has arrived: nothing after it is read (RFC 6455 5.5.2)
  private pongBytes = 0; // pong bytes written and not yet handed to the kernel
  readonly closeGraceMs: number; // #625: how long a closing socket waits for the server to end TCP
  private grace: ReturnType<typeof setTimeout> | null = null; // armed by the server's close frame, cleared by finish()

  constructor(url: string, headers: Record<string, string>, agent: http.Agent, closeGraceMs: number = CLOSE_GRACE_MS) {
    this.closeGraceMs = closeGraceMs;
    const tls = socketScheme(url); // --server may name an http(s) url, as the old library allowed
    if (tls === null) {
      setImmediate(() => this.finish('not a websocket url'));
      return;
    }
    const u = new URL(url);
    const key = randomBytes(16).toString('base64');
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    const opts: https.RequestOptions = {
      hostname: u.hostname.replace(/^\[|\]$/g, ''),
      port: u.port || (tls ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      agent,
      headers: { ...headers, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key },
    };
    this.req = tls ? https.request(opts) : http.request(opts);
    this.req.on('error', (e) => this.finish(e.message));
    this.req.on('close', () => { if (!this.sock) this.finish('closed before the connection was established'); });
    this.req.on('response', (res) => {
      res.destroy();
      this.finish(`unexpected server response: ${res.statusCode}`);
    });
    this.req.on('upgrade', (res, sock: Socket, head: Buffer) => {
      this.sock = sock;
      sock.on('close', () => this.finish(this.closeCode === 1006 ? 'connection closed' : null));
      sock.on('error', () => sock.destroy());
      const h = res.headers;
      if (this.readyState !== this.CONNECTING || res.statusCode !== 101 || String(h.upgrade).toLowerCase() !== 'websocket'
        || !String(h.connection).split(',').some((t) => t.trim().toLowerCase() === 'upgrade') // RFC 6455 4.1
        || h['sec-websocket-accept'] !== accept || h['sec-websocket-extensions'] !== undefined || h['sec-websocket-protocol'] !== undefined) {
        sock.destroy();
        return;
      }
      sock.setNoDelay(true);
      this.readyState = this.OPEN;
      this.opened = true;
      sock.on('data', (d: Buffer) => this.receive(d));
      this.emit({ type: 'open' });
      if (head.length > 0 && this.readyState === this.OPEN) this.receive(head);
    });
    this.req.end();
  }

  addEventListener(type: string, fn: Listener): void {
    this.listeners.push({ type, fn });
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners = this.listeners.filter((l) => l.type !== type || l.fn !== fn);
  }

  send(data: string): void {
    if (this.readyState !== this.OPEN || !this.sock) throw new Error('cannot send: the socket is not open');
    this.frame(0x1, Buffer.from(String(data), 'utf8'));
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) return;
    if (this.readyState === this.CONNECTING || !this.sock) {
      this.readyState = this.CLOSING;
      this.req?.destroy();
      if (this.sock) this.sock.destroy();
      return;
    }
    this.readyState = this.CLOSING;
    // RFC 6455 7.4.2: a code no endpoint may send goes out as 1000; a reason over 123 bytes is left out, as a cut one may end mid-character
    const said = Buffer.from(reason ?? '', 'utf8');
    const why = said.length <= 123 ? said : Buffer.alloc(0);
    const body = Buffer.alloc(2 + why.length);
    body.writeUInt16BE(code !== undefined && closeCodeOnWire(code) ? code : 1000, 0);
    why.copy(body, 2);
    this.frame(0x8, body);
  }

  private emit(event: { type: string; data?: string; code?: number; reason?: string; message?: string }): void {
    const own = (this as unknown as Record<string, Listener | null>)[`on${event.type}`];
    if (typeof own === 'function') own.call(this, event);
    for (const l of this.listeners.slice()) if (l.type === event.type) l.fn.call(this, event);
  }

  /** Ends the socket once: `error` first when the attempt never opened (#632 reads it as a failed attempt), then `close`. */
  private finish(error: string | null): void {
    if (this.readyState === this.CLOSED) return;
    this.readyState = this.CLOSED;
    if (this.grace) clearTimeout(this.grace);
    this.sock?.destroy();
    this.chunks = [];
    this.parts = null;
    if (error !== null && !this.opened) this.emit({ type: 'error', message: error });
    this.emit({ type: 'close', code: this.closeCode, reason: this.closeReason });
    this.listeners = [];
  }

  /** A protocol error from the server: drop the connection at once (fail closed). */
  private fail(code: number): void {
    this.closeCode = 1006;
    this.sock?.destroy();
    this.finish(`protocol error ${code}`);
  }

  private frame(opcode: number, payload: Buffer, pong = false): void {
    const n = payload.length;
    const head = Buffer.alloc(n < 126 ? 6 : n < 65536 ? 8 : 14);
    head[0] = 0x80 | opcode;
    if (n < 126) head[1] = 0x80 | n;
    else if (n < 65536) { head[1] = 0x80 | 126; head.writeUInt16BE(n, 2); }
    else { head[1] = 0x80 | 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
    const mask = randomBytes(4);
    mask.copy(head, head.length - 4);
    const body = Buffer.allocUnsafe(n);
    for (let i = 0; i < n; i++) body[i] = payload[i] ^ mask[i & 3];
    if (!this.sock) return;
    const bytes = Buffer.concat([head, body]);
    if (!pong) return void this.sock.write(bytes);
    this.pongBytes += bytes.length;
    this.sock.write(bytes, () => { this.pongBytes -= bytes.length; });
  }

  private peek(n: number): Buffer {
    let out = this.chunks[0];
    for (let i = 1; out.length < n && i < this.chunks.length; i++) out = Buffer.concat([out, this.chunks[i]]);
    return out.subarray(0, n);
  }

  private take(n: number): Buffer {
    const out = Buffer.allocUnsafe(n);
    let at = 0;
    while (at < n) {
      const c = this.chunks[0];
      const k = Math.min(c.length, n - at);
      c.copy(out, at, 0, k);
      at += k;
      if (k === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(k);
    }
    this.have -= n;
    return out;
  }

  private receive(data: Buffer): void {
    if (this.closeSeen) return; // RFC 6455 5.5.2 and 1.4: no pong and no message after the server's close frame
    const last = this.chunks[this.chunks.length - 1];
    if (last !== undefined && last.length < PIECE_BYTES && data.length < PIECE_BYTES) this.chunks[this.chunks.length - 1] = Buffer.concat([last, data]);
    else this.chunks.push(data);
    this.have += data.length;
    while (this.sock && this.have >= 2 && (this.readyState === this.OPEN || this.readyState === this.CLOSING)) {
      const h = this.peek(Math.min(this.have, 10));
      const fin = (h[0] & 0x80) !== 0;
      const opcode = h[0] & 0x0f;
      let len = h[1] & 0x7f;
      let at = 2;
      if ((h[0] & 0x70) !== 0 || (h[1] & 0x80) !== 0) return this.fail(1002); // reserved bits, or a masked server frame
      if (len === 126) {
        if (h.length < 4) return;
        len = h.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (h.length < 10) return;
        if (h.readUInt32BE(2) !== 0) return this.fail(1009);
        len = h.readUInt32BE(6);
        at = 10;
      }
      if (opcode >= 0x8 ? opcode > 0xa || !fin || len > 125 : opcode > 0x2) return this.fail(1002);
      if (opcode === 0x2) return this.fail(1003); // the sync protocol is text only
      if (opcode < 0x8 && this.partBytes + len > MAX_MESSAGE_BYTES) return this.fail(1009);
      if (this.have < at + len) return;
      this.take(at);
      const payload = this.take(len);
      if (opcode === 0x9) {
        // only queued pong bytes are counted, never snote's own sends. proof: test/core/snote-socket.test.ts
        if (this.pongBytes > MAX_MESSAGE_BYTES) return this.fail(1008);
        this.frame(0xa, payload, true);
      }
      else if (opcode === 0x8) {
        if (payload.length === 1) return this.fail(1002); // RFC 6455 5.5.1: a close body is empty or starts with a 2-byte code
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        if (payload.length >= 2 && !closeCodeOnWire(code)) return this.fail(1002); // RFC 6455 7.4.1 and 7.4.2
        if (!isUtf8(payload.subarray(2))) return this.fail(1007); // RFC 6455 7.1.6: the close reason is UTF-8
        this.closeCode = code;
        this.closeReason = payload.subarray(2).toString('utf8');
        this.closeSeen = true;
        this.chunks = [];
        this.have = 0;
        if (this.readyState === this.OPEN) { this.readyState = this.CLOSING; this.frame(0x8, payload.subarray(0, 2)); }
        this.sock.end();
        // RFC 6455 7.1.1: the server ends TCP after the close handshake; a server that keeps it open has it destroyed after the close grace (#625). proof: test/core/snote-socket.test.ts
        this.grace = setTimeout(() => this.sock?.destroy(), this.closeGraceMs);
        this.grace.unref();
        return;
      } else if (opcode !== 0xa) {
        if ((opcode === 0x0) === (this.parts === null)) return this.fail(1002); // a continuation with no message, or a new message inside one
        const parts = this.parts ?? [];
        if (parts.length >= MAX_FRAGMENTS) return this.fail(1009);
        parts.push(payload);
        this.partBytes += len;
        this.parts = parts;
        if (fin) {
          const text = Buffer.concat(parts);
          this.parts = null;
          this.partBytes = 0;
          if (!isUtf8(text)) return this.fail(1007);
          this.emit({ type: 'message', data: text.toString('utf8') });
        }
      }
    }
  }
}
