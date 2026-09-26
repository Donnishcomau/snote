/**
 * T58 Note history against the fake server
 * Proves with the real sync engine that a note's versions are fetched from
 * the server and that restoring one creates a new version there.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { ActionType } from '@vendor/state/action-types';
import { revisionsOf, restoreRevisionAction } from '../../src/core/history';

const appId = 'test-app';
const token = 'test-token';
const username = 'test@example.com';

const now = Math.floor(Date.now() / 1000);

let server: FakeSimperiumServer;

beforeEach(async () => {
  server = new FakeSimperiumServer();
  await server.start();
});

afterEach(async () => {
  // Clean up: let in-flight messages settle, then stop the server (100 ms, as in sync.test.ts)
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      server.stop();
      resolve();
    }, 100);
  });
});

/** Poll cond up to 40 times, 50 ms apart (~2 s). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
}

const serverVersion = (id: string): number =>
  server.getObject(appId, 'note', id)?.version ?? -1;

const serverContent = (id: string): unknown =>
  server.getObject(appId, 'note', id)?.data.content;

/**
 * Seed two notes, connect a store, edit note1 twice so the server holds
 * versions 1 (First draft), 2 (Second draft) and 3 (Third draft).
 */
async function makeHistory(): Promise<{
  store: Store<State, ActionType> & { stopSync?: () => void; forceSync?: () => void };
}> {
  server.seedBucket(appId, 'note', [
    {
      id: 'note1',
      data: {
        content: 'First draft',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
      version: 1,
    },
    {
      id: 'note2',
      data: {
        content: 'Other note',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
      version: 1,
    },
  ]);

  const store = makeStore({
    sync: {
      appId,
      token,
      username,
      clientOptions: { url: server.url },
      noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
    },
  });

  await waitForNotes(store, 2500);

  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: 'note1' as never,
    changes: { content: 'Second draft' },
  });
  await until(() => serverVersion('note1') === 2);

  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: 'note1' as never,
    changes: { content: 'Third draft' },
  });
  await until(() => serverVersion('note1') === 3);

  // The client must have stored the acknowledgement before it is asked for revisions
  await new Promise((r) => setTimeout(r, 150));

  return { store };
}

/** "open X": OPEN_NOTE for X, then REVISIONS_TOGGLE (exactly once per test). */
function openNote(store: Store<State, ActionType>, noteId: string): void {
  store.dispatch({ type: 'OPEN_NOTE', noteId: noteId as never });
  store.dispatch({ type: 'REVISIONS_TOGGLE' });
}

describe('T58 Note history against the fake server', () => {
  it('1: WHEN note1 is opened THEN within 2 s revisionsOf for note1 has the versions [3, 2, 1], version 1 has the content First draft, and server.received has a message containing e:note1.1', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note1');

    await until(() => revisionsOf(store.getState(), 'note1' as never).length === 3);
    const revs = revisionsOf(store.getState(), 'note1' as never);

    expect(revs.map((r) => r.version)).toEqual([3, 2, 1]);
    const version1 = revs.find((r) => r.version === 1);
    expect(version1?.note.content).toBe('First draft');
    expect(server.received.some((m) => m.includes('e:note1.1'))).toBe(true);
  });

  it('2: WHEN note1 is opened and its 3 versions are there THEN revisionsOf for note2 has length 0 and no message in server.received contains e:note2', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note1');

    await until(() => revisionsOf(store.getState(), 'note1' as never).length === 3);
    expect(revisionsOf(store.getState(), 'note1' as never).map((r) => r.version)).toEqual([3, 2, 1]);

    expect(revisionsOf(store.getState(), 'note2' as never).length).toBe(0);
    expect(server.received.some((m) => m.includes('e:note2'))).toBe(false);
  });

  it('3: WHEN note2 (one version, never edited) is opened THEN within 2 s revisionsOf for note2 has the versions [1] and that entry has the content Other note', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note2');

    await until(() => revisionsOf(store.getState(), 'note2' as never).length === 1);
    const revs = revisionsOf(store.getState(), 'note2' as never);

    expect(revs.map((r) => r.version)).toEqual([1]);
    expect(revs[0].note.content).toBe('Other note');
  });

  it('4: WHEN after line 1 steps restoreRevisionAction(store.getState(), note1, 1) is dispatched THEN within 2 s the server note1 goes from Third draft (version 3) to First draft with version 4', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note1');
    await until(() => revisionsOf(store.getState(), 'note1' as never).length === 3);

    expect(serverContent('note1')).toBe('Third draft');
    expect(serverVersion('note1')).toBe(3);

    const action = restoreRevisionAction(store.getState(), 'note1' as never, 1);
    expect(action).not.toBeNull();
    store.dispatch(action as never);

    await until(() => serverVersion('note1') === 4 && serverContent('note1') === 'First draft');
    expect(serverContent('note1')).toBe('First draft');
    expect(serverVersion('note1')).toBe(4);
  });

  it('5: WHEN line 4 restore has reached the server THEN the store note1 has the content First draft, the server note2 still has Other note and version 1, and data.notes.size is 2', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note1');
    await until(() => revisionsOf(store.getState(), 'note1' as never).length === 3);

    const action = restoreRevisionAction(store.getState(), 'note1' as never, 1);
    store.dispatch(action as never);
    await until(() => serverVersion('note1') === 4 && serverContent('note1') === 'First draft');

    expect(store.getState().data.notes.get('note1' as never)?.content).toBe('First draft');
    expect(serverContent('note2')).toBe('Other note');
    expect(serverVersion('note2')).toBe(1);
    expect(store.getState().data.notes.size).toBe(2);
  });

  it('6: WHEN after line 1 steps restoreRevisionAction(store.getState(), note1, 9) is called THEN it returns null, and 300 ms later the server note1 is still at version 3 with the content Third draft', async () => {
    const { store } = await makeHistory();
    openNote(store, 'note1');
    await until(() => revisionsOf(store.getState(), 'note1' as never).length === 3);

    const action = restoreRevisionAction(store.getState(), 'note1' as never, 9);
    expect(action).toBeNull();

    await new Promise((r) => setTimeout(r, 300));
    expect(serverVersion('note1')).toBe(3);
    expect(serverContent('note1')).toBe('Third draft');
  });
});
