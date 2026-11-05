/**
 * #657b: after a restart with an offline edit held for the start-up hand-off, the hand-off
 * of a note the other device changed runs when the catch-up's change for it arrives, before the
 * sync library moves its ghost: state.json holds the merge first, and the server copy never reaches
 * the store. No file but state.json carries the offline edit, so nothing can go stale across starts.
 * The "process exit" is a copy of the data folder taken at that moment (a store left running would
 * rescue the data in-process); the lock is left out, as a dead process's lock is reclaimed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { sendBeforeQuit } from '../../src/core/quit-send';
import { settleDraftWrites } from '../../src/core/editor-write-watch';
import { makeStore } from '../../src/core/store';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { markHandedOff } from '../../src/core/held-unsynced';
import { makeNote } from '../tui/fixtures';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const OFF = 'line1\nline2\nOFF';
const OTHER = 'line0\nline1\nline2';
const BOTH = 'line0\nline1\nline2\nOFF';
const OFFLINE_URL = 'ws://127.0.0.1:9';

type Built = ReturnType<typeof buildStore>;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(() => {
  for (const b of open.splice(0)) stop(b);
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-f356b-'));
  dirs.push(d);
  return d;
}

function openAt(dataDir: string, url: string): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}

function stop(b: Built): void {
  const i = open.indexOf(b);
  if (i >= 0) open.splice(i, 1);
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
}

const localContent = (b: Built): string =>
  String((b.store.getState().data.notes.get('n1' as never) as { content?: string } | undefined)?.content ?? '');
const serverContent = (s: FakeSimperiumServer): string => String(s.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const read = (dir: string, name: string): string => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
};
const stateContent = (dir: string): string => {
  try {
    const s = JSON.parse(read(dir, 'state.json')) as { data: { notes: { __map?: Array<[string, { content?: string }]> } } };
    return String(new Map(s.data.notes.__map ?? []).get('n1')?.content ?? '');
  } catch {
    return '';
  }
};
const copyDir = (from: string, to: string): void => cpSync(from, to, { recursive: true, filter: (f) => !f.includes('instance.lock') });

/** Synced at BASE, then an offline edit (OFF) saved, then another device's change (OTHER) on the server. */
async function offlineEditThenOtherDevice(otherAhead: boolean): Promise<{ server: FakeSimperiumServer; dir: string }> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 },
  ]);
  const dir = tmp();
  const a = openAt(dir, server.url);
  await waitFor(() => localContent(a) === BASE && stateContent(dir) === BASE && read(dir, 'ghosts-note.json').includes('n1'), 10000, () => `first sync, state ${stateContent(dir)}`);
  stop(a);
  const b = openAt(dir, OFFLINE_URL);
  b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF } } as never);
  await waitFor(() => stateContent(dir) === OFF && read(dir, 'unsynced.json').includes('n1'), 10000, () => `offline save, state ${stateContent(dir)}`);
  stop(b);
  const cur = server.getObject(APP_ID, 'note', 'n1')!.data;
  server.serverChange('note', 'n1', { ...cur, content: OTHER, modificationDate: otherAhead ? Date.now() / 1000 + 60 : 2500 });
  return { server, dir };
}

/**
 * Restart online and stop at a moment of the hand-off: `merge` = the store change that shows the
 * hand-off's merge (before the ghost moves); `ghost` = the first moment the ghost file on disk holds
 * the server copy. `kill` copies the folder at once; `quit` runs main's quit chain, then copies.
 */
async function restartAndStop(dir: string, url: string, at: 'merge' | 'ghost', how: 'kill' | 'quit', seen: string[] = []): Promise<string> {
  const dead = tmp();
  const c = openAt(dir, url);
  let stopped = false;
  const quit = async (): Promise<void> => {
    settleDraftWrites();
    await sendBeforeQuit(c.store as never);
    settleDraftWrites();
    stop(c);
    copyDir(dir, dead);
    stopped = true;
  };
  const halt = (): void => {
    if (how === 'kill') {
      copyDir(dir, dead);
      stop(c);
      stopped = true;
    } else void quit();
  };
  let fired = false;
  const unsubscribe = c.store.subscribe(() => {
    seen.push(localContent(c));
    if (fired || at !== 'merge' || localContent(c) !== BOTH) return;
    fired = true;
    halt();
  });
  if (at === 'ghost') {
    await waitFor(() => read(dir, 'ghosts-note.json').includes('line0'), 10000, () => `the ghost file holding the server copy, store ${localContent(c)}`);
    fired = true;
    halt();
  }
  await waitFor(() => stopped, 10000, () => `the stop at ${at}, store ${JSON.stringify(localContent(c))}`);
  unsubscribe();
  return dead;
}

async function restartHoldsBoth(dead: string, server: FakeSimperiumServer): Promise<void> {
  const d = openAt(dead, server.url);
  await waitFor(() => localContent(d) === BOTH && serverContent(server) === BOTH, 10000, () => `both lines, store ${JSON.stringify(localContent(d))}, server ${JSON.stringify(serverContent(server))}`);
  expect(localContent(d)).toBe(BOTH);
  expect(serverContent(server)).toBe(BOTH);
}

describe('#657b the start-up hand-off is on disk before the ghost moves', () => {
  for (const [n, otherAhead] of [[1, true], [2, false]] as const) {
    it(`${n}: WHEN the other device's change is dated ${otherAhead ? 'after' : 'before'} the offline edit and snote is killed once the ghost file holds the server copy, then restarts THEN the store and the server hold exactly \`${JSON.stringify(BOTH)}\``, async () => {
      const { server, dir } = await offlineEditThenOtherDevice(otherAhead);
      const dead = await restartAndStop(dir, server.url, 'ghost', 'kill');
      expect(stateContent(dead)).toBe(BOTH);
      await restartHoldsBoth(dead, server);
    }, 20000);
  }

  for (const [n, otherAhead] of [[3, true], [4, false]] as const) {
    it(`${n}: WHEN the other device's change is dated ${otherAhead ? 'after' : 'before'} the offline edit and snote is killed at the store change showing the hand-off's merge (before the ghost moves), then restarts THEN the store and the server hold exactly \`${JSON.stringify(BOTH)}\``, async () => {
      const { server, dir } = await offlineEditThenOtherDevice(otherAhead);
      const dead = await restartAndStop(dir, server.url, 'merge', 'kill');
      expect(stateContent(dead)).toBe(BOTH);
      await restartHoldsBoth(dead, server);
    }, 20000);
  }

  for (const [n, otherAhead] of [['5a', true], ['5b', false]] as const) {
    it(`${n}: WHEN the other device's change is dated ${otherAhead ? 'after' : 'before'} the offline edit and snote quits (the quit step) once the ghost file holds the server copy THEN the state.json it leaves holds exactly \`${JSON.stringify(BOTH)}\` and after a restart the server holds the same`, async () => {
      const { server, dir } = await offlineEditThenOtherDevice(otherAhead);
      const dead = await restartAndStop(dir, server.url, 'ghost', 'quit');
      expect(stateContent(dead)).toBe(BOTH);
      await restartHoldsBoth(dead, server);
    }, 20000);
  }

  it(`6: WHEN the restart runs with no stop THEN n1 in the store is never \`${JSON.stringify(OTHER)}\`, the server ends at exactly \`${JSON.stringify(BOTH)}\`, and the data folder holds no held-bases.json`, async () => {
    const { server, dir } = await offlineEditThenOtherDevice(true);
    const c = openAt(dir, server.url);
    const seen: string[] = [];
    const unsubscribe = c.store.subscribe(() => seen.push(localContent(c)));
    await waitFor(() => serverContent(server) === BOTH && localContent(c) === BOTH, 10000, () => `server ${JSON.stringify(serverContent(server))}, store ${JSON.stringify(localContent(c))}`);
    unsubscribe();
    expect(seen).toContain(BOTH);
    expect(seen).not.toContain(OTHER);
    expect(existsSync(join(dir, 'held-bases.json'))).toBe(false);
  }, 20000);

  it(`13: WHEN the other device's change is dated after this machine's clock and snote stops after the hand-off's merge is in state.json and the ghost file holds the server copy, before the merge is sent, then restarts and the note gains \`X\` THEN the store and the server hold exactly \`${JSON.stringify(BOTH + '\nX')}\`, each line once`, async () => {
    const { server, dir } = await offlineEditThenOtherDevice(true);
    const dead = tmp();
    const c = openAt(dir, server.url);
    let stopped = false;
    const unsubscribe = c.store.subscribe(() => {
      if (stopped || localContent(c) !== BOTH) return;
      stopped = true;
      copyDir(dir, dead);
      stop(c);
    });
    await waitFor(() => stopped && read(dir, 'ghosts-note.json').includes('line0'), 10000, () => `the stop at the merge and the ghost file holding the server copy, store ${JSON.stringify(localContent(c))}`);
    unsubscribe();
    cpSync(join(dir, 'ghosts-note.json'), join(dead, 'ghosts-note.json'));
    expect([stateContent(dead), serverContent(server)]).toEqual([BOTH, OTHER]);
    await restartHoldsBoth(dead, server);
    const d = open[open.length - 1];
    d.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: BOTH + '\nX' } } as never);
    await waitFor(() => localContent(d) === BOTH + '\nX' && serverContent(server) === BOTH + '\nX', 10000, () => `store ${JSON.stringify(localContent(d))}, server ${JSON.stringify(serverContent(server))}`);
    for (const text of [localContent(d), serverContent(server)]) expect(text.split('\n')).toEqual(['line0', 'line1', 'line2', 'OFF', 'X']);
  }, 20000);

  it(`7: WHEN snote is killed once the ghost file holds the server copy, restarts offline, n1 is edited to add \`X\` and saved, and snote then restarts online THEN the store and the server hold exactly \`${JSON.stringify(BOTH + '\nX')}\``, async () => {
    const { server, dir } = await offlineEditThenOtherDevice(true);
    const dead = await restartAndStop(dir, server.url, 'ghost', 'kill');
    const d = openAt(dead, OFFLINE_URL);
    await waitFor(() => localContent(d) !== '', 10000, () => 'the offline start');
    d.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: localContent(d) + '\nX' } } as never);
    await waitFor(() => stateContent(dead) === BOTH + '\nX', 10000, () => `the edit saved, state ${JSON.stringify(stateContent(dead))}`);
    stop(d);
    const e = openAt(dead, server.url);
    await waitFor(() => localContent(e) === BOTH + '\nX' && serverContent(server) === BOTH + '\nX', 10000, () => `store ${JSON.stringify(localContent(e))}, server ${JSON.stringify(serverContent(server))}`);
    expect(serverContent(server)).toBe(BOTH + '\nX');
  }, 20000);

  it(`8: WHEN the hand-off ran and synced \`${JSON.stringify(BOTH)}\`, then while snote was closed the other device replaced \`OFF\` with \`Z\`, and snote restarts THEN the store and the server hold exactly \`${JSON.stringify(OTHER + '\nZ')}\``, async () => {
    const { server, dir } = await offlineEditThenOtherDevice(true);
    const c = openAt(dir, server.url);
    await waitFor(() => serverContent(server) === BOTH && stateContent(dir) === BOTH, 10000, () => `server ${JSON.stringify(serverContent(server))}, state ${JSON.stringify(stateContent(dir))}`);
    await waitFor(() => Object.keys(c.store.getState().simperium.pendingNotes).length === 0, 10000, () => 'the send acknowledged');
    stop(c);
    const cur = server.getObject(APP_ID, 'note', 'n1')!.data;
    server.serverChange('note', 'n1', { ...cur, content: OTHER + '\nZ', modificationDate: Date.now() / 1000 + 120 });
    const d = openAt(dir, server.url);
    await waitFor(() => localContent(d) === OTHER + '\nZ', 10000, () => `store ${JSON.stringify(localContent(d))}`);
    await waitFor(() => Object.keys(d.store.getState().simperium.pendingNotes).length === 0 && stateContent(dir) === OTHER + '\nZ', 10000, () => `settled, state ${JSON.stringify(stateContent(dir))}`);
    expect(localContent(d)).toBe(OTHER + '\nZ');
    expect(serverContent(server)).toBe(OTHER + '\nZ');
  }, 20000);
});

/** A note bucket whose network-change hook the test calls, as the sync library does before it moves a ghost. */
function heldStore(ids: string[]): { store: ReturnType<typeof makeStore>; resolve: (id: string, data: object, base: object) => unknown } {
  const store = makeStore({ stubClient: {} });
  let hook: ((id: string, data: object, base: object) => unknown) | null = null;
  (store as unknown as { client: unknown }).client = { buckets: [{ name: 'note', beforeNetworkChange: (fn: typeof hook) => (hook = fn) }] };
  for (const id of ids) store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: makeNote(id, OFF, { modificationDate: 3000 }) } as never);
  return { store, resolve: (id, data, base) => hook?.(id, data, base) };
}
const content = (s: ReturnType<typeof makeStore>, id: string): string => String((s.getState().data.notes.get(id as never) as { content?: string } | undefined)?.content);
const ghostAt = (text: string, date: number) => ({ ...makeNote('x', text, { modificationDate: date }) });

describe('#657b the hand-off inside the catch-up', () => {
  it('9: WHEN n1, n2 and n3 are held, the catch-up brings the other device\'s change for each, and the ghost read after the catch-up rejects on n2 THEN requeueUnsynced rejects with `ghost read failed`, each store copy is `line0\\nline1\\nline2\\nOFF`, and state.json was written 3 times, each holding that note\'s merge', async () => {
    const ids = ['n1', 'n2', 'n3'];
    const { store, resolve } = heldStore(ids);
    const base = ghostAt(BASE, 2000);
    const server = ghostAt(OTHER, 2500);
    let caughtUp = false;
    const ghosts: GhostReader = { get: (id) => (caughtUp && id === 'n2' ? Promise.reject(new Error('ghost read failed')) : Promise.resolve({ data: caughtUp ? server : base })) };
    const saved: string[] = [];
    const whenCaughtUp = async (): Promise<void> => {
      for (const id of ids) {
        resolve(id, server, base);
        store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: server } as never);
      }
      caughtUp = true;
    };
    await expect(requeueUnsynced(store as never, ghosts, whenCaughtUp, {}, undefined, (s) => saved.push(ids.map((id) => String(s.data.notes.get(id as never)?.content)).join('|')))).rejects.toThrow('ghost read failed');
    expect(ids.map((id) => content(store, id))).toEqual([BOTH, BOTH, BOTH]);
    expect(saved).toEqual([`${BOTH}|${OFF}|${OFF}`, `${BOTH}|${BOTH}|${OFF}`, `${BOTH}|${BOTH}|${BOTH}`]);
  });

  it('10: WHEN the catch-up brings a second change for n1 (the server copy gains `W`) after the first THEN the hook returns the base both times, state.json was written twice, nothing was sent before the catch-up resolved, and the store ends with `line0`, `OFF` and `W` each exactly once', async () => {
    const { store, resolve } = heldStore(['n1']);
    const base = ghostAt(BASE, 2000);
    const first = ghostAt(OTHER, 2500);
    const second = ghostAt(OTHER + '\nW', 2600);
    const returned: unknown[] = [];
    const saved: number[] = [];
    let importsBefore = -1;
    let imports = 0;
    store.subscribe(() => undefined);
    const dispatch = store.dispatch;
    (store as unknown as { dispatch: typeof dispatch }).dispatch = ((a: { type: string }) => {
      if (a.type === 'IMPORT_NOTE_WITH_ID') imports++;
      return dispatch(a as never);
    }) as typeof dispatch;
    const whenCaughtUp = async (): Promise<void> => {
      imports = 0;
      returned.push(resolve('n1', first, base));
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: first } as never);
      returned.push(resolve('n1', second, first));
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: second } as never);
      importsBefore = imports;
    };
    await requeueUnsynced(store as never, { get: () => Promise.resolve({ data: importsBefore < 0 ? base : second }) }, whenCaughtUp, {}, undefined, () => saved.push(1));
    expect(returned).toEqual([base, first]);
    expect(saved).toHaveLength(2);
    expect(importsBefore).toBe(0);
    const lines = content(store, 'n1').split('\n');
    for (const line of ['line0', 'OFF', 'W']) expect(lines.filter((l) => l === line)).toHaveLength(1);
  });

  it('11: WHEN state.json cannot be written at the hand-off THEN the hook leaves the store to the library (the server copy reaches it) and after requeueUnsynced resolves the store holds exactly `line0\\nline1\\nline2\\nOFF`', async () => {
    const { store, resolve } = heldStore(['n1']);
    const base = ghostAt(BASE, 2000);
    const server = ghostAt(OTHER, 2500);
    let atCatchUp = '';
    let caughtUp = false;
    const whenCaughtUp = async (): Promise<void> => {
      resolve('n1', server, base);
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: server } as never);
      atCatchUp = content(store, 'n1');
      caughtUp = true;
    };
    const failing = (): void => {
      throw new Error('EACCES');
    };
    await requeueUnsynced(store as never, { get: () => Promise.resolve({ data: caughtUp ? server : base }) }, whenCaughtUp, {}, undefined, failing);
    expect(atCatchUp).toBe(OTHER);
    expect(content(store, 'n1')).toBe(BOTH);
  });

  it('12: WHEN n1 is marked handed off for the server copy `line0\\nline1\\nline2` THEN a store update with other text passes, the first with that text is dropped, and the next with that text passes', () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1', note: makeNote('n1', BOTH, { modificationDate: 3000 }) } as never);
    markHandedOff(store.getState, 'n1', OTHER);
    store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: ghostAt(BOTH + '\nY', 3100) } as never);
    const afterOther = content(store, 'n1');
    store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: ghostAt(OTHER, 2500) } as never);
    const afterDropped = content(store, 'n1');
    store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n1', note: ghostAt(OTHER, 2500) } as never);
    expect([afterOther, afterDropped, content(store, 'n1')]).toEqual([BOTH + '\nY', BOTH + '\nY', OTHER]);
  });
});
