/**
 * T66 Fake server: a client that resumes from a change version gets what it missed
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { InMemoryGhost } from '../../vendor/simplenote/state/simperium/functions/in-memory-ghost';
import createClient from 'simperium';
import { InMemoryBucket } from '../../vendor/simplenote/state/simperium/functions/in-memory-bucket';
import WebSocket from 'ws';

vi.setConfig({ testTimeout: 15000 });

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

describe('T66 resume', () => {
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

  it('1: WHEN server.serverChange(\'note\', \'note1\', { ...data, content: \'changed while away\' }) runs and then the restarted store is built THEN within 2 s its note1 content is changed while away; server.received has 0:cv:1 and no frame starting with 0:i:', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();
    const data = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data, version: 1 },
    ]);

    // Run serverChange
    server.serverChange('note', 'note1', { ...data, content: 'changed while away' });

    // Build restarted store with ghost store preloaded
    const ghost = new InMemoryGhost();
    await ghost.put('note1' as never, 1, data as never);
    await ghost.setChangeVersion('1');

    const store = makeStore({
      preloadedState: { data: { notes: new Map([['note1', data]]) } } as never,
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
        ghostStoreProvider: (b) => (b.name === 'note' ? ghost : new InMemoryGhost()),
      },
    });

    // Wait for note to update
    await poll(() => {
      const note = store.getState().data.notes.get('note1' as never);
      return note?.content === 'changed while away';
    }, 2000);

    expect(store.getState().data.notes.get('note1' as never)?.content).toBe('changed while away');

    // Check server.received has 0:cv:1 and no 0:i:
    const received = server.received;
    const cvFrames = received.filter((f: string) => f.startsWith('0:cv:'));
    expect(cvFrames.length).toBeGreaterThan(0);
    expect(cvFrames.some((f: string) => f === '0:cv:1')).toBe(true);

    const indexFrames = received.filter((f: string) => f.startsWith('0:i:'));
    expect(indexFrames.length).toBe(0);
  });

  it('2: WHEN the restarted store is built with no server-side change THEN after 300 ms its note1 content is still Original, data.notes.size is 1 and server.received has no frame starting with 0:i:', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();
    const data = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data, version: 1 },
    ]);

    // Build restarted store with ghost store preloaded
    const ghost = new InMemoryGhost();
    await ghost.put('note1' as never, 1, data as never);
    await ghost.setChangeVersion('1');

    const store = makeStore({
      preloadedState: { data: { notes: new Map([['note1', data]]) } } as never,
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
        ghostStoreProvider: (b) => (b.name === 'note' ? ghost : new InMemoryGhost()),
      },
    });

    await new Promise((r) => setTimeout(r, 300));

    expect(store.getState().data.notes.get('note1' as never)?.content).toBe('Original');
    expect(store.getState().data.notes.size).toBe(1);

    // Check server.received has no 0:i:
    const received = server.received;
    const indexFrames = received.filter((f: string) => f.startsWith('0:i:'));
    expect(indexFrames.length).toBe(0);
  });

  it('3: WHEN a raw client sends 0:cv:999 and then 0:cv:abc THEN it receives the frame 0:cv:? exactly 2 times and no frame starting with 0:c:', async () => {
    const ws = new WebSocket(server.url);
    const frames: string[] = [];

    // Collect messages
    ws.on('message', (m: Buffer) => {
      const frame = String(m);
      frames.push(frame);
    });

    // Wait for open and send init
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for open')), 2000);
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.send(
          '0:init:{"name":"note","clientid":"t","api":"1.1","token":"test-token","app_id":"test-app","library":"node-simperium","version":"0.0.1"}'
        );
        resolve();
      });
      ws.on('error', (err) => reject(err));
    });

    // Wait for auth
    await poll(() => frames.some((f) => f.startsWith('0:auth:')), 2000);

    // Clear frames
    frames.length = 0;

    // Send cv:999
    ws.send('0:cv:999');

    // Send cv:abc
    ws.send('0:cv:abc');

    // Wait for responses
    await poll(() => {
      const cvqFrames = frames.filter((f) => f === '0:cv:?');
      return cvqFrames.length >= 2;
    }, 2000);

    const cvqFrames = frames.filter((f) => f === '0:cv:?');
    expect(cvqFrames.length).toBe(2);

    const changeFrames = frames.filter((f) => f.startsWith('0:c:'));
    expect(changeFrames.length).toBe(0);

    ws.close();
  });

  it('4: WHEN serverChange ran twice (contents first change, then second change) and a raw client sends 0:cv:2 THEN it receives one 0:c: frame whose JSON array has length 1, with cv 3, sv 2 and ev 3', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();
    const data = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data, version: 1 },
    ]);

    // Run serverChange twice
    server.serverChange('note', 'note1', { ...data, content: 'first change' });
    server.serverChange('note', 'note1', { ...data, content: 'second change' });

    const ws = new WebSocket(server.url);
    const frames: string[] = [];

    // Collect messages
    ws.on('message', (m: Buffer) => {
      const frame = String(m);
      frames.push(frame);
    });

    // Wait for open and send init
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for open')), 2000);
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.send(
          '0:init:{"name":"note","clientid":"t","api":"1.1","token":"test-token","app_id":"test-app","library":"node-simperium","version":"0.0.1"}'
        );
        resolve();
      });
      ws.on('error', (err) => reject(err));
    });

    // Wait for auth
    await poll(() => frames.some((f) => f.startsWith('0:auth:')), 2000);

    // Clear frames
    frames.length = 0;

    // Send cv:2
    ws.send('0:cv:2');

    // Wait for response
    await poll(() => frames.some((f) => f.startsWith('0:c:')), 2000);

    const changeFrames = frames.filter((f) => f.startsWith('0:c:'));
    expect(changeFrames.length).toBe(1);

    const payload = changeFrames[0].substring('0:c:'.length);
    const changes = JSON.parse(payload);
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.length).toBe(1);
    expect(changes[0].cv).toBe('3');
    expect(changes[0].sv).toBe(2);
    expect(changes[0].ev).toBe(3);

    ws.close();
  });

  it('5: WHEN a raw client sends 0:cv:1 and nothing changed since seeding THEN the frame it receives after auth is exactly 0:c:[]', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();
    const data = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data, version: 1 },
    ]);

    const ws = new WebSocket(server.url);
    const frames: string[] = [];

    // Collect messages
    ws.on('message', (m: Buffer) => {
      const frame = String(m);
      frames.push(frame);
    });

    // Wait for open and send init
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for open')), 2000);
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.send(
          '0:init:{"name":"note","clientid":"t","api":"1.1","token":"test-token","app_id":"test-app","library":"node-simperium","version":"0.0.1"}'
        );
        resolve();
      });
      ws.on('error', (err) => reject(err));
    });

    // Wait for auth
    await poll(() => frames.some((f) => f.startsWith('0:auth:')), 2000);

    // Clear frames
    frames.length = 0;

    // Send cv:1
    ws.send('0:cv:1');

    // Wait for response
    await poll(() => frames.some((f) => f.startsWith('0:c:')), 2000);

    const changeFrames = frames.filter((f) => f.startsWith('0:c:'));
    expect(changeFrames.length).toBe(1);
    expect(changeFrames[0]).toBe('0:c:[]');

    ws.close();
  });

  it('6: WHEN a connected store (no preloaded state) dispatches EDIT_NOTE with content edited by device one, the server object reaches version 2, and then the restarted store is built THEN within 2 s its note1 content is edited by device one', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();
    const data = seedData('Original');

    server.seedBucket(appId, 'note', [
      { id: 'note1', data, version: 1 },
    ]);

    // Create first store
    const store1 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    await waitForNotes(store1, 2500);

    // Dispatch EDIT_NOTE with proper structure
    store1.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited by device one' },
    });

    // Wait for server to update
    await poll(() => {
      const obj = server.getObject('test-app', 'note', 'note1');
      return obj?.version === 2;
    }, 2000);

    expect(server.getObject('test-app', 'note', 'note1')?.version).toBe(2);

    // Build restarted store with ghost store preloaded
    const ghost = new InMemoryGhost();
    const note1Data = store1.getState().data.notes.get('note1' as never);
    await ghost.put('note1' as never, 2, note1Data as never);
    await ghost.setChangeVersion('2');

    const store2 = makeStore({
      preloadedState: { data: { notes: new Map([['note1', note1Data]]) } } as never,
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
        ghostStoreProvider: (b) => (b.name === 'note' ? ghost : new InMemoryGhost()),
      },
    });

    // Wait for note to update
    await poll(() => {
      const note = store2.getState().data.notes.get('note1' as never);
      return note?.content === 'edited by device one';
    }, 2000);

    expect(store2.getState().data.notes.get('note1' as never)?.content).toBe('edited by device one');
  });
});
