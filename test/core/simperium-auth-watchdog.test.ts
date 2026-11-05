/**
 * snote stays stuck without syncing when Simplenote ignores its login.
 *
 * Live finding 2026-09-26: about 1 start in 3, snote opens the socket and
 * sends its four `N:init:` messages and the server never answers them — no
 * `N:auth:` reply for over 5 minutes while heartbeats keep being answered —
 * so notes changed elsewhere never arrive until snote is restarted.
 * `installSimperiumAuthWatchdog` (wired in `src/core/store.ts` through
 * `SyncConfig.authWatchdogMs`, which `buildStore` passes through) closes
 * such a connection once so the client's own reconnection machinery retries.
 *
 * Fixture: FakeSimperiumServer with `ignoreInitConnections` (the first N
 * connections get no reply at all to inits, heartbeats still answered) and
 * `connectionsOpened` (every new websocket counted). One client A per
 * scenario through the real `buildStore` path with `authWatchdogMs: 300`.
 * On the reconnect the channel answers its `cv:` request with the full
 * index, so the note seeded before start reaches A right after auth.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { installSimperiumAuthWatchdog } from '../../src/core/simperium-auth-watchdog';

vi.setConfig({ testTimeout: 10000 });

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';

function noteData(content: string): Record<string, unknown> {
  const now = Date.now();
  return {
    content,
    creationDate: now,
    deleted: 0,
    modificationDate: now,
    systemTags: [],
    tags: [],
  };
}

/** Poll every 25 ms up to `timeoutMs`; every asserted value lives inside `cond`. */
async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const opens: Array<{ store: ReturnType<typeof buildStore>['store']; stopSaving: () => void }> = [];

// #550: tests 2 and 3 drive the watchdog on fake timers through a stand-in client, so host load cannot move its window.
const WINDOW = 300;
class FakeClient extends EventEmitter {
  reconnect: boolean | undefined = true;
  disconnect = vi.fn();
}
function connectWithInits(c: FakeClient, answered: number): void {
  c.emit('connect');
  for (let i = 0; i < 4; i++) c.emit('send', `${i}:init:{}`);
  for (let i = 0; i < answered; i++) c.emit('message', `${i}:auth:${EMAIL}`);
}

afterEach(async () => {
  vi.useRealTimers();
  for (const b of opens.splice(0)) {
    b.store.stopSync?.();
    b.stopSaving();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [{ id: 'n1', data: noteData(BASE), version: 1 }]);
  return server;
}

function openA(
  server: FakeSimperiumServer,
  opts?: { authWatchdogMs?: number }
): ReturnType<typeof buildStore> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t320-'));
  dirs.push(dir);
  const built = buildStore(
    {
      dataDir: dir,
      appId: APP_ID,
      server: server.url,
      noteEditDelayMs: 10,
      authWatchdogMs: opts?.authWatchdogMs ?? 300,
    },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
  opens.push(built);
  return built;
}

describe('auth watchdog: a login the server ignores gets reconnected', () => {
  it("1: WHEN the fake server holds note `n1`, `ignoreInitConnections` is `1`, and client A starts through `buildStore` with `authWatchdogMs` `300` THEN within 8000 ms A's `data.notes` has `n1` and the server's `connectionsOpened` is at least `2`", async () => {
    const server = await startServer();
    server.ignoreInitConnections = 1;
    const built = openA(server);
    const { store } = built;
    await waitFor(
      () => store.getState().data.notes.has('n1' as never) && server.connectionsOpened >= 2,
      8000,
      `n1 in data.notes and connectionsOpened >= 2 (got has=${store
        .getState()
        .data.notes.has('n1' as never)}, opened=${server.connectionsOpened})`
    );
    expect(store.getState().data.notes.has('n1' as never)).toBe(true);
    expect(server.connectionsOpened).toBeGreaterThanOrEqual(2);
  }, 15000);

  it("2: WHEN a client sends 4 inits on `connect` and all 4 get an `auth:` reply, then twice the 300 ms window passes on fake timers THEN `disconnect` is called `0` times, and with only 3 of the 4 answered it is called `1` time", () => {
    vi.useFakeTimers();
    for (const [answered, drops] of [[4, 0], [3, 1]] as const) {
      const c = new FakeClient();
      installSimperiumAuthWatchdog(c, WINDOW);
      connectWithInits(c, answered);
      vi.advanceTimersByTime(2 * WINDOW);
      expect([answered, c.disconnect.mock.calls.length]).toEqual([answered, drops]);
    }
  });

  it("3: WHEN `ignoreInitConnections` is `1`, A starts with `authWatchdogMs` `300`, the server receives A's first init and A's `store.stopSync()` is called THEN A's client has `reconnect` `false`, and a client with `reconnect` `false` whose 4 inits get no reply is disconnected `0` times when twice the window passes on fake timers", async () => {
    const server = await startServer();
    server.ignoreInitConnections = 1;
    const { store } = openA(server);
    await waitFor(() => server.received.some((m) => /^\d+:init:/.test(m)), 2000, "the server received A's first init");
    store.stopSync?.();
    const client = (store as unknown as { client?: { reconnect?: boolean } }).client;
    await waitFor(() => client?.reconnect === false, 2000, `A's client ended (reconnect ${String(client?.reconnect)})`);
    vi.useFakeTimers();
    const c = new FakeClient();
    installSimperiumAuthWatchdog(c, WINDOW);
    connectWithInits(c, 0);
    c.reconnect = false;
    vi.advanceTimersByTime(2 * WINDOW);
    expect(c.disconnect).toHaveBeenCalledTimes(0);
  });

  it("4: WHEN the fake server answers every init and client A starts through `buildStore` with `authWatchdogMs` `317` THEN A's real client sends as many `N:init:` messages as it receives `N:auth:` replies, more than `0`, and once the watchdog's 317 ms window has fired, `disconnect` was called `0` times and the server's `connectionsOpened` is `1`", async () => {
    // #550: the end-to-end half of test 2, on the real store.client. The watchdog drops a login only when auths < inits.
    // Its own window timer (the only 317 ms timer) is marked when its callback has run, so the asserts are read after
    // the window, on that event, with no fixed wait; real timers stay for the socket.
    const WD = 317;
    let windowFired = 0;
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) =>
      realSetTimeout(
        ms === WD
          ? () => {
              fn(...a);
              windowFired++;
            }
          : fn,
        ms,
        ...a
      )) as typeof setTimeout;
    try {
      const server = await startServer();
      const { store } = openA(server, { authWatchdogMs: WD });
      const client = (store as unknown as { client: EventEmitter & { disconnect: () => unknown } }).client;
      let drops = 0;
      const realDisconnect = client.disconnect.bind(client);
      client.disconnect = () => {
        drops++;
        return realDisconnect();
      };
      let inits = 0;
      let auths = 0;
      client.on('send', (m: unknown) => {
        if (typeof m === 'string' && /^\d+:init:/.test(m)) inits++;
      });
      client.on('message', (m: unknown) => {
        if (typeof m === 'string' && /^\d+:auth:/.test(m)) auths++;
      });
      await waitFor(
        () => inits > 0 && auths === inits && windowFired >= 1,
        2000,
        "as many auth replies as inits, more than 0, and the watchdog's window has fired"
      );
      expect([inits > 0, auths === inits, drops, server.connectionsOpened]).toEqual([true, true, 0, 1]);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });
});
