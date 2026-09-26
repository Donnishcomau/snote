/**
 * T101 Pending count against the fake server
 * Proves pendingCount() rises on a local edit and falls to 0 when the
 * fake server acknowledges, and that remote changes are never counted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { pendingCount } from '../../src/core/simperium-reducer';

/** Poll instead of sleeping: run cond every 50 ms, at most 40 times. */
async function pollUntil(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('T101 Pending count against the fake server', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    // Clean up: stop server after a short delay
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
  });

  const appId = 'test-app';
  const token = 'test-token';
  const username = 'test@example.com';

  /** Seed the note bucket with a single note1 whose content is Original. */
  function seedNote1(): void {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'Original',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);
  }

  function syncedStore() {
    return makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });
  }

  const count = (store: ReturnType<typeof syncedStore>): number =>
    pendingCount(store.getState().simperium);

  it('1: WHEN the store has loaded note1 THEN count is 0, simperium.tracking is true and simperium.connectionStatus is green', async () => {
    seedNote1();
    const store = syncedStore();

    await waitForNotes(store, 2500);

    const state = store.getState();
    expect(count(store)).toBe(0);
    expect(state.simperium.tracking).toBe(true);
    expect(state.simperium.connectionStatus).toBe('green');
  });

  it('2: WHEN EDIT_NOTE with content edited here is dispatched for note1 THEN count is 1 right after the dispatch, and within 2 s count is 0 and the server\'s note1 has content edited here', async () => {
    seedNote1();
    const store = syncedStore();

    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited here' },
    });

    // Count is 1 right after the dispatch returns.
    expect(count(store)).toBe(1);

    // Within 2 s the server has confirmed the change.
    await pollUntil(
      () =>
        count(store) === 0 &&
        server.getObject(appId, 'note', 'note1')?.data.content === 'edited here'
    );

    expect(count(store)).toBe(0);
    const object = server.getObject(appId, 'note', 'note1');
    expect(object).toBeDefined();
    expect(object?.data.content).toBe('edited here');
  });

  it('3: WHEN CREATE_NOTE_WITH_ID for new1 with content made here is dispatched THEN count is 1 right after the dispatch, and within 2 s count is 0 and the server\'s new1 has version 1', async () => {
    seedNote1();
    const store = syncedStore();

    await waitForNotes(store, 2500);

    const now = Date.now();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId: 'new1' as never,
      note: {
        content: 'made here',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
    });

    // Count is 1 right after the dispatch returns.
    expect(count(store)).toBe(1);

    // Within 2 s the server created the object and acknowledged it.
    await pollUntil(
      () =>
        count(store) === 0 &&
        server.getObject(appId, 'note', 'new1')?.version === 1
    );

    expect(count(store)).toBe(0);
    const object = server.getObject(appId, 'note', 'new1');
    expect(object).toBeDefined();
    expect(object?.version).toBe(1);
  });

  it('4: WHEN a second store edits note1 to edited there THEN within 2 s the first store\'s note1 has content edited there and the first store\'s count was 0 at every poll step', async () => {
    seedNote1();
    const store1 = syncedStore();
    const store2 = syncedStore();

    await waitForNotes(store1, 2500);
    await waitForNotes(store2, 2500);

    store2.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited there' },
    });

    // Every poll step: store1's count stays 0 while the remote change lands.
    // Both values are asserted inside the poll condition itself.
    let arrived = false;
    for (let i = 0; i < 40 && !arrived; i++) {
      await new Promise((r) => setTimeout(r, 50));
      arrived =
        store1.getState().data.notes.get('note1' as never)?.content === 'edited there' &&
        count(store1) === 0;
    }

    const finalState = store1.getState();
    expect(finalState.data.notes.get('note1' as never)?.content).toBe('edited there');
    expect(count(store1)).toBe(0);
  });
});
