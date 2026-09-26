/**
 * T65: Fake server routes messages per-channel, not just the first channel
 * on a connection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

vi.setConfig({ testTimeout: 15000 });

describe('T65 Server Channel Routing', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
  });

  /**
   * 1: WHEN the server is seeded with the tag `home` and a store connects
   *    THEN within 2 s `store.getState().data.tags.get('home').name` is `home`.
   */
  it('1: seeded tag home syncs into a connected store', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Seed server with a tag on the tag bucket
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'hello',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);
    server.seedBucket(appId, 'tag', [
      {
        id: 'home',
        data: { name: 'home' },
        version: 1,
      },
    ]);

    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    // Poll for the tag to appear
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const state = store.getState();
      const tag = state.data.tags.get('home' as never);
      if (tag && tag.name === 'home') {
        found = true;
      }
    }

    expect(found).toBe(true);
    const state = store.getState();
    expect(state.data.tags.get('home' as never)?.name).toBe('home');
  });

  /**
   * 2: WHEN a connected store dispatches ADD_NOTE_TAG with tagName: 'work' for note1
   *    THEN within 2 s `server.getObject('test-app', 'tag', 'work').data.name` is `work`
   *    and the server's note1 has `tags` equal to `['work']`.
   */
  it('2: ADD_NOTE_TAG creates a tag object on the server', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'hello',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    const store = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    await waitForNotes(store, 3000);

    // Dispatch ADD_NOTE_TAG for a tag that doesn't exist yet
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: 'note1' as never,
      tagName: 'work' as never,
    });

    // Poll for the tag to appear on the server
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const tagObj = server.getObject(appId, 'tag', 'work');
      const noteObj = server.getObject(appId, 'note', 'note1');
      if (
        tagObj &&
        (tagObj.data as { name?: string }).name === 'work' &&
        noteObj &&
        Array.isArray((noteObj.data as { tags?: string[] }).tags) &&
        (noteObj.data as { tags?: string[] }).tags.includes('work')
      ) {
        found = true;
      }
    }

    expect(found).toBe(true);
    const tagObj = server.getObject(appId, 'tag', 'work');
    expect(tagObj?.data).toEqual({ name: 'work' });
    const noteObj = server.getObject(appId, 'note', 'note1');
    expect((noteObj?.data as { tags?: string[] }).tags).toContain('work');
  });

  /**
   * 3: WHEN a second store was connected before that dispatch
   *    THEN within 2 s its `data.tags.get('work').name` is `work`
   *    and its note1 has `tags` equal to `['work']`.
   */
  it('3: second store receives broadcast of new tag via its channel', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'hello',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    // First store connects
    const store1 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });
    await waitForNotes(store1, 3000);

    // Second store connects (same socket, different channel for tags)
    const store2 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    // Now dispatch ADD_NOTE_TAG from store1
    store1.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: 'note1' as never,
      tagName: 'work' as never,
    });

    // Poll for the tag to appear in store2
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const state = store2.getState();
      const tag = state.data.tags.get('work' as never);
      const note = state.data.notes.get('note1' as never);
      if (
        tag &&
        tag.name === 'work' &&
        note &&
        Array.isArray(note.tags) &&
        note.tags.includes('work' as never)
      ) {
        found = true;
      }
    }

    expect(found).toBe(true);
    const state = store2.getState();
    expect(state.data.tags.get('work' as never)?.name).toBe('work');
    const note = state.data.notes.get('note1' as never);
    expect(note?.tags).toContain('work');
  });
});
