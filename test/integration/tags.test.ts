/**
 * T87: Tag rename and delete reach the server and other clients.
 * Exercises RENAME_TAG / TRASH_TAG through the real sync middleware
 * against the fake Simperium server (docs/EVALS.md scenario 7).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

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
 * Fresh server + store(s), both synced: notes tagged1/tagged2 have tag
 * `work`, note plain has none, and the tag bucket holds `work`.
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
    { id: 'tagged1', data: noteData('One', now, ['work']), version: 1 },
    { id: 'tagged2', data: noteData('Two', now, ['work']), version: 1 },
    { id: 'plain', data: noteData('Three', now, []), version: 1 },
  ]);
  server.seedBucket(appId, 'tag', [
    { id: 'work', data: { name: 'work' }, version: 1 },
  ]);

  const store = makeStore({ sync: syncConfig(server.url) });
  await waitForNotes(store, 2500);
  const ready = await poll(() => store.getState().data.tags.has('work' as never));
  expect(ready).toBe(true);
  expect(store.getState().data.notes.size).toBe(3);

  let store2: ServerStore | null = null;
  if (second) {
    store2 = makeStore({ sync: syncConfig(server.url) });
    await waitForNotes(store2, 2500);
    const ready2 = await poll(() => store2!.getState().data.tags.has('work' as never));
    expect(ready2).toBe(true);
    expect(store2.getState().data.notes.size).toBe(3);
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

describe('T87 Tag rename and delete reach the server and other clients', () => {
  it('1: WHEN the store dispatches RENAME_TAG from work to job THEN within 2 s server notes tagged1 and tagged2 have tags holding exactly one name, job, and version 2, and server note plain still has tags of length 0 and version 1', async () => {
    const { server, store } = await setup();

    // Before the rename, the tag object exists on the server with name "work".
    expect(server.getObject(appId, 'tag', 'work')?.data.name).toBe('work');

    store.dispatch({
      type: 'RENAME_TAG',
      oldTagName: 'work' as never,
      newTagName: 'job' as never,
    } as never);

    const done = await poll(
      () =>
        JSON.stringify(server.getObject(appId, 'note', 'tagged1')?.data.tags) ===
          '["job"]' &&
        JSON.stringify(server.getObject(appId, 'note', 'tagged2')?.data.tags) ===
          '["job"]'
    );
    expect(done).toBe(true);

    expect(server.getObject(appId, 'note', 'tagged1')?.version).toBe(2);
    expect(server.getObject(appId, 'note', 'tagged2')?.version).toBe(2);
    expect(server.getObject(appId, 'note', 'plain')?.data.tags).toEqual([]);
    expect(server.getObject(appId, 'note', 'plain')?.version).toBe(1);
  });

  it('2: WHEN the same rename ran THEN within 2 s server tag job has data.name job and server tag work is gone (toBeUndefined); before the rename server tag work had data.name work', async () => {
    const { server, store } = await setup();

    expect(server.getObject(appId, 'tag', 'work')?.data.name).toBe('work');

    store.dispatch({
      type: 'RENAME_TAG',
      oldTagName: 'work' as never,
      newTagName: 'job' as never,
    } as never);

    const done = await poll(() => server.getObject(appId, 'tag', 'job') !== undefined);
    expect(done).toBe(true);
    expect(server.getObject(appId, 'tag', 'job')?.data.name).toBe('job');

    const gone = await poll(() => server.getObject(appId, 'tag', 'work') === undefined);
    expect(gone).toBe(true);
    expect(server.getObject(appId, 'tag', 'work')).toBeUndefined();
  });

  it('3: WHEN a second store was connected before the rename THEN within 2 s its notes tagged1 and tagged2 have tags holding exactly one name, job, its plain has tags of length 0, and its data.tags has job and not work', async () => {
    const { store, store2 } = await setup(true);

    store!.dispatch({
      type: 'RENAME_TAG',
      oldTagName: 'work' as never,
      newTagName: 'job' as never,
    } as never);

    const done = await poll(() => {
      const s = store2!.getState();
      return (
        JSON.stringify(s.data.notes.get('tagged1' as never)?.tags) === '["job"]' &&
        JSON.stringify(s.data.notes.get('tagged2' as never)?.tags) === '["job"]' &&
        s.data.tags.has('job' as never) &&
        !s.data.tags.has('work' as never)
      );
    });
    expect(done).toBe(true);

    const s = store2!.getState();
    expect(s.data.notes.get('tagged1' as never)?.tags).toEqual(['job']);
    expect(s.data.notes.get('tagged2' as never)?.tags).toEqual(['job']);
    expect(s.data.notes.get('plain' as never)?.tags).toEqual([]);
    expect(s.data.tags.has('job' as never)).toBe(true);
    expect(s.data.tags.has('work' as never)).toBe(false);
  });

  it('4: WHEN the store dispatches TRASH_TAG for work THEN within 2 s server notes tagged1 and tagged2 have tags of length 0, server note plain still has version 1, and server tag work is gone (toBeUndefined)', async () => {
    const { server, store } = await setup();

    store.dispatch({ type: 'TRASH_TAG', tagName: 'work' as never } as never);

    const done = await poll(
      () =>
        (server.getObject(appId, 'note', 'tagged1')?.data.tags as unknown[]).length ===
          0 &&
        (server.getObject(appId, 'note', 'tagged2')?.data.tags as unknown[]).length ===
          0
    );
    expect(done).toBe(true);

    expect(server.getObject(appId, 'note', 'plain')?.version).toBe(1);

    const gone = await poll(() => server.getObject(appId, 'tag', 'work') === undefined);
    expect(gone).toBe(true);
    expect(server.getObject(appId, 'tag', 'work')).toBeUndefined();
  });

  it('5: WHEN a second store was connected before that delete THEN within 2 s its notes tagged1 and tagged2 have tags of length 0, its data.notes.size is still 3 and its data.tags has no work', async () => {
    const { store, store2 } = await setup(true);

    store!.dispatch({ type: 'TRASH_TAG', tagName: 'work' as never } as never);

    const done = await poll(() => {
      const s = store2!.getState();
      return (
        s.data.notes.get('tagged1' as never)?.tags.length === 0 &&
        s.data.notes.get('tagged2' as never)?.tags.length === 0
      );
    });
    expect(done).toBe(true);

    const s = store2!.getState();
    expect(s.data.notes.get('tagged1' as never)?.tags).toEqual([]);
    expect(s.data.notes.get('tagged2' as never)?.tags).toEqual([]);
    expect(s.data.notes.size).toBe(3);

    const gone = await poll(() => !s.data.tags.has('work' as never));
    expect(gone).toBe(true);
    expect(s.data.tags.has('work' as never)).toBe(false);
  });

  it('6: WHEN the store dispatches RENAME_TAG from work to Work THEN within 2 s server tag work has data.name Work, and 300 ms later server notes tagged1 and tagged2 still have tags holding exactly work and version 1', async () => {
    const { server, store } = await setup();

    store.dispatch({
      type: 'RENAME_TAG',
      oldTagName: 'work' as never,
      newTagName: 'Work' as never,
    } as never);

    const done = await poll(
      () => server.getObject(appId, 'tag', 'work')?.data.name === 'Work'
    );
    expect(done).toBe(true);

    await new Promise((r) => setTimeout(r, 300));

    expect(server.getObject(appId, 'note', 'tagged1')?.data.tags).toEqual(['work']);
    expect(server.getObject(appId, 'note', 'tagged1')?.version).toBe(1);
    expect(server.getObject(appId, 'note', 'tagged2')?.data.tags).toEqual(['work']);
    expect(server.getObject(appId, 'note', 'tagged2')?.version).toBe(1);
  });
});
