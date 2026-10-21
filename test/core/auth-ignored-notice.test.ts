/**
 * Issue #79 (G2): a sign-in the server keeps ignoring gets a voice. The auth
 * watchdog (`installSimperiumAuthWatchdog`) drops an ignored login silently
 * the first time; from the second consecutive ignored login it publishes
 * `sync server ignored sign-in, retrying (attempt N)` on the problem channel
 * (the notice line). An `auth:` reply resets the count; an ended client
 * publishes nothing. Tests 1 to 4 drive the watchdog with a fake client and
 * fake timers; test 5 runs the real `buildStore` path against the fake server.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { onProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { installSimperiumAuthWatchdog } from '../../src/core/simperium-auth-watchdog';

const WINDOW = 300;
const IGNORED = (n: number): string => `sync server ignored sign-in, retrying (attempt ${n})`;

class FakeClient extends EventEmitter {
  reconnect: boolean | undefined = true;
  disconnect = vi.fn();
}

/** One connection: 'connect', one init sent, optionally answered, then the window passes. */
function connection(client: FakeClient, answered: boolean): void {
  client.emit('connect');
  client.emit('send', '0:init:{}');
  if (answered) client.emit('message', '0:auth:user@example.com');
  vi.advanceTimersByTime(WINDOW + 50);
}

function watched(): { client: FakeClient; problems: string[] } {
  const problems: string[] = [];
  onProblem((m) => problems.push(m));
  const client = new FakeClient();
  installSimperiumAuthWatchdog(client, WINDOW);
  return { client, problems };
}

afterEach(() => {
  vi.useRealTimers();
  resetProblemSignal();
});

describe('issue #79 an ignored sign-in is announced from the second drop', () => {
  it('1: WHEN two connections in a row send their init and get no `auth:` reply and the watchdog drops both THEN exactly one problem is published, `sync server ignored sign-in, retrying (attempt 2)`, and `disconnect` was called `2` times', () => {
    vi.useFakeTimers();
    const { client, problems } = watched();
    connection(client, false);
    connection(client, false);
    expect(problems).toEqual([IGNORED(2)]);
    expect(client.disconnect).toHaveBeenCalledTimes(2);
  });

  it('2: WHEN only the first connection is ignored and the watchdog drops it THEN no problem is published and `disconnect` was called `1` time', () => {
    vi.useFakeTimers();
    const { client, problems } = watched();
    connection(client, false);
    expect(problems).toEqual([]);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('3: WHEN a drop is followed by a connection that gets its `auth:` reply and then by one more ignored connection THEN no problem is published, and the next ignored one publishes `sync server ignored sign-in, retrying (attempt 2)`', () => {
    vi.useFakeTimers();
    const { client, problems } = watched();
    connection(client, false);
    connection(client, true);
    connection(client, false);
    expect(problems).toEqual([]);
    connection(client, false);
    expect(problems).toEqual([IGNORED(2)]);
    expect(client.disconnect).toHaveBeenCalledTimes(3);
  });

  it('4: WHEN the client has been ended (`reconnect` is `false`) and its connections are ignored THEN no problem is published and `disconnect` is called `0` times', () => {
    vi.useFakeTimers();
    const { client, problems } = watched();
    client.reconnect = false;
    connection(client, false);
    connection(client, false);
    expect(problems).toEqual([]);
    expect(client.disconnect).toHaveBeenCalledTimes(0);
  });
});

describe('issue #79 the notice reaches the screen channel through the real store', () => {
  const servers: FakeSimperiumServer[] = [];
  const dirs: string[] = [];
  const opens: Array<ReturnType<typeof buildStore>> = [];

  afterEach(() => {
    for (const b of opens.splice(0)) {
      b.store.stopSync?.();
      b.stopSaving();
    }
    for (const s of servers.splice(0)) s.stop();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("5: WHEN the fake server ignores the inits of the first `2` connections and client A starts through `buildStore` with `authWatchdogMs` `300` THEN within 20000 ms A has `n1` and the only problem published is `sync server ignored sign-in, retrying (attempt 2)`", async () => {
    const problems: string[] = [];
    onProblem((m) => problems.push(m));
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data: { content: 'line1', creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [] }, version: 1 },
    ]);
    server.ignoreInitConnections = 2;
    const dir = mkdtempSync(join(tmpdir(), 'snote-79-'));
    dirs.push(dir);
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10, authWatchdogMs: WINDOW },
      { email: 'store1@example.com', token: 'store1-token' },
      () => {}
    );
    opens.push(built);
    const start = Date.now();
    // every asserted value is inside the poll condition
    while (!(built.store.getState().data.notes.has('n1' as never) && problems.length === 1 && problems[0] === IGNORED(2))) {
      if (Date.now() - start > 20000) throw new Error(`timed out; problems=${JSON.stringify(problems)} opened=${server.connectionsOpened}`);
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(built.store.getState().data.notes.has('n1' as never)).toBe(true);
    expect(problems).toEqual([IGNORED(2)]);
  }, 25000);
});
