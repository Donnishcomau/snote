/**
 * T51 Fake server: serverChange - a change that comes from the server
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';

describe('T51 serverChange', () => {
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

  it('1: WHEN serverChange updates content THEN the store receives it', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const noteData = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data: noteData, version: 1 },
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

    await waitForNotes(store, 2500);

    server.serverChange('note', 'note1', { ...noteData, content: 'from server' });

    await poll(() => {
      const note = store.getState().data.notes.get('note1' as never);
      return note?.content === 'from server';
    });

    expect(store.getState().data.notes.get('note1' as never)?.content).toBe('from server');
  });

  it('2: WHEN serverChange returns THEN return value is 2 and server object has version 2', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const noteData = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data: noteData, version: 1 },
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

    await waitForNotes(store, 2500);

    const result = server.serverChange('note', 'note1', { ...noteData, content: 'from server' });

    expect(result).toBe(2);
    const obj = server.getObject('test-app', 'note', 'note1');
    expect(obj).toBeDefined();
    expect(obj!.version).toBe(2);
    expect(obj!.data.content).toBe('from server');
  });

  it('3: WHEN serverChange with same data THEN it returns 1 and store notes unchanged', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const noteData = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data: noteData, version: 1 },
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

    await waitForNotes(store, 2500);

    const notesBefore = store.getState().data.notes;
    const result = server.serverChange('note', 'note1', noteData);

    expect(result).toBe(1);

    await new Promise((r) => setTimeout(r, 200));

    const notesAfter = store.getState().data.notes;
    expect(notesAfter).toBe(notesBefore);
  });

  it('4: WHEN serverChange with missing id THEN it throws', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const noteData = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data: noteData, version: 1 },
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

    await waitForNotes(store, 2500);

    expect(() => server.serverChange('note', 'missing', {})).toThrow('missing');
  });
});
