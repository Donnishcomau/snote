/**
 * #615 item 3: snote's own sync socket (SnoteSocket in src/core/websocket-provider.ts) replaces the Apache-2.0
 * `websocket` package. A raw TCP server on 127.0.0.1 plays the sync server, so every byte on the wire is the test's:
 * the handshake snote sends, the frames it accepts, and every malformed or hostile answer, which must end the TCP
 * connection (fail closed) and fire `close` without a message and without an uncaught exception.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json';
import { hasOpenSocket, MAX_FRAGMENTS, MAX_MESSAGE_BYTES, PIECE_BYTES, SnoteSocket, snoteWebsocketProvider } from '../../src/core/websocket-provider';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
type Mode = 'open' | 'refuse' | 'mute' | 'bad-accept' | 'extensions' | 'redirect' | 'drop' | 'no-connection' | 'connection-other' | 'connection-list';
type Raw = { url: string; heads: string[]; live: Set<net.Socket>; conns: number; sock: () => net.Socket; got: Buffer[]; close: () => Promise<void> };
const servers: Raw[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** A sync server that answers the upgrade as `mode` says and then hands its socket to the test. */
async function raw(mode: Mode): Promise<Raw> {
  const live = new Set<net.Socket>();
  const heads: string[] = [];
  const got: Buffer[] = [];
  let last: net.Socket | null = null;
  let conns = 0;
  const srv = net.createServer((s) => {
    conns++;
    live.add(s);
    s.on('close', () => live.delete(s));
    s.on('error', () => {});
    let buf = Buffer.alloc(0);
    let upgraded = false;
    s.on('data', (d) => {
      if (upgraded) return void got.push(d);
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      upgraded = true;
      const head = buf.subarray(0, end).toString('latin1');
      heads.push(head);
      if (buf.length > end + 4) got.push(buf.subarray(end + 4));
      const key = /sec-websocket-key:\s*(\S+)/i.exec(head)?.[1] ?? '';
      const accept = createHash('sha1').update(key + GUID).digest('base64');
      last = s;
      if (mode === 'mute') return;
      if (mode === 'drop') return void s.destroy();
      if (mode === 'refuse') return void s.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 5\r\n\r\nnope\n');
      if (mode === 'redirect') return void s.write(`HTTP/1.1 302 Found\r\nLocation: ws://127.0.0.1:${port}/elsewhere\r\nContent-Length: 0\r\n\r\n`);
      const extra = mode === 'extensions' ? 'Sec-WebSocket-Extensions: permessage-deflate\r\n' : '';
      const acc = mode === 'bad-accept' ? Buffer.from('wrong').toString('base64') : accept;
      const conn = mode === 'no-connection' ? '' : `Connection: ${mode === 'connection-other' ? 'keep-alive' : mode === 'connection-list' ? 'keep-alive, Upgrade' : 'Upgrade'}\r\n`;
      s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n${conn}Sec-WebSocket-Accept: ${acc}\r\n${extra}\r\n`);
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as net.AddressInfo).port;
  const r: Raw = {
    url: `ws://127.0.0.1:${port}/sock/1/app/websocket`,
    heads,
    live,
    get conns() { return conns; },
    sock: () => last as unknown as net.Socket,
    got,
    close: () => new Promise<void>((done) => { srv.close(() => done()); for (const x of live) x.destroy(); }),
  };
  servers.push(r);
  return r;
}

/** One unmasked server frame. */
function frame(opcode: number, payload: Buffer | string, { fin = true, rsv = 0, mask = false, len }: { fin?: boolean; rsv?: number; mask?: boolean; len?: number } = {}): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const n = len ?? body.length;
  const head = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = (fin ? 0x80 : 0) | rsv | opcode;
  if (n < 126) head[1] = n;
  else if (n < 65536) { head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head[1] = 127; head.writeUInt32BE(Math.floor(n / 2 ** 32), 2); head.writeUInt32BE(n >>> 0, 6); }
  if (mask) head[1] |= 0x80;
  return Buffer.concat(mask ? [head, Buffer.alloc(4), body] : [head, body]);
}

/** The client frames the server received, unmasked: [opcode, payload]. */
function clientFrames(bytes: Buffer): [number, Buffer][] {
  const out: [number, Buffer][] = [];
  let at = 0;
  while (at + 2 <= bytes.length) {
    let len = bytes[at + 1] & 0x7f;
    let h = 2;
    if (len === 126) { len = bytes.readUInt16BE(at + 2); h = 4; }
    else if (len === 127) { len = bytes.readUInt32BE(at + 6); h = 10; }
    const masked = (bytes[at + 1] & 0x80) !== 0;
    const mask = masked ? bytes.subarray(at + h, at + h + 4) : Buffer.alloc(4);
    const start = at + h + (masked ? 4 : 0);
    if (start + len > bytes.length) break;
    const p = Buffer.from(bytes.subarray(start, start + len));
    for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
    out.push([bytes[at] & 0x0f, masked ? p : Buffer.from('UNMASKED')]);
    at = start + len;
  }
  return out;
}

type Seen = { events: string[]; messages: string[] };
function watch(s: SnoteSocket): Seen {
  const seen: Seen = { events: [], messages: [] };
  s.onopen = () => seen.events.push('open');
  s.onmessage = (e) => { seen.messages.push(String(e.data)); };
  s.addEventListener('error', () => seen.events.push('error'));
  s.onclose = (e) => seen.events.push(`close ${e.code}`);
  return seen;
}

async function opened(mode: Mode = 'open'): Promise<{ srv: Raw; s: SnoteSocket; seen: Seen }> {
  const srv = await raw(mode);
  const s = snoteWebsocketProvider(srv.url, 1000);
  const seen = watch(s);
  await expect.poll(() => s.readyState, { timeout: 2000 }).toBe(s.OPEN);
  return { srv, s, seen };
}

describe('#615 SnoteSocket, the sync socket with no Apache-2.0 code', () => {
  it('1: WHEN snote opens a socket THEN the handshake is one GET with exactly the headers host, user-agent (`snote/` + version), upgrade, connection, sec-websocket-version `13` and a 16-byte sec-websocket-key, and no origin, extension or protocol header (the same wire as the old library)', async () => {
    const { srv } = await opened();
    const lines = srv.heads[0].split('\r\n');
    expect(lines[0]).toBe('GET /sock/1/app/websocket HTTP/1.1');
    const h = Object.fromEntries(lines.slice(1).map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
    expect(Object.keys(h).sort()).toEqual(['connection', 'host', 'sec-websocket-key', 'sec-websocket-version', 'upgrade', 'user-agent']);
    expect([h['user-agent'], h.upgrade, h.connection, h['sec-websocket-version'], Buffer.from(h['sec-websocket-key'], 'base64').length]).toEqual([`snote/${pkg.version}`, 'websocket', 'Upgrade', '13', 16]);
  });

  it('2: WHEN the socket is open THEN `send` writes one masked text frame, a 16-bit, a 64-bit-length (70000 bytes) and a 3-part fragmented text message arrive whole and in order, and a ping is answered with a pong of the same payload', async () => {
    const { srv, s, seen } = await opened();
    s.send('0:init');
    const big = 'x'.repeat(70000);
    srv.sock().write(Buffer.concat([frame(1, 'a'.repeat(300)), frame(1, big), frame(1, 'one ', { fin: false }), frame(9, 'pp'), frame(0, 'two ', { fin: false }), frame(0, 'three')]));
    await expect.poll(() => seen.messages.length, { timeout: 2000 }).toBe(3);
    expect(seen.messages.map((m) => m.length)).toEqual([300, 70000, 13]);
    expect(seen.messages[2]).toBe('one two three');
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.toString()}`), { timeout: 2000 }).toEqual(['1:0:init', '10:pp']);
  });

  it('3: WHEN a text message of exactly MAX_MESSAGE_BYTES (8 MiB) arrives in 64 KiB pieces THEN it is delivered whole', async () => {
    const { srv, seen } = await opened();
    const all = frame(1, Buffer.alloc(MAX_MESSAGE_BYTES, 0x61));
    for (let at = 0; at < all.length; at += 65536) srv.sock().write(all.subarray(at, at + 65536));
    await expect.poll(() => seen.messages.length, { timeout: 2500 }).toBe(1);
    expect(seen.messages[0].length).toBe(MAX_MESSAGE_BYTES);
  });

  const HOSTILE: [string, () => Buffer][] = [
    ['a masked server frame', () => frame(1, 'hi', { mask: true })],
    ['RSV1 set (an extension no one offered)', () => frame(1, 'hi', { rsv: 0x40 })],
    ['reserved opcode 3', () => frame(3, 'hi')],
    ['reserved control opcode 11', () => frame(11, '')],
    ['a binary frame (the sync protocol is text only)', () => frame(2, 'hi')],
    ['a ping with 126 payload bytes', () => frame(9, 'p'.repeat(126))],
    ['a fragmented ping', () => frame(9, 'p', { fin: false })],
    ['a continuation with no message', () => frame(0, 'hi')],
    ['a new text frame inside a fragmented message', () => Buffer.concat([frame(1, 'a', { fin: false }), frame(1, 'b')])],
    ['invalid UTF-8', () => frame(1, Buffer.from([0x68, 0xff, 0xfe]))],
    ['a 64-bit length with the high word set', () => frame(1, Buffer.alloc(0), { len: 2 ** 40 }).subarray(0, 10)],
    ['a header announcing MAX_MESSAGE_BYTES + 1 (no payload sent)', () => frame(1, Buffer.alloc(0), { len: MAX_MESSAGE_BYTES + 1 }).subarray(0, 10)],
    ['a close frame with a 1-byte body', () => frame(8, Buffer.from([0x03]))],
    ['a close frame whose reason is not UTF-8', () => frame(8, Buffer.from([0x03, 0xe8, 0xff, 0xfe]))],
    ['fragments that sum past MAX_MESSAGE_BYTES', () => Buffer.concat([frame(1, Buffer.alloc(MAX_MESSAGE_BYTES - 10, 0x61), { fin: false }), frame(0, Buffer.alloc(0), { len: 11 }).subarray(0, 2)])],
  ];
  for (const [name, bytes] of HOSTILE) {
    it(`4: WHEN the open socket gets ${name} THEN the TCP connection ends, \`close\` fires with no message and no \`error\`, readyState is CLOSED and nothing is thrown`, async () => {
      const { srv, s, seen } = await opened();
      srv.sock().write(bytes());
      await expect.poll(() => ({ live: srv.live.size, state: s.readyState }), { timeout: 2000 }).toEqual({ live: 0, state: s.CLOSED });
      expect(seen).toEqual({ events: ['open', 'close 1006'], messages: [] });
    });
  }

  const REFUSED: [string, Mode][] = [
    ['a 403 refusal', 'refuse'],
    ['a 101 with the wrong Sec-WebSocket-Accept', 'bad-accept'],
    ['a 101 with an extension no one offered', 'extensions'],
    ['a 101 with no Connection header', 'no-connection'],
    ['a 101 with `Connection: keep-alive` (no Upgrade token)', 'connection-other'],
    ['a 302 redirect (never followed)', 'redirect'],
    ['a TCP drop mid-handshake', 'drop'],
  ];
  for (const [name, mode] of REFUSED) {
    it(`5: WHEN the upgrade gets ${name} THEN \`error\` then \`close 1006\` fire with no \`open\`, readyState is CLOSED, the server saw exactly 1 connection and has 0 open`, async () => {
      const srv = await raw(mode);
      const s = snoteWebsocketProvider(srv.url, 1000);
      const seen = watch(s);
      await expect.poll(() => seen.events, { timeout: 2000 }).toEqual(['error', 'close 1006']);
      await expect.poll(() => ({ live: srv.live.size, conns: srv.conns, state: s.readyState }), { timeout: 2000 }).toEqual({ live: 0, conns: 1, state: s.CLOSED });
    });
  }

  it('6: WHEN the sync port refuses the TCP connection, or a wss url reaches a server that speaks no TLS THEN each socket fires `error` then `close 1006` and never opens', async () => {
    const gone = await raw('open');
    const port = Number(new URL(gone.url).port);
    await gone.close();
    const plain = await raw('mute');
    const a = watch(snoteWebsocketProvider(`ws://127.0.0.1:${port}/x`, 1000));
    const b = watch(snoteWebsocketProvider(plain.url.replace('ws:', 'wss:'), 1000));
    await expect.poll(() => [a.events, b.events], { timeout: 2500 }).toEqual([['error', 'close 1006'], ['error', 'close 1006']]);
  });

  it('7: WHEN `close()` is called on a socket whose upgrade is unanswered THEN `error` then `close 1006` fire within 1000 ms and the server has 0 open TCP connections', async () => {
    const srv = await raw('mute');
    const s = snoteWebsocketProvider(srv.url, 60000);
    const seen = watch(s);
    await expect.poll(() => srv.heads.length, { timeout: 1000 }).toBe(1);
    s.close();
    await expect.poll(() => ({ events: seen.events, live: srv.live.size }), { timeout: 1000 }).toEqual({ events: ['error', 'close 1006'], live: 0 });
  });

  it('8: WHEN the client closes an open socket THEN it sends one masked close frame with code 1000, and when the server echoes it `close 1000` fires with no `error`; WHEN the server never answers THEN the close grace ends the TCP connection and `close 1006` fires', async () => {
    const { srv, s, seen } = await opened();
    s.close();
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.length >= 2 ? p.readUInt16BE(0) : ''}`), { timeout: 1000 }).toEqual(['8:1000']);
    const code = Buffer.alloc(2);
    code.writeUInt16BE(1000, 0);
    srv.sock().write(frame(8, code));
    srv.sock().end();
    await expect.poll(() => seen.events, { timeout: 1000 }).toEqual(['open', 'close 1000']);
    const quiet = await opened();
    const t0 = Date.now();
    quiet.s.close();
    await expect.poll(() => quiet.seen.events, { timeout: 2500 }).toEqual(['open', 'close 1006']);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(quiet.srv.live.size).toBe(0);
  });

  it('9: WHEN the server sends a close frame with code 4001 THEN the client echoes code 4001, ends the connection and `close 4001` fires with no `error`', async () => {
    const { srv, seen } = await opened();
    const code = Buffer.alloc(2);
    code.writeUInt16BE(4001, 0);
    srv.sock().write(frame(8, code));
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.readUInt16BE(0)}`), { timeout: 1000 }).toEqual(['8:4001']);
    srv.sock().end();
    await expect.poll(() => seen.events, { timeout: 1000 }).toEqual(['open', 'close 4001']);
  });

  it('10: WHEN `send` is called before open or after close THEN it throws (simperium catches it), and a `close()` right after a 1 MiB `send` throws nothing and ends the socket', async () => {
    const srv = await raw('mute');
    const early = snoteWebsocketProvider(srv.url, 1000);
    expect(() => early.send('x')).toThrow('not open');
    early.close();
    const { s, seen } = await opened();
    s.send('y'.repeat(1024 * 1024));
    expect(() => s.close()).not.toThrow();
    await expect.poll(() => seen.events, { timeout: 2500 }).toEqual(['open', 'close 1006']);
    expect(() => s.send('z')).toThrow('not open');
  });

  it('12: WHEN the server stops reading and sends 16 MiB of pings THEN the queued pong bytes pass MAX_MESSAGE_BYTES, the socket ends the TCP connection and `close 1006` fires', async () => {
    const { srv, seen } = await opened();
    srv.sock().pause();
    const ping = frame(9, 'p'.repeat(125));
    srv.sock().write(Buffer.concat(new Array(Math.ceil((16 * 1024 * 1024) / ping.length)).fill(ping)));
    await expect.poll(() => seen.events, { timeout: 2500 }).toEqual(['open', 'close 1006']);
  });

  it('13: WHEN one non-final text frame is followed by 1,000,000 empty continuation frames THEN the TCP connection ends, `close` fires with no message and no `error`, and readyState is CLOSED', async () => {
    const { srv, s, seen } = await opened();
    const empty = frame(0, Buffer.alloc(0), { fin: false });
    srv.sock().write(Buffer.concat([frame(1, 'a', { fin: false }), ...new Array(1_000_000).fill(empty)]));
    await expect.poll(() => ({ live: srv.live.size, state: s.readyState }), { timeout: 2500 }).toEqual({ live: 0, state: s.CLOSED });
    expect(seen).toEqual({ events: ['open', 'close 1006'], messages: [] });
    expect(MAX_FRAGMENTS).toBe(1024);
  });

  it('14: WHEN a frame announcing 8 MiB arrives as 100,000 single-byte reads THEN the buffered piece count stays at or under `2 * MAX_MESSAGE_BYTES / PIECE_BYTES + 2`, and the whole message still arrives', async () => {
    const { s, seen } = await opened();
    const all = frame(1, Buffer.alloc(MAX_MESSAGE_BYTES, 0x62));
    const feed = (b: Buffer): void => (s as unknown as { receive(d: Buffer): void }).receive(b);
    const pieces = (): number => (s as unknown as { chunks: Buffer[] }).chunks.length;
    let most = 0;
    for (let i = 0; i < 100_000; i++) {
      feed(all.subarray(i, i + 1));
      most = Math.max(most, pieces());
    }
    expect(most).toBeLessThanOrEqual((2 * MAX_MESSAGE_BYTES) / PIECE_BYTES + 2);
    feed(all.subarray(100_000));
    expect(seen.messages.map((m) => m.length)).toEqual([MAX_MESSAGE_BYTES]);
  });

  it('15: WHEN 2000 sends of 6 KiB (12 MiB) are made in one tick to a server that reads normally THEN no `close` fires and the server receives all 2000 messages', async () => {
    const { srv, s, seen } = await opened();
    const msg = 'm'.repeat(6 * 1024);
    for (let i = 0; i < 2000; i++) s.send(msg);
    await expect.poll(() => Buffer.concat(srv.got).length, { timeout: 2500 }).toBeGreaterThanOrEqual(2000 * (6 * 1024 + 8));
    expect(clientFrames(Buffer.concat(srv.got)).filter(([op, p]) => op === 1 && p.length === 6 * 1024).length).toBe(2000);
    expect(seen.events).toEqual(['open']);
  });

  it('17: WHEN 2000 sends of 6 KiB (12 MiB) are queued in one tick and the server then sends one ping THEN no `close` fires, the server receives all 2000 messages and one pong with the ping payload', async () => {
    const { srv, s, seen } = await opened();
    const msg = 'm'.repeat(6 * 1024);
    for (let i = 0; i < 2000; i++) s.send(msg);
    srv.sock().write(frame(9, 'pp'));
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).length, { timeout: 2500 }).toBe(2001);
    const frames = clientFrames(Buffer.concat(srv.got));
    expect([frames.filter(([op, p]) => op === 1 && p.length === 6 * 1024).length, frames.filter(([op, p]) => op === 10 && p.toString() === 'pp').length]).toEqual([2000, 1]);
    expect(seen.events).toEqual(['open']);
  });

  it('16: WHEN the provider gets `WSS://127.0.0.1:<port>/x`, ` wss://127.0.0.1:<port>/x` (leading space) or `garbage` THEN it does not throw, and `error` then `close 1006` fire, with no `open` on the non-TLS test server', async () => {
    const srv = await raw('mute');
    const port = new URL(srv.url).port;
    const urls = [`WSS://127.0.0.1:${port}/x`, ` wss://127.0.0.1:${port}/x`, 'garbage'];
    const seen = urls.map((u) => { let s: SnoteSocket | undefined; expect(() => { s = snoteWebsocketProvider(u, 1000); }).not.toThrow(); return watch(s!); });
    await expect.poll(() => seen.map((x) => x.events), { timeout: 2500 }).toEqual([['error', 'close 1006'], ['error', 'close 1006'], ['error', 'close 1006']]);
  });

  it('18: WHEN the 101 says `Connection: keep-alive, Upgrade` (a token list, RFC 6455 4.1) THEN the socket opens', async () => {
    const { s, seen } = await opened('connection-list');
    expect([s.readyState, seen.events]).toEqual([s.OPEN, ['open']]);
  });

  it('19: WHEN this test file is read THEN it holds no fixed sleep: no timer call occurs in it, so every wait is on an observable condition', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src.split(['set', 'Timeout('].join('')).length - 1).toBe(0);
  });

  for (const [name, connection] of [['no Connection header', undefined], ['`Connection: keep-alive`', 'keep-alive']] as const) {
    it(`20: WHEN the upgrade event hands the socket a 101 with ${name} (Node's parser refuses that 101 itself today, test 5; this pins snote's own RFC 6455 4.1 check) THEN \`error\` then \`close 1006\` fire and it never opens`, async () => {
      const srv = await raw('mute');
      const s = snoteWebsocketProvider(srv.url, 1000);
      const seen = watch(s);
      await expect.poll(() => srv.heads.length, { timeout: 1000 }).toBe(1);
      const req = (s as unknown as { req: { getHeader(n: string): unknown; emit(e: string, ...a: unknown[]): boolean } }).req;
      const accept = createHash('sha1').update(String(req.getHeader('sec-websocket-key')) + GUID).digest('base64');
      const headers = { upgrade: 'websocket', 'sec-websocket-accept': accept, ...(connection === undefined ? {} : { connection }) };
      req.emit('upgrade', { statusCode: 101, headers }, new net.Socket(), Buffer.alloc(0));
      await expect.poll(() => seen.events, { timeout: 1000 }).toEqual(['error', 'close 1006']);
    });
  }

  /** A close frame body: the 2-byte code, then the reason. */
  const closeBody = (code: number, reason = ''): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    return Buffer.concat([b, Buffer.from(reason, 'utf8')]);
  };

  // RFC 6455 7.4.1 and 7.4.2 with the IANA registry: below 1000, the reserved 1004 to 1006 and 1015, the unassigned 1016 to 2999 and above 4999
  for (const code of [0, 999, 1004, 1005, 1006, 1015, 1016, 2999, 5000, 65535]) {
    it(`21: WHEN the open socket gets a close frame with code ${code} (a code no endpoint may send) THEN the TCP connection ends, \`close 1006\` fires with no \`error\` and no message, readyState is CLOSED and no close frame is echoed`, async () => {
      const { srv, s, seen } = await opened();
      srv.sock().write(frame(8, closeBody(code, 'bye')));
      await expect.poll(() => ({ live: srv.live.size, state: s.readyState }), { timeout: 2000 }).toEqual({ live: 0, state: s.CLOSED });
      expect([seen, clientFrames(Buffer.concat(srv.got))]).toEqual([{ events: ['open', 'close 1006'], messages: [] }, []]);
    });
  }

  for (const code of [1000, 1003, 1007, 1014, 3000, 4000, 4999, null]) {
    it(`22: WHEN the server sends a close frame with ${code === null ? 'no body' : `code ${code}`} THEN the client echoes it, ends the connection and \`close ${code ?? 1005}\` fires with no \`error\``, async () => {
      const { srv, seen } = await opened();
      srv.sock().write(frame(8, code === null ? Buffer.alloc(0) : closeBody(code, 'bye')));
      await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.length >= 2 ? p.readUInt16BE(0) : ''}`), { timeout: 1000 }).toEqual([`8:${code ?? ''}`]);
      srv.sock().end();
      await expect.poll(() => seen.events, { timeout: 1000 }).toEqual(['open', `close ${code ?? 1005}`]);
    });
  }

  it('23: WHEN bytes arrive after the server\'s close frame (a text message, a ping and a second close) THEN no message is delivered, no pong is sent, the one echo is `8:1000` and `close 1000` fires (RFC 6455 5.5.2)', async () => {
    const { srv, s, seen } = await opened();
    const feed = (b: Buffer): void => (s as unknown as { receive(d: Buffer): void }).receive(b);
    feed(frame(8, closeBody(1000)));
    feed(Buffer.concat([frame(1, 'late'), frame(9, 'pp'), frame(8, closeBody(4002))]));
    expect(seen.messages).toEqual([]);
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.readUInt16BE(0)}`), { timeout: 1000 }).toEqual(['8:1000']);
    srv.sock().end();
    await expect.poll(() => seen.events, { timeout: 1000 }).toEqual(['open', 'close 1000']);
    expect([seen.messages, clientFrames(Buffer.concat(srv.got)).length]).toEqual([[], 1]);
  });

  it('24: WHEN the client closes with code 1006, with code 5000, with code 3000 and a 140-byte reason, or with code 4000 and `bye` THEN the close frames carry 1000, 1000, 3000 with no reason, and 4000 `bye` (RFC 6455 7.4.2, 5.5)', async () => {
    const calls: [number, string | undefined][] = [[1006, undefined], [5000, undefined], [3000, 'é'.repeat(70)], [4000, 'bye']];
    const sent: string[] = [];
    for (const [code, reason] of calls) {
      const { srv, s } = await opened();
      s.close(code, reason);
      await expect.poll(() => clientFrames(Buffer.concat(srv.got)).length, { timeout: 1000 }).toBe(1);
      const [[op, p]] = clientFrames(Buffer.concat(srv.got));
      sent.push(`${op}:${p.readUInt16BE(0)}:${p.subarray(2).toString('latin1')}`);
    }
    expect(sent).toEqual(['8:1000:', '8:1000:', '8:3000:', '8:4000:bye']);
  });

  it('25: WHEN the server sends a close frame (1000) and then keeps the TCP connection open (no FIN) THEN the client echoes `8:1000`, and within the close grace (1000 ms here) its TCP connection is destroyed and `close 1000` fires with no `error` (RFC 6455 7.1.1, #625)', async () => {
    const { srv, s, seen } = await opened();
    srv.sock().allowHalfOpen = true; // the server does not answer the client's FIN with its own
    const t0 = Date.now();
    srv.sock().write(frame(8, closeBody(1000)));
    await expect.poll(() => clientFrames(Buffer.concat(srv.got)).map(([op, p]) => `${op}:${p.readUInt16BE(0)}`), { timeout: 1000 }).toEqual(['8:1000']);
    const tcp = (s as unknown as { sock: net.Socket }).sock;
    await expect.poll(() => ({ state: s.readyState, destroyed: tcp.destroyed, events: seen.events }), { timeout: 2000 }).toEqual({ state: s.CLOSED, destroyed: true, events: ['open', 'close 1000'] });
    expect(Date.now() - t0).toBeLessThan(1800);
  });

  it('11: WHEN 20 sockets are opened in a burst against a server that refuses every upgrade THEN all 20 fire `close`, the server has 0 open TCP connections and no snote socket counts as open', async () => {
    const srv = await raw('refuse');
    let closed = 0;
    for (let i = 0; i < 20; i++) snoteWebsocketProvider(srv.url, 1000).addEventListener('close', () => closed++);
    await expect.poll(() => ({ closed, live: srv.live.size, open: hasOpenSocket() }), { timeout: 2500 }).toEqual({ closed: 20, live: 0, open: false });
  });
});
