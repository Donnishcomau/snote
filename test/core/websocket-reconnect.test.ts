/**
 * #85 follow-up: every reconnect handshake carries `User-Agent: snote/<version>`,
 * not only the first one. The reconnect delay is shortened on this test's own
 * client instance (`reconnectionTimer.interval`), so product timing is unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { FakeSimperiumServer } from '../fake-simperium/server';
import pkg from '../../package.json';

type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void; client?: unknown };
type Timer = { reconnectionTimer: { interval: (attempt: number) => number } };

describe('#85 every reconnect handshake sends a User-Agent', () => {
  let server: FakeSimperiumServer | undefined;
  let store: SyncStore | undefined;

  afterEach(() => {
    store?.stopSync?.();
    store = undefined;
    server?.stop();
    server = undefined;
  });

  function syncStore(url: string): SyncStore {
    const s = makeStore({
      sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url }, noteEditDelayMs: 10 },
    }) as SyncStore;
    (s.client as Timer).reconnectionTimer.interval = () => 20;
    return s;
  }

  it('1: WHEN the fake server drops the store connection twice and the store reconnects each time THEN the server recorded `3` handshakes and every `user-agent` equals `snote/` followed by the package.json version', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    store = syncStore(url);
    const ua = `snote/${pkg.version}`;
    for (let drop = 1; drop <= 2; drop++) {
      await expect.poll(() => ({ n: server!.handshakeHeaders.length, connected: store!.getState().simperium.connected }), { timeout: 900 }).toEqual({ n: drop, connected: true });
      server.dropClient('test@example.com');
    }
    await expect
      .poll(() => ({ uas: server!.handshakeHeaders.map((h) => h['user-agent']), connected: store!.getState().simperium.connected }), { timeout: 900 })
      .toEqual({ uas: [ua, ua, ua], connected: true });
  });

  it('2: WHEN the fake server refuses handshakes without a User-Agent and drops the store connection once THEN the store is `connected` again with `2` handshakes and `handshakesRefused` 0', async () => {
    server = new FakeSimperiumServer();
    server.refuseHandshakesWithoutUserAgent = true;
    const { url } = await server.start();
    store = syncStore(url);
    await expect.poll(() => store!.getState().simperium.connected, { timeout: 900 }).toBe(true);
    server.dropClient('test@example.com');
    await expect
      .poll(() => ({ n: server!.handshakeHeaders.length, refused: server!.handshakesRefused, connected: store!.getState().simperium.connected }), { timeout: 1500 })
      .toEqual({ n: 2, refused: 0, connected: true });
  });
});
