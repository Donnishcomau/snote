import { describe, it, expect, afterEach } from 'vitest';
import { makeStore } from '../../src/core/store';
import { onProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { FakeSimperiumServer } from '../fake-simperium/server';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void; client?: unknown };
const NOTICE = (n: number): string => `sync server not answering, retrying (attempt ${n})`;

describe('#79 an unanswered upgrade is announced from the second attempt', () => {
  let server: FakeSimperiumServer | undefined; let store: SyncStore | undefined; let off: (() => void) | undefined;
  afterEach(() => { off?.(); store?.stopSync?.(); store = undefined; server?.stop(); server = undefined; resetProblemSignal(); });
  function start(url: string, ms: number): SyncStore {
    const s = makeStore({ sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', noteEditDelayMs: 10,
      clientOptions: { url, websocketClientProvider: (u: string) => snoteWebsocketProvider(u, ms) } as never } }) as SyncStore;
    (s.client as { reconnectionTimer: { interval: (a: number) => number } }).reconnectionTimer.interval = () => 20;
    return s;
  }
  it('1: WHEN two upgrades in a row go unanswered THEN the first published problem is `sync server not answering, retrying (attempt 2)` and none names attempt 1', async () => {
    const seen: string[] = []; off = onProblem((m) => seen.push(m));
    server = new FakeSimperiumServer(); server.silentUpgrades = 2; await server.start();
    store = start(server.url, 100);
    await expect.poll(() => ({ first: seen[0], one: seen.includes(NOTICE(1)), connected: store!.getState().simperium.connected }), { timeout: 2500 })
      .toEqual({ first: NOTICE(2), one: false, connected: true });
  });
  it('2: WHEN only the first upgrade goes unanswered THEN the store connects and nothing is published', async () => {
    const seen: string[] = []; off = onProblem((m) => seen.push(m));
    server = new FakeSimperiumServer(); server.silentUpgrades = 1; await server.start();
    store = start(server.url, 100);
    await expect.poll(() => ({ n: server!.handshakeHeaders.length, connected: store!.getState().simperium.connected, seen: seen.length }), { timeout: 2500 })
      .toEqual({ n: 2, connected: true, seen: 0 });
  });
  it('3: WHEN two unanswered upgrades are followed by an open and then one more unanswered upgrade THEN only `1` notice was published (an open resets the count)', async () => {
    const seen: string[] = []; off = onProblem((m) => seen.push(m));
    server = new FakeSimperiumServer(); server.silentUpgrades = 2; await server.start();
    store = start(server.url, 100);
    await expect.poll(() => store!.getState().simperium.connected, { timeout: 2500 }).toBe(true);
    server.silentUpgrades = 1; server.dropClient('test@example.com');
    await expect.poll(() => ({ n: server!.handshakeHeaders.length, connected: store!.getState().simperium.connected, seen }), { timeout: 2500 })
      .toEqual({ n: 5, connected: true, seen: [NOTICE(2)] });
  });
  it('4: WHEN the server answers an upgrade with a refusal whose status line, headers and body hold `\x1b]52;c;ZXZpbA==\x07` and `\x1b[31m`, then leaves the next two upgrades unanswered THEN the only published problem is `sync server not answering, retrying (attempt 2)` and no published byte is 0x1b or 0x07', async () => {
    const seen: string[] = []; off = onProblem((m) => seen.push(m));
    const HOSTILE = '\x1b]52;c;ZXZpbA==\x07\x1b[31m';
    let k = 0; const held: import('node:stream').Duplex[] = [];
    const raw = http.createServer();
    raw.on('upgrade', (_req, sock) => {
      held.push(sock);
      if (++k === 1) sock.write(`HTTP/1.1 403 ${HOSTILE}\r\nX-Evil: ${HOSTILE}\r\nContent-Length: ${HOSTILE.length}\r\n\r\n${HOSTILE}`);
    });
    await new Promise<void>((r) => raw.listen(0, '127.0.0.1', () => r()));
    const url = `ws://127.0.0.1:${(raw.address() as AddressInfo).port}/`;
    try {
      for (let i = 0; i < 3; i++) {
        const sock = snoteWebsocketProvider(url, 100);
        await new Promise<void>((r) => sock.addEventListener('close', () => r()));
      }
      await expect.poll(() => ({ seen, clean: seen.every((m) => !/[\x1b\x07]/.test(m)) }), { timeout: 2500 })
        .toEqual({ seen: [NOTICE(2)], clean: true });
    } finally { for (const s of held) s.destroy(); await new Promise<void>((r) => raw.close(() => r())); }
  });
});
