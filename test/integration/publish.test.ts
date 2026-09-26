/**
 * T54 Publish round trip against the fake server
 * Proves with the real sync engine that publishing reaches the server,
 * that the link the service writes back reaches the store, and that
 * unpublishing reaches the server.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes, type State } from '../../src/core/store';
import { publishLink } from '../../src/core/note-keys';

const appId = 'test-app';
const token = 'test-token';
const username = 'test@example.com';

const seedData = (content: string) => ({
  content,
  creationDate: Date.now(),
  deleted: 0,
  modificationDate: Date.now(),
  systemTags: [],
  tags: [],
});

const poll = async (fn: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

const serverData = (server: FakeSimperiumServer) =>
  server.getObject('test-app', 'note', 'note1')!.data;

const storeNote = (store: { getState: () => State }, id: string) =>
  store.getState().data.notes.get(id as never);

describe('T54 Publish round trip against the fake server', () => {
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

  const seedTwoNotes = () => {
    server.seedBucket(appId, 'note', [
      { id: 'note1', data: seedData('Content 1'), version: 1 },
      { id: 'note2', data: seedData('Content 2'), version: 1 },
    ]);
  };

  const makeSyncStore = () =>
    makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10, // OMARCHY: fast debounce for tests
      },
    });

  it('1: WHEN the store dispatches PUBLISH_NOTE for note1 with shouldPublish: true THEN server note1 went from systemTags [] to, within 2 s, containing published, and its content is still Content 1', async () => {
    seedTwoNotes();
    const store = makeSyncStore();
    await waitForNotes(store, 2500);

    expect(serverData(server).systemTags).toEqual([]);

    store.dispatch({
      type: 'PUBLISH_NOTE',
      noteId: 'note1' as never,
      shouldPublish: true,
    });

    await poll(() => {
      const tags = serverData(server).systemTags;
      return Array.isArray(tags) && tags.includes('published');
    });

    expect(serverData(server).systemTags).toContain('published');
    expect(serverData(server).content).toBe('Content 1');
  });

  it('2: WHEN after line 1 the test calls server.serverChange(note, note1, { ...serverData, publishURL: abc123 }) THEN within 2 s publishLink of the store note1 is https://simp.ly/p/abc123 and that note still has published', async () => {
    seedTwoNotes();
    const store = makeSyncStore();
    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'PUBLISH_NOTE',
      noteId: 'note1' as never,
      shouldPublish: true,
    });
    await poll(() => {
      const tags = serverData(server).systemTags;
      return Array.isArray(tags) && tags.includes('published');
    });

    server.serverChange('note', 'note1', {
      ...serverData(server),
      publishURL: 'abc123',
    });

    await poll(() => {
      const note = storeNote(store, 'note1');
      return publishLink(note) === 'https://simp.ly/p/abc123';
    });

    expect(publishLink(storeNote(store, 'note1'))).toBe('https://simp.ly/p/abc123');
    expect(storeNote(store, 'note1')?.systemTags).toContain('published');
  });

  it('3: WHEN after line 2 the test calls serverChange with { ...serverData, systemTags: [], publishURL: abc123 } (unpublished on another device) THEN within 2 s the store note1 has no published and publishLink of it is null', async () => {
    seedTwoNotes();
    const store = makeSyncStore();
    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'PUBLISH_NOTE',
      noteId: 'note1' as never,
      shouldPublish: true,
    });
    await poll(() => {
      const tags = serverData(server).systemTags;
      return Array.isArray(tags) && tags.includes('published');
    });

    server.serverChange('note', 'note1', {
      ...serverData(server),
      publishURL: 'abc123',
    });
    await poll(() => {
      const note = storeNote(store, 'note1');
      return publishLink(note) === 'https://simp.ly/p/abc123';
    });

    server.serverChange('note', 'note1', {
      ...serverData(server),
      systemTags: [],
      publishURL: 'abc123',
    });

    await poll(() => {
      const note = storeNote(store, 'note1');
      return (
        !note?.systemTags?.includes('published') &&
        publishLink(note) === null
      );
    });

    expect(storeNote(store, 'note1')?.systemTags).not.toContain('published');
    expect(publishLink(storeNote(store, 'note1'))).toBeNull();
  });

  it('4: WHEN after line 1 the store dispatches PUBLISH_NOTE with shouldPublish: false THEN within 2 s server note1 has systemTags equal to [] again, and no frame in server.received that contains :c: also contains "id":"note2"', async () => {
    seedTwoNotes();
    const store = makeSyncStore();
    await waitForNotes(store, 2500);

    store.dispatch({
      type: 'PUBLISH_NOTE',
      noteId: 'note1' as never,
      shouldPublish: true,
    });
    await poll(() => {
      const tags = serverData(server).systemTags;
      return Array.isArray(tags) && tags.includes('published');
    });

    store.dispatch({
      type: 'PUBLISH_NOTE',
      noteId: 'note1' as never,
      shouldPublish: false,
    });

    await poll(() => {
      const tags = serverData(server).systemTags;
      return Array.isArray(tags) && tags.length === 0;
    });

    expect(serverData(server).systemTags).toEqual([]);
    for (const frame of server.received) {
      if (frame.includes(':c:')) {
        expect(frame).not.toContain('"id":"note2"');
      }
    }
  });
});
