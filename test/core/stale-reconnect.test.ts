/**
 * #625: a long-running session must not stay stale. A connection that went silent, a status stuck at
 * stale while the socket is open, a resume from sleep (a wall-clock jump) and `r` on a stale connection
 * each end in a fresh connection without user action; an edit made while the link was dead reaches the
 * server exactly once; an ended client is left alone; the forced reconnect is rate bounded; and a forced
 * close ends only its own socket. The fake server runs on localhost; the reconnect delay, the heartbeat
 * and the stale bound are shortened on this test's own client, so product timing is unchanged. Tests 3, 7
 * and 8 drive the watch tick by tick on fake interval timers (test 8 also on a fake monotonic clock), so no
 * test sleeps a fixed time; every other wait is an expect.poll on the fake server or the store, and each
 * test's poll budgets add up to at most 2500 ms, under the 3 s test timeout.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { onProblem } from '../../src/core/problem-signal';
import { connectionWord } from '../../src/core/connection-word';
import { hasOpenSocket } from '../../src/core/websocket-provider';
import { forceSyncNow } from '../../src/tui/app-actions';
import { FakeSimperiumServer } from '../fake-simperium/server';

type SyncStore = ReturnType<typeof makeStore>;
type Client = { reconnectionTimer: { interval: (attempt: number) => number }; disconnect: () => unknown };
const EMAIL = 'test@example.com';
const RED = { type: 'CHANGE_CONNECTION_STATUS', status: 'red' } as never;
const QUIET = 'sync connection went quiet, reconnecting';
/**
 * #625: wait until `ready()` holds, at most `ms` of real time, checking every 10 ms. Tests 3 and 8 use it on
 * fake interval timers because expect.poll and vi.waitFor advance fake timers, which would run watch ticks.
 */
async function until(ready: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (!ready() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  return ready();
}

/** #625: count the forced closes, one D7 notice each (P4); `client.disconnect` also runs inside the client's own reconnect. */
function forcedCloses(): { count: () => number; off: () => void } {
  let n = 0;
  const off = onProblem((m) => void (m === QUIET && n++));
  return { count: () => n, off };
}

describe('#625 a stale or silent connection reconnects by itself', () => {
  let server: FakeSimperiumServer | undefined;
  let stores: SyncStore[] = [];
  let store: SyncStore | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    for (const s of stores) s.stopSync?.();
    vi.useRealTimers();
    stores = [];
    store = undefined;
    server?.stop();
    server = undefined;
  });

  async function connect(staleReconnectMs: number): Promise<SyncStore> {
    if (!server) {
      server = new FakeSimperiumServer();
      server.seedBucket('test-app', 'note', [{ id: 'n1', data: { content: 'one', tags: [], systemTags: [], deleted: false, creationDate: 1, modificationDate: 1 } }]);
      await server.start();
    }
    const clientOptions = { url: server.url, heartbeatInterval: 0.1, websocketClientProvider: (u: string) => snoteWebsocketProvider(u, 500) };
    const s = makeStore({
      sync: { appId: 'test-app', token: 'test-token', username: EMAIL, clientOptions: clientOptions as { url: string }, noteEditDelayMs: 10, staleReconnectMs },
    });
    stores.push(s);
    (s.client as Client).reconnectionTimer.interval = () => 20;
    await expect.poll(() => ({ n: s.getState().data.notes.has('n1' as never), connected: s.getState().simperium.connected }), { timeout: 500 }).toEqual({ n: true, connected: true });
    return s;
  }

  const live = () => ({ opened: server!.connectionsOpened, connected: store!.getState().simperium.connected });
  const n1 = () => server!.getObject('test-app', 'note', 'n1');
  const changesFor = (id: string) => server!.received.filter((m) => /^\d+:c:/.test(m) && m.includes(`"id":"${id}"`)).length;
  const pending = () => Object.keys(store!.getState().simperium.pendingNotes).length;

  it('1: WHEN the server stops reading the connection (no heartbeat reply, no answer to the close) THEN within 1500 ms the store has opened connection `2` and is `connected` again', async () => {
    store = await connect(60000);
    server!.freezeClient(EMAIL);
    await expect.poll(live, { timeout: 1500 }).toEqual({ opened: 2, connected: true });
  });

  it('2: WHEN the status is red while the socket stays open and keeps answering heartbeats THEN after the 300 ms stale bound the store has opened connection `2`, is `connected`, and the notices are exactly [`sync connection went quiet, reconnecting`]', async () => {
    store = await connect(300);
    const notices: string[] = [];
    const off = onProblem((m) => notices.push(m));
    store.dispatch(RED);
    await expect.poll(() => ({ ...live(), notices }), { timeout: 1500 }).toEqual({ opened: 2, connected: true, notices: ['sync connection went quiet, reconnecting'] });
    off();
  });

  it('3: WHEN Date.now runs one hour ahead of the monotonic clock and stays there (stale bound 400 ms, so one watch tick per 100 ms, driven by fake interval timers; status green) THEN the next tick makes exactly `1` forced close (one notice), within 1000 ms the store has opened connection `2` and is `connected`, and 6 ticks later the forced closes are still `1` and it has still opened `2`', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    store = await connect(400);
    const closes = forcedCloses();
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 3600000);
    vi.advanceTimersByTime(100);
    expect(closes.count()).toBe(1);
    const back = await until(() => live().opened === 2 && live().connected, 1000);
    vi.advanceTimersByTime(600);
    expect({ back, closes: closes.count(), ...live() }).toEqual({ back: true, closes: 1, opened: 2, connected: true });
    closes.off();
  });

  it('4: WHEN the status is red on an open socket and `forceSyncNow` runs (the `r` key), with the stale bound at 60000 ms THEN within 1000 ms the store has opened connection `2` and is `connected`', async () => {
    store = await connect(60000);
    store.dispatch(RED);
    forceSyncNow({ store, timerRef: { current: null }, setSyncedAt: () => undefined });
    await expect.poll(live, { timeout: 1000 }).toEqual({ opened: 2, connected: true });
  });

  it('5: WHEN the server stops answering, applies the edit of note n1 to `one edited`, and then stops reading THEN after the reconnect the server holds `one edited` at version `2`, it received exactly `1` change for n1, and the store has no pending note', async () => {
    store = await connect(60000);
    server!.muteClient(EMAIL);
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: 'one edited' } } as never);
    await expect.poll(() => n1()?.version, { timeout: 500 }).toBe(2);
    server!.freezeClient(EMAIL);
    await expect
      .poll(() => ({ ...live(), content: n1()?.data.content, version: n1()?.version, changes: changesFor('n1'), pending: pending() }), { timeout: 1500 })
      .toEqual({ opened: 2, connected: true, content: 'one edited', version: 2, changes: 1, pending: 0 });
  });

  it('6: WHEN the server stops reading and THEN note n1 is edited to `one frozen` THEN after the reconnect the server holds `one frozen` at version `2`, it received exactly `1` change for n1, the local note is `one frozen` and the store has no pending note', async () => {
    store = await connect(60000);
    server!.freezeClient(EMAIL);
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: 'one frozen' } } as never);
    await expect
      .poll(() => ({ ...live(), content: n1()?.data.content, version: n1()?.version, changes: changesFor('n1'), local: store!.getState().data.notes.get('n1' as never)?.content, pending: pending() }), { timeout: 1500 })
      .toEqual({ opened: 2, connected: true, content: 'one frozen', version: 2, changes: 1, local: 'one frozen', pending: 0 });
  });

  it('7: WHEN a store is stopped while a second store stays connected, its status is red and Date.now jumps one hour THEN over 8 ticks of its watch (600 ms of fake interval timers at a 300 ms stale bound) its client gets `0` disconnect calls and its reconnect hook returns `false`', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const ended = await connect(300);
    store = await connect(60000);
    ended.stopSync?.();
    const disconnect = vi.spyOn(ended.client as Client, 'disconnect');
    ended.dispatch(RED);
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 3600000);
    vi.advanceTimersByTime(600);
    expect({ calls: disconnect.mock.calls.length, hook: ended.reconnectIfStale?.() }).toEqual({ calls: 0, hook: false });
  });

  it('8: WHEN the status is set red again after every connect, with the stale bound at 300 ms and the watch driven one 75 ms tick at a time on fake interval timers and a fake monotonic clock THEN each of `3` forced closes comes on tick `5` of an unbroken stale run (300 ms after its first stale tick, never sooner), and after the third the store has opened connection `4`', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    store = await connect(300);
    const s = store;
    const closes = forcedCloses();
    const unsubscribe = s.subscribe(() => {
      if (s.getState().simperium.connected) s.dispatch(RED);
    });
    s.dispatch(RED);
    const word = () => connectionWord(s.getState().simperium, hasOpenSocket());
    const ticksPerClose: number[] = [];
    for (let close = 1; close <= 3; close++) {
      let ticks = 0;
      while (closes.count() < close && ticks < 10) {
        vi.advanceTimersByTime(75);
        ticks++;
      }
      ticksPerClose.push(ticks);
      if (closes.count() < close || !(await until(() => server!.connectionsOpened === close + 1 && word() === 'stale', 500))) break;
    }
    unsubscribe();
    closes.off();
    expect({ ticksPerClose, opened: server!.connectionsOpened }).toEqual({ ticksPerClose: [5, 5, 5], opened: 4 });
  });

  it('9: WHEN two provider sockets are open, the server stops reading both and the first is closed THEN within 1200 ms the first is CLOSED and the second is still OPEN', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    const a = snoteWebsocketProvider(server.url, 500);
    const b = snoteWebsocketProvider(server.url, 500);
    await expect.poll(() => [a.readyState, b.readyState], { timeout: 500 }).toEqual([a.OPEN, b.OPEN]);
    for (const tcp of server.openSockets) tcp.pause();
    a.close();
    await expect.poll(() => [a.readyState, b.readyState], { timeout: 1200 }).toEqual([a.CLOSED, b.OPEN]);
    for (const tcp of server.openSockets) tcp.destroy();
    await expect.poll(() => b.readyState, { timeout: 500 }).toBe(b.CLOSED);
  });
});
