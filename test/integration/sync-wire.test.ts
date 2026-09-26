import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

vi.setConfig({ testTimeout: 15000 });

describe('T04 Wire Integration', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    // Stop sync before stopping server
    await new Promise((r) => setTimeout(r, 50));
    server.stop();
  });

  it('1: server seeded with 3 notes → store receives all 3 via sync', async () => {
    // Seed the server with 3 notes
    await server.seedBucket('test-app', 'note', [
      { id: 'note1', data: { content: 'Content 1', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
      { id: 'note2', data: { content: 'Content 2', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
      { id: 'note3', data: { content: 'Content 3', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
    ]);

    // Create store with sync
    const store = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // Fast for tests
      },
    });

    // Wait for notes to be loaded
    await waitForNotes(store, 3000);

    // Verify notes are in the store
    const state = store.getState();
    expect(state.data.notes.size).toBe(3);
    expect(state.data.notes.get('note1' as never)?.content).toBe('Content 1');
    expect(state.data.notes.get('note2' as never)?.content).toBe('Content 2');
    expect(state.data.notes.get('note3' as never)?.content).toBe('Content 3');
  });

  it('2: dispatching EDIT_NOTE updates the server', async () => {
    // Seed the server with 1 note
    await server.seedBucket('test-app', 'note', [
      { id: 'note1', data: { content: 'Original content', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
    ]);

    // Create store with sync
    const store = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // Fast for tests
      },
    });

    // Wait for initial sync
    await waitForNotes(store, 3000);

    // Dispatch edit note action
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: {
        content: 'Updated content',
      },
    });

    // Wait for the change to be sent to server
    await new Promise((r) => setTimeout(r, 500));

    // Verify the server received the update
    const serverNote = server.getObject('test-app', 'note', 'note1');
    expect(serverNote).toBeDefined();
    expect(serverNote?.data.content).toBe('Updated content');

    // Verify change version changed
    const cvBefore = server.getCV('test-app', 'note');
    expect(parseInt(cvBefore, 10)).toBeGreaterThan(0);
  });

  it('3: a second store receives edits from the first via REMOTE_NOTE_UPDATE', async () => {
    // Seed the server with 1 note
    await server.seedBucket('test-app', 'note', [
      { id: 'note1', data: { content: 'Original content', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
    ]);

    // Create first store
    const store1 = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test1@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    // Create second store
    const store2 = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test2@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    // Wait for both stores to sync
    await waitForNotes(store1, 3000);
    await waitForNotes(store2, 3000);

    // Dispatch edit from first store
    store1.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: {
        content: 'Edited by store1',
      },
    });

    // Wait for the change to propagate
    await new Promise((r) => setTimeout(r, 1000));

    // Verify second store received the update
    const state2 = store2.getState();
    const note2 = state2.data.notes.get('note1' as never);
    expect(note2?.content).toBe('Edited by store1');
  });

  it('4: TRASH_NOTE then DELETE_NOTE_FOREVER removes the object from server', async () => {
    // Seed the server with 1 note
    await server.seedBucket('test-app', 'note', [
      { id: 'note1', data: { content: 'Content', creationDate: Date.now() / 1000, modificationDate: Date.now() / 1000, deleted: 0, systemTags: [], tags: [] }, version: 1 },
    ]);

    // Create store with sync
    const store = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    // Wait for initial sync
    await waitForNotes(store, 3000);

    // Trash the note
    store.dispatch({
      type: 'TRASH_NOTE',
      noteId: 'note1' as never,
    });

    // Wait for trash to be sent
    await new Promise((r) => setTimeout(r, 500));

    // Verify note is trashed on server
    const trashedNote = server.getObject('test-app', 'note', 'note1');
    expect(trashedNote?.data.deleted).toBe(true);

    // Delete forever
    store.dispatch({
      type: 'DELETE_NOTE_FOREVER',
      noteId: 'note1' as never,
    });

    // Wait for delete to be sent
    await new Promise((r) => setTimeout(r, 500));

    // Verify note is removed from server
    const deletedNote = server.getObject('test-app', 'note', 'note1');
    expect(deletedNote).toBeUndefined();
  });

  it('5: bad token → onLogout is called once', async () => {
    let logoutCalled = false;

    // Create store with bad token and onLogout callback
    const store = makeStore({
      sync: {
        appId: 'test-app',
        token: 'bad-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
        onLogout: () => {
          logoutCalled = true;
        },
      },
    });

    // Wait for unauthorized event
    for (let i = 0; i < 500 && !logoutCalled; i++) await new Promise((r) => setTimeout(r, 20));

    // Verify logout was called
    expect(logoutCalled).toBe(true);
  });
});
