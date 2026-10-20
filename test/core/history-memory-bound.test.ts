/**
 * T536 Note history cannot grow memory without limit.
 * A note's versions are held only while its history is open (one note at
 * most): closing history releases them from Redux and from simperium's
 * module-level revisionCache; reopening fetches and shows them again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import Channel, { revisionCache } from 'simperium/lib/simperium/channel';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { installSimperiumRevisionCacheFix } from '../../src/core/simperium-revision-cache-fix';
import { revisionsOf, restoreRevisionAction } from '../../src/core/history';
import type { EntityId } from '@vendor/types';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const heap = (): number => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};
const MB = 1024 * 1024;
/**
 * F215: under CPU contention V8 can keep just-freed objects counted for a
 * few forced gcs (seen: 21.8 MB after 4 gcs, 0.2 MB after the 5th, with
 * revisionCache and noteRevisions already empty and a heap snapshot at that
 * moment holding none of the version texts). So the heap is re-measured on
 * later event-loop turns, for at most 2 s, until it grew by less than the
 * bound. A real leak never drops, so it still fails.
 */
const settledGrowthMB = async (before: number, boundMB: number): Promise<number> => {
  const end = Date.now() + 2000;
  let grown = (heap() - before) / MB;
  while (grown >= boundMB && Date.now() < end) {
    await new Promise((res) => setTimeout(res, 10));
    grown = (heap() - before) / MB;
  }
  return grown;
};
const cacheKeys = (prefix: string): string[] =>
  [...(revisionCache as Map<string, unknown>).keys()].filter((k) => k.startsWith(prefix));

const id = 'shared' as unknown as EntityId;
const noteA = 'noteA' as unknown as EntityId;
const body = 'shared '.repeat(1500); // about 10 KB
const meta = { tags: [], systemTags: [], creationDate: 1, modificationDate: 1, deleted: false };

/** A real Channel whose fetches the stub answers; a store that has the note. */
function rig() {
  let current = 200;
  const channel: any = new (Channel as any)(
    'app',
    'tok',
    { get: () => Promise.resolve({ version: current }) },
    'note'
  );
  installSimperiumRevisionCacheFix({ buckets: [{ channel }] });
  channel.send = (msg: string) => {
    const m = /^e:(.+)\.(\d+)$/.exec(msg);
    if (m) {
      setImmediate(() =>
        channel.emit('version.' + m[1], m[1], +m[2], {
          content: JSON.parse(JSON.stringify(`v${m[2]}\n${body}${m[2]}`)),
          ...meta,
        })
      );
    }
  };
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: id,
    note: { content: 'x', ...meta },
  } as any);
  const open = async (): Promise<number> => {
    store.dispatch({ type: 'OPEN_NOTE', noteId: id } as any);
    store.dispatch({ type: 'REVISIONS_TOGGLE' } as any);
    const revs = await channel.getRevisions(id);
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: id,
      revisions: revs.map((r: any) => [r.version, r.data]),
    } as any);
    return revs.length;
  };
  const close = () => store.dispatch({ type: 'CLOSE_REVISION' } as any);
  const held = (n: EntityId) => store.getState().data.noteRevisions.get(n);
  const loadA = () =>
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: noteA,
      revisions: [[1, { content: 'old A', ...meta }]],
    } as any);
  return { store, open, close, held, loadA, bump: () => (current += 100) };
}

describe('T536 note history memory bound', () => {
  it('1: WHEN history is opened and closed 20 times on a note whose versions are 10 KB texts `v<n>\\n` plus 1,500 repeats of `shared ` plus `<n>`, starting at version `200` and gaining 100 versions between opens THEN the last open shows `2100` versions and heapUsed after a forced gc grew by less than `5` MB', async () => {
    const r = rig();
    const before = heap();
    let shown = 0;
    for (let i = 0; i < 20; i++) {
      shown = await r.open();
      r.close();
      r.bump();
    }
    expect(shown).toBe(2100);
    expect(cacheKeys('shared.')).toEqual([]);
    expect(r.held(id)).toBeUndefined();
    const grown = await settledGrowthMB(before, 5);
    expect(grown).toBeLessThan(5);
  }, 20000);

  it('2: WHEN that note\'s history is opened at version 200 and closed with `CLOSE_REVISION` THEN `noteRevisions` has no entry for the note and `revisionCache` has no key starting with the note id and `.`; WHEN it is opened again THEN `200` versions are held again', async () => {
    const r = rig();
    expect(await r.open()).toBe(200);
    expect(r.held(id)?.size).toBe(200);
    r.close();
    expect(r.held(id)).toBeUndefined();
    expect(cacheKeys('shared.')).toEqual([]);
    expect(await r.open()).toBe(200);
    expect(r.held(id)?.size).toBe(200);
  });

  it('3: WHEN one version of note `noteA` (`old A`) is loaded while history is closed, then history is opened and loaded on the 200-version note THEN `noteRevisions` holds the `200` versions and nothing for `noteA`', async () => {
    const r = rig();
    r.loadA();
    expect(r.held(noteA)?.size).toBe(1);
    expect(await r.open()).toBe(200);
    expect(r.held(id)?.size).toBe(200);
    expect(r.held(noteA)).toBeUndefined();
  });

  it('6: WHEN history is open and loaded on the 200-version note and a `LOAD_REVISIONS` for `noteA` arrives THEN the note still has `200` versions held and `noteA` has none', async () => {
    const r = rig();
    expect(await r.open()).toBe(200);
    r.loadA();
    expect(r.held(id)?.size).toBe(200);
    expect(r.held(noteA)).toBeUndefined();
  });
});

describe('T536 note history against the fake server', () => {
  const appId = 'test-app';
  const now = Math.floor(Date.now() / 1000);
  let server: FakeSimperiumServer;
  let stop: (() => void) | undefined;

  afterEach(async () => {
    stop?.();
    await new Promise((r) => setTimeout(r, 100));
    server.stop();
  });

  const until = async (cond: () => boolean): Promise<void> => {
    for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
  };

  async function makeHistory() {
    server = new FakeSimperiumServer();
    await server.start();
    const data = (content: string) => ({
      content, creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [],
    });
    server.seedBucket(appId, 'note', [
      { id: 'note1', data: data('First draft'), version: 1 },
      { id: 'note2', data: data('Other note'), version: 1 },
    ]);
    const store = makeStore({
      sync: {
        appId,
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });
    stop = () => store.stopSync?.();
    await waitForNotes(store, 2500);
    const version = () => server.getObject(appId, 'note', 'note1')?.version ?? -1;
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'note1' as never, changes: { content: 'Second draft' } });
    await until(() => version() === 2);
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'note1' as never, changes: { content: 'Third draft' } });
    await until(() => version() === 3);
    await new Promise((r) => setTimeout(r, 150));
    const vers = () => revisionsOf(store.getState(), 'note1' as never).map((x) => x.version).join(',');
    const openNote = () => {
      store.dispatch({ type: 'OPEN_NOTE', noteId: 'note1' } as never);
      store.dispatch({ type: 'REVISIONS_TOGGLE' } as never);
    };
    return { store, vers, openNote };
  }

  it('4: WHEN, against the fake server, note1 (versions 1, 2, 3) has its history opened through a synced `makeStore`, closed with `CLOSE_REVISION` and opened again THEN after each load `revisionsOf` gives versions `3,2,1` and `revisionCache` has `0` keys starting `note1.`, and after the close `revisionsOf` is empty', async () => {
    const { store, vers, openNote } = await makeHistory();
    openNote();
    await until(() => vers() === '3,2,1' && cacheKeys('note1.').length === 0);
    expect(vers()).toBe('3,2,1');
    expect(cacheKeys('note1.').length).toBe(0);
    store.dispatch({ type: 'CLOSE_REVISION' } as never);
    expect(vers()).toBe('');
    openNote();
    await until(() => vers() === '3,2,1' && cacheKeys('note1.').length === 0);
    expect(vers()).toBe('3,2,1');
    expect(cacheKeys('note1.').length).toBe(0);
  });

  it('5: WHEN, after line 4\'s first load, `restoreRevisionAction(store.getState(), note1, 1)` is dispatched THEN within 2 s the store note1 content is `First draft` and `noteRevisions` has no entry for note1', async () => {
    const { store, vers, openNote } = await makeHistory();
    openNote();
    await until(() => vers() === '3,2,1');
    expect(vers()).toBe('3,2,1');
    const action = restoreRevisionAction(store.getState(), 'note1' as never, 1);
    store.dispatch(action as never);
    const content = () => store.getState().data.notes.get('note1' as never)?.content;
    const gone = () => store.getState().data.noteRevisions.get('note1' as never) === undefined;
    await until(() => content() === 'First draft' && gone());
    expect(content()).toBe('First draft');
    expect(gone()).toBe(true);
  });
});
