/**
 * T64 Fake server: a new object from a client is stored
 * Tests that the fake server can handle new object creation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from './server';
import { makeStore, waitForNotes } from '../../src/core/store';

vi.setConfig({ testTimeout: 15000 });

describe('T64 Server Create', () => {
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

  it('1: WHEN a connected store dispatches CREATE_NOTE_WITH_ID with noteId: new1 and note: { content: hello } THEN within 2 s server.getObject(test-app, note, new1) has version 1 and data.content hello', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed one note so waitForNotes resolves
    server.seedBucket(appId, 'note', [
      {
        id: 'seed1',
        data: {
          content: 'seed content',
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

    // Create a new note
    const noteId = 'new1' as never;
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId,
      note: {
        content: 'hello',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
    });

    // Poll for server to receive the new object
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const object = server.getObject(appId, 'note', 'new1');
      if (object?.version === 1 && object?.data.content === 'hello') {
        found = true;
      }
    }

    const object = server.getObject(appId, 'note', 'new1');
    expect(object).toBeDefined();
    expect(object?.version).toBe(1);
    expect(object?.data.content).toBe('hello');
  });

  it('2: WHEN the same store then dispatches EDIT_NOTE with changes: { content: hello again } for new1 THEN within 2 s the server object has version 2 and that content', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed one note so waitForNotes resolves
    server.seedBucket(appId, 'note', [
      {
        id: 'seed1',
        data: {
          content: 'seed content',
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

    // Create a new note
    const noteId = 'new1' as never;
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId,
      note: {
        content: 'hello',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
    });

    // Wait for the new note to be created on server
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const object = server.getObject(appId, 'note', 'new1');
      if (object?.version === 1) {
        found = true;
      }
    }

    // Edit the note
    store.dispatch({
      type: 'EDIT_NOTE' as never,
      noteId,
      changes: { content: 'hello again' },
    });

    // Poll for server to receive the edit
    found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const object = server.getObject(appId, 'note', 'new1');
      if (object?.version === 2 && object?.data.content === 'hello again') {
        found = true;
      }
    }

    const object = server.getObject(appId, 'note', 'new1');
    expect(object).toBeDefined();
    expect(object?.version).toBe(2);
    expect(object?.data.content).toBe('hello again');
  });

  it('3: WHEN a second store was connected before the first one creates new1 THEN within 2 s the second store data.notes.get(new1).content is hello', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed one note so waitForNotes resolves
    server.seedBucket(appId, 'note', [
      {
        id: 'seed1',
        data: {
          content: 'seed content',
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

    // Create a new note from first store
    const noteId = 'new1' as never;
    store1.dispatch({
      type: 'CREATE_NOTE_WITH_ID' as never,
      noteId,
      note: {
        content: 'hello',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
    });

    // Poll for second store to receive the new note
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const content = store2.getState().data.notes.get('new1' as never)?.content;
      if (content === 'hello') {
        found = true;
      }
    }

    const content = store2.getState().data.notes.get('new1' as never)?.content;
    expect(content).toBe('hello');
  });
});
