/**
 * T04 Sync Integration Tests
 * Tests the Simperium sync middleware wiring in the store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

vi.setConfig({ testTimeout: 15000 });

describe('T04 Sync Integration', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    // Clean up: stop stores first, then server
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
  });

  it('1: server seeded with 3 notes → store receives all 3 via sync', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed server with 3 notes (using correct Note structure)
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'Content 1',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Content 2',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note3',
        data: {
          content: 'Content 3',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    // Create store with sync config (fast debounce for tests)
    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Wait for notes to load
    await waitForNotes(store, 5000);

    // Verify notes are in state
    const state = store.getState();
    const notes = state.data.notes;
    expect(notes instanceof Map).toBe(true);
    expect(notes.size).toBe(3);
    expect(notes.get('note1' as never)?.content).toBe('Content 1');
    expect(notes.get('note2' as never)?.content).toBe('Content 2');
    expect(notes.get('note3' as never)?.content).toBe('Content 3');
  });

  it('2: dispatching EDIT_NOTE updates the server', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed server with 1 note
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

    // Create store with sync config (fast debounce for tests)
    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Wait for initial sync
    await waitForNotes(store, 5000);

    // Edit the note
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'Updated Content' },
    });

    // Wait for server to receive the update (fast debounce, so 500ms is enough)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify server has the updated content
    const object = server.getObject(appId, 'note', 'note1');
    expect(object).toBeDefined();
    expect(object?.data.content).toBe('Updated Content');
  });

  it('3: a second store receives edits from the first via REMOTE_NOTE_UPDATE', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed server with 1 note
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

    // Create first store (fast debounce for tests)
    const store1 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Create second store (fast debounce for tests)
    const store2 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Wait for initial sync
    await waitForNotes(store1, 5000);
    await waitForNotes(store2, 5000);

    // Edit from first store
    store1.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'Updated by Store 1' },
    });

    // Wait for second store to receive the update (fast debounce, so 500ms is enough)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify second store has the update
    const state2 = store2.getState();
    expect(state2.data.notes.get('note1' as never)?.content).toBe('Updated by Store 1');
  });

  it('4: TRASH_NOTE then DELETE_NOTE_FOREVER removes the object from server', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed server with 1 note
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'To Delete',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    // Create store (fast debounce for tests)
    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Wait for initial sync
    await waitForNotes(store, 5000);

    // Trash the note
    store.dispatch({
      type: 'TRASH_NOTE',
      noteId: 'note1' as never,
    });

    // Wait for server to receive trash (fast debounce, so 300ms is enough)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Delete forever
    store.dispatch({
      type: 'DELETE_NOTE_FOREVER',
      noteId: 'note1' as never,
    });

    // Wait for server to receive delete (fast debounce, so 500ms is enough)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify note is removed from server
    const object = server.getObject(appId, 'note', 'note1');
    expect(object).toBeUndefined();
  });

  it('5: bad token → no crash occurs', async () => {
    const appId = 'test-app';
    const token = 'bad-token'; // Invalid token
    const username = 'test@example.com';

    // Create store with bad token (fast debounce for tests)
    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

    // Verify the store was created
    expect(store).toBeDefined();

    // Wait a bit for auth to fail (fast debounce, so 500ms is enough)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Ensure no crash occurred
    const state = store.getState();
    expect(state).toBeDefined();
  });
});
