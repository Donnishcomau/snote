/**
 * T80 Store can ask the server for missed changes (`store.forceSync`)
 *
 * A synced store exposes `forceSync()`: on the already-open connection it asks
 * each bucket for everything newer than the bucket's saved change version. The
 * sync client is handed to `src/core` by one marked hook in the vendored
 * middleware. No key, no UI, no reconnect, and no change to the fake server.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes, type SyncConfig } from '../../src/core/store';

const APP_ID = 'test-app';
const TOKEN = 'test-token';
const USERNAME = 'test@example.com';

// A first connection (no saved cv) indexes with `0:i:` frames and sends no
// `0:cv:` frame; only a second connection resuming sends `0:cv:` frames.
const isIndexFrame = (f: string) => f.startsWith('0:i:');
const cvFrames = (received: string[]) => received.filter((f) => f.startsWith('0:cv:'));

// Poll instead of sleeping; poll 40 x 50 ms = 2 s (never wait on real timers
// past the 3 s test timeout).
async function pollUntil(cond: () => boolean, maxMs = 2000): Promise<boolean> {
  for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
  void maxMs;
  return cond();
}

async function connectedStore(server: FakeSimperiumServer) {
  const config: SyncConfig = {
    appId: APP_ID,
    token: TOKEN,
    username: USERNAME,
    clientOptions: { url: server.url },
    noteEditDelayMs: 10,
  };
  const store = makeStore({ sync: config });
  await waitForNotes(store, 2500);
  // Let the index complete so the note bucket's cv (1) is saved to the ghost.
  await new Promise((r) => setTimeout(r, 200));
  return store;
}

describe('T80 store.forceSync', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(APP_ID, 'note', [
      {
        id: 'note1',
        data: {
          content: 'Original',
          creationDate: Date.now(),
          deleted: 0,
          modificationDate: Date.now(),
          systemTags: [],
          tags: [],
        },
      },
    ]);
  });

  afterEach(async () => {
    // Clean up: let in-flight frames settle, then stop the server.
    await new Promise<void>((resolveDone) => {
      setTimeout(() => {
        server.stop();
        resolveDone();
      }, 100);
    });
  });

  it("1: WHEN the store has connected THEN `typeof store.forceSync` is `function` and there are 0 cv frames", async () => {
    const store = await connectedStore(server);

    expect(typeof store.forceSync).toBe('function');
    expect(cvFrames(server.received)).toHaveLength(0);
  });

  it('2: WHEN `store.forceSync()` is called once THEN within 2 s there is exactly 1 cv frame and it is exactly `0:cv:1`', async () => {
    const store = await connectedStore(server);
    const before = server.received.filter(isIndexFrame).length;

    store.forceSync!();

    expect(await pollUntil(() => cvFrames(server.received).length === 1)).toBe(true);
    const frames = cvFrames(server.received);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe('0:cv:1');
    // It reuses the open connection: no new index round-trip was triggered.
    expect(server.received.filter(isIndexFrame).length).toBe(before);
  });

  it('3: WHEN `store.forceSync()` is called twice THEN within 2 s there are 2 cv frames, and 300 ms later `note1` still has content `Original` and `data.notes.size` is 1', async () => {
    const store = await connectedStore(server);
    const before = server.received.filter(isIndexFrame).length;

    store.forceSync!();
    store.forceSync!();

    expect(await pollUntil(() => cvFrames(server.received).length === 2)).toBe(true);
    expect(cvFrames(server.received)).toHaveLength(2);

    await new Promise((r) => setTimeout(r, 300));
    const state = store.getState();
    expect(state.data.notes.get('note1' as never)?.content).toBe('Original');
    expect(state.data.notes.size).toBe(1);
    // Still no extra index: the same connection was reused.
    expect(server.received.filter(isIndexFrame).length).toBe(before);
  });

  it('4: WHEN `store.forceSync()` was called and then `EDIT_NOTE` sets `note1` to `edited after force sync` THEN within 2 s `server.getObject(...)` has that content and `version` 2', async () => {
    const store = await connectedStore(server);

    store.forceSync!();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited after force sync' },
    });

    expect(
      await pollUntil(() => {
        const obj = server.getObject(APP_ID, 'note', 'note1');
        return obj?.data.content === 'edited after force sync' && obj.version === 2;
      })
    ).toBe(true);
    const object = server.getObject(APP_ID, 'note', 'note1');
    expect(object?.data.content).toBe('edited after force sync');
    expect(object?.version).toBe(2);
  });

  it('5: WHEN `makeStore({ stubClient: {} })` is created THEN its `forceSync` is missing (`toBeUndefined`) and `typeof store.dispatch` is `function`', async () => {
    const store = makeStore({ stubClient: {} });

    expect(store.forceSync).toBeUndefined();
    expect(typeof store.dispatch).toBe('function');
  });

  it('6: WHEN `vendor/simplenote/state/simperium/middleware.ts` is read as text THEN exactly 2 of its lines contain `onClient` and both contain `// OMARCHY:`', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'vendor/simplenote/state/simperium/middleware.ts'),
      'utf8'
    );

    const onClientLines = source.split('\n').filter((line) => line.includes('onClient'));
    expect(onClientLines).toHaveLength(2);
    expect(onClientLines.every((line) => line.includes('// OMARCHY:'))).toBe(true);
  });
});
