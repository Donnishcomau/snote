/**
 * T320 — snote stays stuck without syncing when Simplenote ignores its login.
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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';

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

afterEach(async () => {
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

describe('T320 — auth watchdog: a login the server ignores gets reconnected', () => {
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

  it("2: WHEN the server answers every init and A starts with `authWatchdogMs` `300` THEN after A has `n1` and 800 ms more, the server's `connectionsOpened` is exactly `1`", async () => {
    const server = await startServer();
    const { store } = openA(server);
    await waitFor(
      () => store.getState().data.notes.has('n1' as never),
      2500,
      'initial index of n1'
    );
    // Every init was answered within milliseconds; the watchdog must stay
    // silent — no reconnect — over more than twice its window.
    await new Promise((r) => setTimeout(r, 800));
    expect(server.connectionsOpened).toBe(1);
  });

  it("3: WHEN `ignoreInitConnections` is `1`, A starts with `authWatchdogMs` `300`, and A's `store.stopSync()` is called 100 ms after start THEN 800 ms later the server's `connectionsOpened` is still `1`", async () => {
    const server = await startServer();
    server.ignoreInitConnections = 1;
    const { store } = openA(server);
    await new Promise((r) => setTimeout(r, 100));
    store.stopSync?.();
    await new Promise((r) => setTimeout(r, 800));
    // stopSync ended the client at 100 ms, before the 300 ms window ever
    // fired: an ended client is never disconnected or resurrected.
    expect(server.connectionsOpened).toBe(1);
  });
});
