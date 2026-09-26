/**
 * T157 Trash round trip on the wire: restore online; create, restore and
 * delete forever while offline.
 * Proves with the real sync engine and the fake server (docs/EVALS.md
 * scenarios 3 and 4) that RESTORE_NOTE reaches the server online, and that
 * create/restore/delete-forever behave correctly while offline.
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

describe('T157 Trash round trip on the wire', () => {
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

  it('1: WHEN online TRASH_NOTE for a has reached the server (version 2, deleted truthy) and then RESTORE_NOTE for a is dispatched THEN within 2 s server a has version 3, a deleted that is falsy, and still "Original a"; server b still has version 1', async () => {
    const store = await makeSyncedStore();

    store.dispatch({ type: 'TRASH_NOTE', noteId: 'a' as never });
    await pollUntil(() => {
      const a = server.getObject(appId, 'note', 'a');
      return a?.version === 2 && Boolean(a.data.deleted);
    });

    store.dispatch({ type: 'RESTORE_NOTE', noteId: 'a' as never });
    await pollUntil(() => {
      const a = server.getObject(appId, 'note', 'a');
      return a?.version === 3 && !a.data.deleted && a.data.content === 'Original a';
    });

    const serverA = server.getObject(appId, 'note', 'a')!;
    expect(serverA.version).toBe(3);
    expect(serverA.data.deleted).toBeFalsy();
    expect(serverA.data.content).toBe('Original a');
    expect(server.getObject(appId, 'note', 'b')!.version).toBe(1);
  });

  it('2: WHEN offline CREATE_NOTE_WITH_ID for new1 with the content "made offline" is dispatched THEN 300 ms later there are 0 change frames for new1 and the server has no new1; after goOnline() within 2 s server new1 has version 1 and "made offline"', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId: 'new1' as never,
      note: {
        content: 'made offline',
        creationDate: 1_000,
        modificationDate: 1_000,
        deleted: 0,
        systemTags: [],
        tags: [],
      },
    } as never);

    await sleep(300);

    expect(changeFramesFor(server, 'new1')).toHaveLength(0);
    expect(server.getObject(appId, 'note', 'new1')).toBeUndefined();

    goOnline();
    await pollUntil(() => {
      const new1 = server.getObject(appId, 'note', 'new1');
      return new1?.version === 1 && new1.data.content === 'made offline';
    });

    const serverNew1 = server.getObject(appId, 'note', 'new1')!;
    expect(serverNew1.version).toBe(1);
    expect(serverNew1.data.content).toBe('made offline');
  });

  it('3: WHEN a was trashed online (server version 2), then offline RESTORE_NOTE for a is dispatched THEN after 300 ms server a still has version 2; after goOnline() within 2 s it has version 3 and a deleted that is not truthy', async () => {
    const store = await makeSyncedStore();

    store.dispatch({ type: 'TRASH_NOTE', noteId: 'a' as never });
    await pollUntil(() => {
      const a = server.getObject(appId, 'note', 'a');
      return a?.version === 2 && Boolean(a.data.deleted);
    });

    goOffline();
    store.dispatch({ type: 'RESTORE_NOTE', noteId: 'a' as never });

    await sleep(300);

    expect(server.getObject(appId, 'note', 'a')!.version).toBe(2);

    goOnline();
    await pollUntil(() => {
      const a = server.getObject(appId, 'note', 'a');
      return a?.version === 3 && !a.data.deleted;
    });

    const serverA = server.getObject(appId, 'note', 'a')!;
    expect(serverA.version).toBe(3);
    expect(serverA.data.deleted).toBeFalsy();
  });

  it('4: WHEN a was trashed online, then offline DELETE_NOTE_FOREVER for a is dispatched and goOnline() is called THEN within 2 s getObject for a is undefined, the store\'s data.notes has no a, and server b still has version 1 and the content "Original b"', async () => {
    const store = await makeSyncedStore();

    store.dispatch({ type: 'TRASH_NOTE', noteId: 'a' as never });
    await pollUntil(() => {
      const a = server.getObject(appId, 'note', 'a');
      return a?.version === 2 && Boolean(a.data.deleted);
    });

    goOffline();
    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'a' as never });
    goOnline();

    await pollUntil(() => {
      const gone = server.getObject(appId, 'note', 'a') === undefined;
      const outOfStore = !store.getState().data.notes.has('a' as never);
      const b = server.getObject(appId, 'note', 'b');
      return (
        gone &&
        outOfStore &&
        b?.version === 1 &&
        b.data.content === 'Original b'
      );
    });

    expect(server.getObject(appId, 'note', 'a')).toBeUndefined();
    expect(store.getState().data.notes.has('a' as never)).toBe(false);
    const serverB = server.getObject(appId, 'note', 'b')!;
    expect(serverB.version).toBe(1);
    expect(serverB.data.content).toBe('Original b');
  });

  it('5: WHEN offline new1 is created with "first text" and then EDIT_NOTE sets it to "second text" THEN 300 ms later there are 0 change frames for new1; after goOnline() within 2 s server new1 has the content "second text" and server a still has version 1', async () => {
    const store = await makeSyncedStore();

    goOffline();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId: 'new1' as never,
      note: {
        content: 'first text',
        creationDate: 1_000,
        modificationDate: 1_000,
        deleted: 0,
        systemTags: [],
        tags: [],
      },
    } as never);
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'new1' as never,
      changes: { content: 'second text' },
    });

    await sleep(300);

    expect(changeFramesFor(server, 'new1')).toHaveLength(0);

    goOnline();
    await pollUntil(() => {
      const new1 = server.getObject(appId, 'note', 'new1');
      return (
        new1?.data.content === 'second text' &&
        server.getObject(appId, 'note', 'a')?.version === 1
      );
    });

    expect(server.getObject(appId, 'note', 'new1')!.data.content).toBe(
      'second text'
    );
    expect(server.getObject(appId, 'note', 'a')!.version).toBe(1);
  });
});
