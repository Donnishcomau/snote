/**
 * T158: Tag order reaches the server and other clients.
 * Proves with the real sync engine against the fake Simperium server
 * that a REORDER_TAG batch lands as `index` values on the server tag
 * objects, reaches a second connected store, and never touches notes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { tagRows, moveTagActions } from '../../src/core/collection';

const appId = 'test-app';
const token = 'test-token';
const username = 'test@example.com';

const syncConfig = (url: string) => ({
  appId,
  token,
  username,
  clientOptions: { url },
  noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
});

/** Poll a condition every 50ms, up to ~2s (40 iterations). */
async function poll(cond: () => boolean): Promise<boolean> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}

const noteData = (content: string, now: number, tags: string[]) => ({
  content,
  creationDate: now,
  modificationDate: now,
  deleted: 0,
  systemTags: [],
  tags,
});

type ServerStore = ReturnType<typeof makeStore>;

/**
 * Fresh server + store(s), both synced: notes n1/n2 tagged home/work,
 * and the tag bucket holds home, work and zeta, none with an index yet.
 * When `second: true`, a second store connects before any dispatch.
 */
async function setup(
  second = false
): Promise<{
  server: FakeSimperiumServer;
  store: ServerStore;
  store2: ServerStore | null;
}> {
  const server = new FakeSimperiumServer();
  await server.start();
  regist.push(server);

  const now = Date.now();
  server.seedBucket(appId, 'note', [
    { id: 'n1', data: noteData('One', now, ['home']), version: 1 },
    { id: 'n2', data: noteData('Two', now, ['work']), version: 1 },
  ]);
  server.seedBucket(appId, 'tag', [
    { id: 'home', data: { name: 'home' }, version: 1 },
    { id: 'work', data: { name: 'work' }, version: 1 },
    { id: 'zeta', data: { name: 'zeta' }, version: 1 },
  ]);

  const store = makeStore({ sync: syncConfig(server.url) });
  await waitForNotes(store, 2500);
  const ready = await poll(
    () =>
      store.getState().data.tags.has('home' as never) &&
      store.getState().data.tags.has('work' as never) &&
      store.getState().data.tags.has('zeta' as never)
  );
  expect(ready).toBe(true);
  expect(store.getState().data.notes.size).toBe(2);

  let store2: ServerStore | null = null;
  if (second) {
    store2 = makeStore({ sync: syncConfig(server.url) });
    await waitForNotes(store2, 2500);
    const ready2 = await poll(
      () =>
        store2!.getState().data.tags.has('home' as never) &&
        store2!.getState().data.tags.has('work' as never) &&
        store2!.getState().data.tags.has('zeta' as never)
    );
    expect(ready2).toBe(true);
    expect(store2.getState().data.notes.size).toBe(2);
  }

  return { server, store, store2 };
}

// Servers created by tests, stopped in afterEach (stores are never stopped).
const regist: FakeSimperiumServer[] = [];

afterEach(async () => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      for (const s of regist.splice(0)) {
        s.stop();
      }
      resolve();
    }, 100);
  });
});

/** Dispatch the moves that reorder `tagName` by `delta` within the store. */
function moveTag(store: ServerStore, tagName: string, delta: -1 | 1) {
  for (const a of moveTagActions(
    tagRows(store.getState().data.tags),
    tagName as never,
    delta
  )) {
    store.dispatch(a);
  }
}

describe('T158 Tag order reaches the server and other clients', () => {
  it('1: WHEN the store has synced THEN tagRows of its data.tags equals [home, work, zeta] and the server tag home has no index (toBeUndefined)', async () => {
    const { server, store } = await setup();

    expect(tagRows(store.getState().data.tags)).toEqual(['home', 'work', 'zeta']);
    expect(server.getObject(appId, 'tag', 'home')?.data.index).toBeUndefined();
  });

  it('2: WHEN home is moved down THEN the store tagRows equals [work, home, zeta], and within 2 s the server tags have index 0 for work, 1 for home and 2 for zeta', async () => {
    const { server, store } = await setup();

    moveTag(store, 'home', 1);

    const done = await poll(
      () =>
        JSON.stringify(tagRows(store.getState().data.tags)) ===
          '["work","home","zeta"]' &&
        server.getObject(appId, 'tag', 'work')?.data.index === 0 &&
        server.getObject(appId, 'tag', 'home')?.data.index === 1 &&
        server.getObject(appId, 'tag', 'zeta')?.data.index === 2
    );
    expect(done).toBe(true);

    expect(tagRows(store.getState().data.tags)).toEqual(['work', 'home', 'zeta']);
    expect(server.getObject(appId, 'tag', 'work')?.data.index).toBe(0);
    expect(server.getObject(appId, 'tag', 'home')?.data.index).toBe(1);
    expect(server.getObject(appId, 'tag', 'zeta')?.data.index).toBe(2);
  });

  it('3: WHEN a second store was connected before that move THEN within 2 s tagRows of the SECOND store data.tags equals [work, home, zeta] and its data.notes.size is still 2', async () => {
    const { store, store2 } = await setup(true);

    moveTag(store, 'home', 1);

    const done = await poll(
      () =>
        JSON.stringify(tagRows(store2!.getState().data.tags)) ===
          '["work","home","zeta"]' && store2!.getState().data.notes.size === 2
    );
    expect(done).toBe(true);

    expect(tagRows(store2!.getState().data.tags)).toEqual(['work', 'home', 'zeta']);
    expect(store2!.getState().data.notes.size).toBe(2);
  });

  it('4: WHEN that move has reached the server THEN server notes n1 and n2 still have version 1 and n1 still has tags equal to [home] (a reorder does not touch notes)', async () => {
    const { server, store } = await setup();

    moveTag(store, 'home', 1);

    const done = await poll(
      () =>
        server.getObject(appId, 'tag', 'work')?.data.index === 0 &&
        server.getObject(appId, 'tag', 'home')?.data.index === 1 &&
        server.getObject(appId, 'tag', 'zeta')?.data.index === 2
    );
    expect(done).toBe(true);

    expect(server.getObject(appId, 'note', 'n1')?.version).toBe(1);
    expect(server.getObject(appId, 'note', 'n2')?.version).toBe(1);
    expect(server.getObject(appId, 'note', 'n1')?.data.tags).toEqual(['home']);
  });

  it('5: WHEN zeta is moved down (it is the last row) THEN moveTagActions returned an array of length 0, and 300 ms later the server tags home, work and zeta all still have version 1', async () => {
    const { server, store } = await setup();

    const actions = moveTagActions(
      tagRows(store.getState().data.tags),
      'zeta' as never,
      1
    );
    expect(actions).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 300));

    expect(server.getObject(appId, 'tag', 'home')?.version).toBe(1);
    expect(server.getObject(appId, 'tag', 'work')?.version).toBe(1);
    expect(server.getObject(appId, 'tag', 'zeta')?.version).toBe(1);
  });
});
