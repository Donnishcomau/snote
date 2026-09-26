/**
 * T55: Conflict merge and unknown fields against the fake server.
 * Proves the real sync engine merges a remote edit with an unsent local
 * edit, and that unknown fields / system tags survive a local edit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes, type State } from '../../src/core/store';
import type { Store } from 'redux';

type TestStore = Store<State, never> & {
  dispatch: (action: unknown) => unknown;
  getState: () => State;
};

const appId = 'test-app';
const token = 'test-token';
const username = 'test@example.com';

let server: FakeSimperiumServer;

beforeEach(async () => {
  server = new FakeSimperiumServer();
  await server.start();
});

afterEach(async () => {
  // Clean up: let stores settle, then stop the server (as in sync.test.ts)
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      server.stop();
      resolve();
    }, 100);
  });
});

function makeSyncStore(noteEditDelayMs: number): TestStore {
  return makeStore({
    sync: {
      appId,
      token,
      username,
      clientOptions: { url: server.url },
      noteEditDelayMs,
    },
  }) as unknown as TestStore;
}

function serverNote1(): Record<string, unknown> {
  return server.getObject('test-app', 'note', 'note1')!.data;
}

function storeNote1(store: TestStore): Record<string, unknown> {
  return store.getState().data.notes.get('note1' as never) as unknown as Record<string, unknown>;
}

async function until(cond: () => boolean): Promise<boolean> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}

describe('T55 Conflict merge and unknown fields', () => {
  it("1: WHEN EDIT_NOTE sets the local content and, right after, serverChange sets the remote content THEN within 2 s store note1 has the content 'alpha LOCAL\\nbeta REMOTE\\n' (it was 'alpha LOCAL\\nbeta\\n' right after the edit)", async () => {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        version: 1,
        data: {
          content: 'alpha\nbeta\n',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    const store = makeSyncStore(800);
    await waitForNotes(store, 2500);

    // Local edit stays unsent for noteEditDelayMs (800ms)
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'alpha LOCAL\nbeta\n' },
    });

    // Right after the edit, the store holds only the local change
    expect(storeNote1(store).content).toBe('alpha LOCAL\nbeta\n');

    // The server-side change arrives while the local edit is still unsent
    const remote = { ...serverNote1(), content: 'alpha\nbeta REMOTE\n' };
    server.serverChange('note', 'note1', remote as never);

    // Within 2s the client merges both edits
    const merged = await until(
      () => storeNote1(store)?.content === 'alpha LOCAL\nbeta REMOTE\n'
    );
    expect(merged).toBe(true);
    expect(storeNote1(store).content).toBe('alpha LOCAL\nbeta REMOTE\n');
  });

  it("2: WHEN the same two steps ran THEN within 2.5 s server note1 has the content 'alpha LOCAL\\nbeta REMOTE\\n', and its systemTags still equal []", async () => {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        version: 1,
        data: {
          content: 'alpha\nbeta\n',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    const store = makeSyncStore(800);
    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'alpha LOCAL\nbeta\n' },
    });

    const remote = { ...serverNote1(), content: 'alpha\nbeta REMOTE\n' };
    server.serverChange('note', 'note1', remote as never);

    // Within 2.5s the server holds the merged content, sent by the client itself
    const merged = await until(
      () =>
        serverNote1()?.content === 'alpha LOCAL\nbeta REMOTE\n' &&
        JSON.stringify(serverNote1()?.systemTags) === JSON.stringify([])
    );
    expect(merged).toBe(true);
    expect(serverNote1().content).toBe('alpha LOCAL\nbeta REMOTE\n');
    expect(serverNote1().systemTags).toEqual([]);
  });

  it("3: WHEN the note with foo and weird gets EDIT_NOTE with the content 'new text' THEN within 2 s server note1 has the content 'new text', foo equal to bar and weird in systemTags, and store note1 still has foo bar", async () => {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        version: 1,
        data: {
          content: 'old text',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: ['pinned', 'weird'],
          tags: [],
          foo: 'bar',
        } as never,
      },
    ]);

    const store = makeSyncStore(10);
    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'new text' },
    });

    const sent = await until(
      () =>
        serverNote1()?.content === 'new text' &&
        serverNote1()?.foo === 'bar' &&
        JSON.stringify(serverNote1()?.systemTags).includes('weird')
    );
    expect(sent).toBe(true);
    expect(serverNote1().content).toBe('new text');
    expect(serverNote1().foo).toBe('bar');
    expect(serverNote1().systemTags).toContain('weird');
    expect(storeNote1(store).foo).toBe('bar');
  });

  it("4: WHEN the same note gets PIN_NOTE with shouldPin: false THEN within 2 s server note1 went from systemTags ['pinned', 'weird'] to ['weird'], and its content is still 'old text' and foo still bar", async () => {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        version: 1,
        data: {
          content: 'old text',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: ['pinned', 'weird'],
          tags: [],
          foo: 'bar',
        } as never,
      },
    ]);

    const store = makeSyncStore(10);
    await waitForNotes(store, 2500);

    // The note starts out pinned, both on the server and in the store
    expect(serverNote1().systemTags).toEqual(['pinned', 'weird']);
    expect(storeNote1(store).systemTags).toEqual(['pinned', 'weird']);

    store.dispatch({
      type: 'PIN_NOTE',
      noteId: 'note1' as never,
      shouldPin: false,
    });

    const unpinned = await until(
      () =>
        JSON.stringify(serverNote1()?.systemTags) === JSON.stringify(['weird']) &&
        serverNote1()?.content === 'old text' &&
        serverNote1()?.foo === 'bar'
    );
    expect(unpinned).toBe(true);
    expect(serverNote1().systemTags).toEqual(['weird']);
    expect(serverNote1().content).toBe('old text');
    expect(serverNote1().foo).toBe('bar');
  });

  it("5: WHEN serverChange adds extra: 42 to the same note and, once store note1 has extra, EDIT_NOTE sets the content 'after extra' THEN within 2 s server note1 has the content 'after extra', and extra is 42 on the server and in the store", async () => {
    const now = Date.now();
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        version: 1,
        data: {
          content: 'old text',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: ['pinned', 'weird'],
          tags: [],
          foo: 'bar',
        } as never,
      },
    ]);

    const store = makeSyncStore(10);
    await waitForNotes(store, 2500);

    server.serverChange('note', 'note1', { ...serverNote1(), extra: 42 } as never);

    // Wait until the unknown field landed in the store
    const gotExtra = await until(() => storeNote1(store)?.extra === 42);
    expect(gotExtra).toBe(true);

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'after extra' },
    });

    const kept = await until(
      () => serverNote1()?.content === 'after extra' && serverNote1()?.extra === 42
    );
    expect(kept).toBe(true);
    expect(serverNote1().content).toBe('after extra');
    expect(serverNote1().extra).toBe(42);
    expect(storeNote1(store).extra).toBe(42);
  });
});
