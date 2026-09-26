/**
 * T14 Offline edits are queued and sent when the network is back.
 * Proves with the real sync engine and the fake server (docs/EVALS.md scenario 4)
 * that edits made while navigator.onLine is false stay local and are sent,
 * oldest first, once an 'online' event fires on window.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

const appId = 'test-app';

/** Change frames for a note id, in receive order. */
const changeFramesFor = (srv: FakeSimperiumServer, id: string): string[] =>
  srv.received.filter((m) => m.includes(':c:') && m.includes(`"id":"${id}"`));

/** Set navigator.onLine to false. */
function goOffline(): void {
  (navigator as { onLine: boolean }).onLine = false;
}

/** Set navigator.onLine to true and tell window the machine is back. */
function goOnline(): void {
  (navigator as { onLine: boolean }).onLine = true;
  window.dispatchEvent(new Event('online'));
}

/** Poll a condition every 50 ms, at most 40 times. */
async function pollUntil(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const noteData = (content: string) => ({
  content,
  creationDate: 1_000,
  modificationDate: 1_000,
  deleted: 0,
  systemTags: [],
  tags: [],
});

describe('T14 Offline edits are queued and sent when the network is back', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(appId, 'note', [
      { id: 'a', data: noteData('Original a'), version: 1 },
      { id: 'b', data: noteData('Original b'), version: 1 },
    ]);
  });

  afterEach(async () => {
    (navigator as { onLine: boolean }).onLine = true;
    // Let in-flight sync settle, then stop the server (sync.test.ts pattern).
    await sleep(100);
    server.stop();
  });

  const makeSyncedStore = async () => {
    const store = makeStore({
      sync: {
        appId,
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });
    await waitForNotes(store, 2500);
    return store;
  };

  it('1: WHEN goOffline() was called, EDIT_NOTE sets the content of a to "edited offline" and 300 ms pass THEN the store\'s a has the content "edited offline", server a still has "Original a", and there are 0 change frames for a', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a' as never,
      changes: { content: 'edited offline' },
    });

    await sleep(300);

    expect(store.getState().data.notes.get('a' as never)?.content).toBe('edited offline');
    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('Original a');
    expect(changeFramesFor(server, 'a')).toHaveLength(0);
  });

  it('2: WHEN after line 1 goOnline() is called THEN within 2 s server a has the content "edited offline", and the server\'s b still has "Original b"', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a' as never,
      changes: { content: 'edited offline' },
    });
    await sleep(300);

    goOnline();
    await pollUntil(
      () => server.getObject(appId, 'note', 'a')?.data.content === 'edited offline'
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('edited offline');
    expect(server.getObject(appId, 'note', 'b')!.data.content).toBe('Original b');
  });

  it('3: WHEN offline a is edited to "A2" and then b to "B2", and then goOnline() is called THEN within 2 s the server has "A2" and "B2", and in server.received the first change frame for a comes before the first one containing "id":"b"', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a' as never,
      changes: { content: 'A2' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'b' as never,
      changes: { content: 'B2' },
    });

    goOnline();
    await pollUntil(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'A2' &&
        server.getObject(appId, 'note', 'b')?.data.content === 'B2'
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('A2');
    expect(server.getObject(appId, 'note', 'b')!.data.content).toBe('B2');

    const frames = server.received;
    const firstA = frames.findIndex((m) => m.includes(':c:') && m.includes('"id":"a"'));
    const firstB = frames.findIndex((m) => m.includes(':c:') && m.includes('"id":"b"'));
    expect(firstA).toBeGreaterThanOrEqual(0);
    expect(firstB).toBeGreaterThanOrEqual(0);
    expect(firstA).toBeLessThan(firstB);
  });

  it('4: WHEN offline a is edited twice ("first edit", then "second edit") and then goOnline() is called THEN within 2 s server a has the content "second edit" and there is exactly 1 change frame for a', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a' as never,
      changes: { content: 'first edit' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a' as never,
      changes: { content: 'second edit' },
    });

    goOnline();
    await pollUntil(
      () => server.getObject(appId, 'note', 'a')?.data.content === 'second edit'
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('second edit');
    expect(changeFramesFor(server, 'a')).toHaveLength(1);
  });

  it('5: WHEN offline TRASH_NOTE is dispatched for a, and then goOnline() is called THEN server a went from deleted 0 to, within 2 s, a truthy deleted, and its content is still "Original a"', async () => {
    const store = await makeSyncedStore();

    expect(server.getObject(appId, 'note', 'a')!.data.deleted).toBe(0);

    goOffline();
    store.dispatch({ type: 'TRASH_NOTE', noteId: 'a' as never });

    goOnline();
    await pollUntil(() => Boolean(server.getObject(appId, 'note', 'a')?.data.deleted));

    const serverA = server.getObject(appId, 'note', 'a')!;
    expect(serverA.data.deleted).toBeTruthy();
    expect(serverA.data.content).toBe('Original a');
  });
});
