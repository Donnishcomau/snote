/**
 * (#734): the records keyed by note id (unsynced.json, unsynced-notes.json, sent-changes.json and the store's
 * pendingNotes) hold a note whose id is `__proto__` or `constructor` like any other note: a plain `{}` drops
 * `record['__proto__'] = x` and reads `record['constructor']` from Object.prototype, so an offline edit to such a note
 * was never recorded as unsent.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadUnsynced, loadUnsyncedNotes, trackUnsynced } from '../../src/core/unsynced';
import { createSentChanges, loadSentChanges } from '../../src/core/sent-changes';
import simperiumReducer, { initialState } from '../../src/core/simperium-reducer';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { waitHeld } from '../helpers/wait-held';
import { holdId, isUnsent, keepUnsent, releaseAll, unsentCount } from '../../src/core/held-unsynced';
import { installSimperiumStaleDeleteFix } from '../../src/core/simperium-stale-delete-fix';

const IDS = ['__proto__', 'constructor', 'n1'];
// every Object.prototype name (12 on node 22) plus an ordinary id
const NAMES = Object.getOwnPropertyNames(Object.prototype).concat(['n1']);
const auth = { email: 'test@example.com', token: 'test-token' };
const seed = { content: 'server text', creationDate: 1000, modificationDate: 1000, deleted: false, systemTags: [], tags: [] };
const unsyncedIds = (dir: string): string[] => {
  try {
    return Object.keys(JSON.parse(readFileSync(join(dir, 'unsynced.json'), 'utf8'))).sort();
  } catch {
    return [];
  }
};
type Build = ReturnType<typeof buildStore>;
const end = (b: Build): void => {
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
};
const notesOf = (b: Build) => (b.store.getState() as unknown as { data: { notes: Map<string, { content: string }> } }).data.notes;
/** Edit every name offline, stop, start against the server; returns each id's server content once the start-up hand-off is over. */
async function offlineEditThenRestart(dir: string, server: FakeSimperiumServer, builds: Build[]): Promise<Record<string, string | undefined>> {
  const opts = { dataDir: dir, appId: 'test-app', noteEditDelayMs: 10 };
  const off = buildStore({ ...opts, server: 'ws://127.0.0.1:9' }, auth, vi.fn());
  builds.push(off);
  for (const id of NAMES) off.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'offline edit' } } as never);
  await waitHeld(() => unsyncedIds(dir).join() === [...NAMES].sort().join(), 'unsynced.json names every id');
  end(off);
  const on = buildStore({ ...opts, server: server.url }, auth, vi.fn());
  builds.push(on);
  // the ordinary id is the control: once it is on the server and nothing is held or pending, the hand-off is over
  await waitHeld(() => server.getObject('test-app', 'note', 'n1')?.data.content === 'offline edit' && unsentCount(on.store as never) === 0, 'n1 sent and nothing unsent');
  return Object.fromEntries(NAMES.map((id) => [id, server.getObject('test-app', 'note', id)?.data.content as string | undefined]));
}
const allEdited = (): Record<string, string> => Object.fromEntries(NAMES.map((id) => [id, 'offline edit']));
const dirs: string[] = [];
const fresh = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'snote-f387-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const own = (o: object): string[] => Object.keys(o).sort();
const pendingOf = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'dirty']));

describe('note ids that are Object.prototype names in the id-keyed records', () => {
  it('1: WHEN notes `__proto__`, `constructor` and `n1` are pending with dates 1001, 1002 and 1003 THEN unsynced.json and unsynced-notes.json hold all three ids with those dates and contents, and loadUnsynced and loadUnsyncedNotes read all three back as own entries', () => {
    const dir = fresh();
    writeFileSync(join(dir, 'state.json'), '{}');
    const notes = new Map<string, { content: string; modificationDate: number }>(IDS.map((id, i) => [id, { content: `text ${id}`, modificationDate: 1001 + i }]));
    let state = { simperium: { pendingNotes: {} as Record<string, string> }, data: { notes } };
    let listener = () => {};
    trackUnsynced({ getState: () => state as never, subscribe: (l: () => void) => ((listener = l), () => {}) }, dir);
    state = { ...state, simperium: { pendingNotes: pendingOf(IDS) } };
    listener();
    const written = JSON.parse(readFileSync(join(dir, 'unsynced.json'), 'utf8')) as Record<string, number>;
    expect(own(written)).toEqual(['__proto__', 'constructor', 'n1']);
    expect(IDS.map((id) => written[id])).toEqual([1001, 1002, 1003]);
    const savedNotes = JSON.parse(readFileSync(join(dir, 'unsynced-notes.json'), 'utf8')) as Record<string, { content: string }>;
    expect(IDS.map((id) => savedNotes[id]?.content)).toEqual(['text __proto__', 'text constructor', 'text n1']);
    const loaded = loadUnsynced(dir);
    expect(own(loaded)).toEqual(['__proto__', 'constructor', 'n1']);
    expect(IDS.map((id) => loaded[id])).toEqual([1001, 1002, 1003]);
    expect(own(loadUnsyncedNotes(dir))).toEqual(['__proto__', 'constructor', 'n1']);
  });

  it('2: WHEN no record file exists THEN loadUnsynced, loadUnsyncedNotes and loadSentChanges give records whose `__proto__` and `constructor` entries are `undefined`', () => {
    const dir = fresh();
    for (const rec of [loadUnsynced(dir), loadUnsyncedNotes(dir), loadSentChanges(dir)] as Record<string, unknown>[]) {
      expect([rec['__proto__'], rec['constructor']]).toEqual([undefined, undefined]);
    }
  });

  it('3: WHEN `sent` records `__proto__` with `cc1` and `constructor` with `cc2` THEN sent-changes.json holds both, loadSentChanges reads both, and WHEN `__proto__` is acknowledged with `cc1` THEN only `constructor` stays', () => {
    const dir = fresh();
    const s = createSentChanges(dir);
    s.sent('__proto__', 'cc1');
    s.sent('constructor', 'cc2');
    const file = JSON.parse(readFileSync(join(dir, 'sent-changes.json'), 'utf8')) as Record<string, string>;
    expect(own(file)).toEqual(['__proto__', 'constructor']);
    expect([file['__proto__'], file['constructor']]).toEqual(['cc1', 'cc2']);
    const loaded = loadSentChanges(dir);
    expect([loaded['__proto__'], loaded['constructor']]).toEqual(['cc1', 'cc2']);
    s.acknowledged('__proto__', 'cc1');
    expect(own(JSON.parse(readFileSync(join(dir, 'sent-changes.json'), 'utf8')) as object)).toEqual(['constructor']);
  });

  it('4: WHEN `__proto__` and `n1` are edited, `constructor` (never edited) is sent, then `n1` is sent and acknowledged THEN pendingNotes still holds `__proto__` as `dirty` and holds no `n1` and no `constructor`', () => {
    let s = simperiumReducer({ ...initialState, tracking: true }, { type: 'EDIT_NOTE', noteId: '__proto__', changes: {} } as never);
    s = simperiumReducer(s, { type: 'EDIT_NOTE', noteId: 'n1', changes: {} } as never);
    s = simperiumReducer(s, { type: 'SUBMIT_PENDING_CHANGE', entityId: 'constructor' } as never);
    s = simperiumReducer(s, { type: 'SUBMIT_PENDING_CHANGE', entityId: 'n1' } as never);
    s = simperiumReducer(s, { type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: 'n1' } as never);
    expect(own(s.pendingNotes)).toEqual(['__proto__']);
    expect(s.pendingNotes['__proto__']).toBe('dirty');
  });

  it('5: WHEN every Object.prototype name and `n1` (`server text` on the server, in state.json, never synced by this data folder) is edited to `offline edit` with no server reachable and snote stops THEN unsynced.json names every id, and WHEN snote starts again against the server THEN the server holds `offline edit` for every id', async () => {
    const dir = fresh();
    const server = new FakeSimperiumServer();
    await server.start();
    const builds: Build[] = [];
    try {
      server.seedBucket('test-app', 'note', NAMES.map((id) => ({ id, data: seed, version: 1 })));
      const stub = makeStore({ stubClient: {} });
      for (const id of NAMES) stub.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: seed } as never);
      saveState(stub.getState(), dir);
      expect(await offlineEditThenRestart(dir, server, builds)).toEqual(allEdited());
    } finally {
      for (const b of builds) end(b);
      server.stop();
    }
  }, 20000);

  it('6: WHEN every Object.prototype name and `n1` is first synced from the server (`server text`), then edited to `offline edit` with no server reachable and snote stops THEN unsynced.json names every id, and WHEN snote starts again against the server THEN the server holds `offline edit` for every id', async () => {
    const dir = fresh();
    const server = new FakeSimperiumServer();
    await server.start();
    const builds: Build[] = [];
    try {
      server.seedBucket('test-app', 'note', NAMES.map((id) => ({ id, data: seed, version: 1 })));
      const first = buildStore({ dataDir: dir, appId: 'test-app', noteEditDelayMs: 10, server: server.url }, auth, vi.fn());
      builds.push(first);
      await waitHeld(() => NAMES.every((id) => notesOf(first).get(id)?.content === 'server text'), 'the first start holds every note');
      end(first);
      expect(await offlineEditThenRestart(dir, server, builds)).toEqual(allEdited());
    } finally {
      for (const b of builds) end(b);
      server.stop();
    }
  }, 20000);

  it('7: WHEN `constructor` is held, or kept unsent while its note exists, and pendingNotes is empty THEN unsentCount counts it and isUnsent stays true after a store change', () => {
    let listener = (): void => {};
    const store = {
      getState: () => ({ simperium: { pendingNotes: {} }, data: { notes: new Map([['constructor', {}]]) } }),
      subscribe: (l: () => void) => ((listener = l), () => {}),
    };
    holdId(store, 'constructor');
    expect(unsentCount(store)).toBe(1);
    releaseAll(store);
    keepUnsent(store, ['constructor']);
    listener();
    expect({ count: unsentCount(store), unsent: isUnsent(store, 'constructor') }).toEqual({ count: 1, unsent: true });
  });

  it('8: WHEN a re-index completes that carried only `n1`, every Object.prototype name is a local note, and pendingNotes is the store\'s initial empty record THEN every Object.prototype name is deleted forever and removed from the ghost store, and `n1` is kept', () => {
    const channel = Object.assign(new EventEmitter(), { isIndexing: false, store: { remove: vi.fn<(id: string) => Promise<unknown>>(async () => undefined) } });
    const dispatch = vi.fn();
    const store = {
      getState: () => ({ simperium: { pendingNotes: initialState.pendingNotes }, data: { notes: new Map(NAMES.map((id) => [id, {}])) } }),
      dispatch,
      subscribe: () => () => {},
    };
    installSimperiumStaleDeleteFix({ buckets: [{ name: 'note', channel }] }, store as never);
    channel.emit('indexingStateChange', true);
    channel.emit('update', 'n1', {}, {}, {}, true);
    channel.emit('index');
    const deleted = dispatch.mock.calls.map(([a]) => (a as { noteId: string }).noteId).sort();
    const prototypeNames = NAMES.filter((id) => id !== 'n1').sort();
    expect({ deleted, removed: channel.store.remove.mock.calls.map(([id]) => id).sort() }).toEqual({ deleted: prototypeNames, removed: prototypeNames });
  });

  it('9: WHEN sent-changes.json holds `__proto__` with `cc-old`, `sent` replaces it with `cc-new`, and an echo of `__proto__` with ccids [`cc-old`] arrives while a stale change from the same source version is in flight THEN echoes matches `__proto__` with `cc-old`', () => {
    const dir = fresh();
    writeFileSync(join(dir, 'sent-changes.json'), '{"__proto__":"cc-old"}');
    const sc = createSentChanges(dir);
    sc.sent('__proto__', 'cc-new');
    const inFlight = JSON.parse('{"__proto__":{"sv":3}}') as Record<string, unknown>;
    expect(sc.echoes(JSON.stringify([{ id: '__proto__', sv: 3, ccids: ['cc-old'] }]), inFlight)).toEqual([{ id: '__proto__', ccid: 'cc-old' }]);
  });
});
