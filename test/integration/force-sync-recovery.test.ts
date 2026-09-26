/**
 * T243 Sync recovery: `r` must push a note that is stuck pending to the server.
 *
 * A note whose change was sent but never acknowledged stays in
 * `simperium.pendingNotes` as `sent` for ever, and the old forceSync only
 * re-requested each bucket's change version, so it never re-sent the note.
 *
 * The stuck state is created with public actions only: EDIT_NOTE makes the
 * note dirty, and SUBMIT_PENDING_CHANGE with ccid `never-acked` marks it
 * `sent` with no acknowledge ever arriving for that ccid. No wire change for
 * it is in flight (the deferral below keeps the debounced queue write-out
 * from completing), so nothing but forceSync() can get the note to the
 * server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { pendingCount } from '../../src/core/simperium-reducer';

const appId = 'test-app';

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Poll a condition every 50 ms, at most `maxMs`. A false result comes back
 * as soon as the budget is spent. */
async function pollUntil(cond: () => boolean, maxMs: number): Promise<boolean> {
  for (let i = 0; i < Math.ceil(maxMs / 50) && !cond(); i++) {
    await sleep(50);
  }
  return cond();
}

const noteData = (content: string) => ({
  content,
  creationDate: 1_000,
  modificationDate: 1_000,
  deleted: 0,
  systemTags: [],
  tags: [],
});

type SyncedStore = ReturnType<typeof makeStore>;

let server: FakeSimperiumServer;
let url: string;

const makeSyncedStore = async (): Promise<SyncedStore> => {
  const store = makeStore({
    sync: {
      appId,
      token: 'test-token',
      username: 'test@example.com',
      clientOptions: { url },
      // OMARCHY: fast debounce for tests
      noteEditDelayMs: 10,
    },
  });
  await waitForNotes(store, 2500);
  // Let the index settle so nothing is in flight when we start.
  await sleep(200);
  return store;
};

const changeFrameCount = (): number =>
  server.received.filter((m) => m.includes(':c:')).length;

const changeFramesFor = (id: string): string[] =>
  server.received.filter(
    (m) => m.includes(':c:') && m.includes(`"id":"${id}"`)
  );

/** EDIT_NOTE then a SUBMIT that never gets acknowledged: the stuck state.
 * While deferring, the queue's debounced write-out to the bucket is held so
 * the only change frame for the note can be the one forceSync triggers. */
const stickNote = (
  store: SyncedStore,
  id: string,
  content: string,
  defer = true
): void => {
  if (defer) {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  }
  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: id as never,
    changes: { content },
  });
  store.dispatch({
    type: 'SUBMIT_PENDING_CHANGE',
    entityId: id as never,
    ccid: 'never-acked',
  } as never);
  if (defer) {
    vi.useRealTimers();
  }
};

describe('T243 forceSync re-sends a note stuck pending', () => {
  beforeEach(async () => {
    server = new FakeSimperiumServer();
    url = (await server.start()).url;
    server.seedBucket(appId, 'note', [
      { id: 'a', data: noteData('Original a'), version: 1 },
      { id: 'b', data: noteData('Original b'), version: 1 },
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Let in-flight sync settle, then stop the server (offline.test.ts pattern).
    await sleep(50);
    server.stop();
  });

  it('1: WHEN note `a` is seeded and loaded, EDIT_NOTE sets its content to `stuck edit`, SUBMIT_PENDING_CHANGE with ccid `never-acked` is dispatched for `a`, and 500 ms pass THEN `pendingCount(store.getState().simperium)` is `1` and the server\'s `a` content is still `Original a`', async () => {
    const store = await makeSyncedStore();

    stickNote(store, 'a', 'stuck edit');
    await sleep(500);

    expect(pendingCount(store.getState().simperium)).toBe(1);
    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe(
      'Original a'
    );
  });

  it('2: WHEN `store.forceSync()` is then called THEN within 3 s `pendingCount(store.getState().simperium)` is `0` and the server\'s `a` content is `stuck edit`', async () => {
    const store = await makeSyncedStore();

    stickNote(store, 'a', 'stuck edit');
    const stuck = await pollUntil(
      () =>
        pendingCount(store.getState().simperium) === 1 &&
        store.getState().simperium.pendingNotes['a'] === 'sent' &&
        changeFramesFor('a').length === 0 &&
        server.getObject(appId, 'note', 'a')?.data.content === 'Original a',
      1000
    );
    expect(stuck).toBe(true);

    store.forceSync!();
    const settled = await pollUntil(
      () =>
        pendingCount(store.getState().simperium) === 0 &&
        server.getObject(appId, 'note', 'a')?.data.content === 'stuck edit',
      2900
    );

    expect(settled).toBe(true);
    expect(pendingCount(store.getState().simperium)).toBe(0);
    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe(
      'stuck edit'
    );
  });

  it('3: WHEN `pendingNotes` is empty and `store.forceSync()` is called THEN within 1 s the number of change frames in `server.received` is unchanged from before the call', async () => {
    const store = await makeSyncedStore();

    expect(pendingCount(store.getState().simperium)).toBe(0);
    const before = changeFrameCount();

    store.forceSync!();
    await sleep(1000);

    expect(changeFrameCount()).toBe(before);
  });

  it('4: WHEN note `b` is seeded, is NOT edited and `store.forceSync()` is called after line 2 THEN the server\'s `b` content is still `Original b` and `server.received` contains no change frame carrying `"id":"b"`', async () => {
    const store = await makeSyncedStore();

    // Line 2: 'a' goes stuck, then forceSync pushes it.
    stickNote(store, 'a', 'stuck edit');
    const stuck = await pollUntil(
      () =>
        pendingCount(store.getState().simperium) === 1 &&
        store.getState().simperium.pendingNotes['a'] === 'sent' &&
        changeFramesFor('a').length === 0 &&
        server.getObject(appId, 'note', 'a')?.data.content === 'Original a',
      1000
    );
    expect(stuck).toBe(true);

    store.forceSync!();
    const settled = await pollUntil(
      () =>
        pendingCount(store.getState().simperium) === 0 &&
        server.getObject(appId, 'note', 'a')?.data.content === 'stuck edit',
      2900
    );
    expect(settled).toBe(true);
    await sleep(200);

    expect(server.getObject(appId, 'note', 'b')!.data.content).toBe(
      'Original b'
    );
    const framesCarryingB = server.received.filter(
      (m) => m.includes(':c:') && m.includes(`"id":"b"`)
    );
    expect(framesCarryingB).toEqual([]);
  });
});
