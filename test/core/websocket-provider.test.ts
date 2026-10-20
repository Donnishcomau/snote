/**
 * #85 — the sync socket's handshake carries `User-Agent: snote/<version>`,
 * so a server that refuses handshakes without one still lets snote connect,
 * and a refused handshake leaves no TCP connection open.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { FakeSimperiumServer } from '../fake-simperium/server';
import pkg from '../../package.json';
import { readFileSync } from 'node:fs';

type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void };

describe('#85 sync handshake sends a User-Agent', () => {
  let server: FakeSimperiumServer | undefined;
  let store: SyncStore | undefined;

  afterEach(() => {
    store?.stopSync?.();
    store = undefined;
    server?.stop();
    server = undefined;
  });

  function syncStore(url: string): SyncStore {
    return makeStore({
      sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url }, noteEditDelayMs: 10 },
    }) as SyncStore;
  }

  it('1: WHEN a store syncs against the fake server THEN the first handshake has the header `user-agent` equal to `snote/` followed by the package.json version', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    store = syncStore(url);
    await expect.poll(() => server!.handshakeHeaders[0]?.['user-agent'], { timeout: 2500 }).toBe(`snote/${pkg.version}`);
  });

  it('2: WHEN the fake server refuses every handshake without a User-Agent THEN the store reaches `connected` true and `handshakesRefused` is 0', async () => {
    server = new FakeSimperiumServer();
    server.refuseHandshakesWithoutUserAgent = true;
    const { url } = await server.start();
    store = syncStore(url);
    await expect
      .poll(() => ({ connected: store!.getState().simperium.connected, refused: server!.handshakesRefused }), { timeout: 2500 })
      .toEqual({ connected: true, refused: 0 });
  });

  it('3: WHEN snoteWebsocketProvider opens 3 sockets in turn against a server that refuses every handshake THEN each socket closes and the server has `0` open TCP connections', async () => {
    server = new FakeSimperiumServer();
    server.refuseAllHandshakes = true;
    const { url } = await server.start();
    for (let i = 0; i < 3; i++) {
      const socket = snoteWebsocketProvider(url);
      await new Promise<void>((resolve) => { socket.onclose = () => resolve(); });
    }
    await expect
      .poll(() => ({ refused: server!.handshakesRefused, open: server!.openSockets.size }), { timeout: 2000 })
      .toEqual({ refused: 3, open: 0 });
  });

  it('4: WHEN src/core/websocket-provider.ts is read THEN it contains `User-Agent` and none of `rejectUnauthorized`, `NODE_TLS_REJECT_UNAUTHORIZED`, `checkServerIdentity`, `token` or `username`', () => {
    const source = readFileSync('src/core/websocket-provider.ts', 'utf8');
    const banned = ['rejectUnauthorized', 'NODE_TLS_REJECT_UNAUTHORIZED', 'checkServerIdentity', 'token', 'username'];
    expect({ hasHeader: source.includes('User-Agent'), banned: banned.filter((word) => source.includes(word)) }).toEqual({ hasHeader: true, banned: [] });
  });
});
