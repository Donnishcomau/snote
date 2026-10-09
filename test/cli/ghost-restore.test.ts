/**
 * T445: a note saved to the server but not yet to state.json comes back
 * on the next start. The ghost file holds the server's copy of every note
 * the last sync confirmed; when a kill lands inside the 500 ms state.json
 * debounce, start-up must add those notes from the ghost — sending nothing —
 * while never disturbing what the store already holds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';

const appId = 'test-app';

/** Change frames naming a note id, in receive order. */
const changeFramesFor = (srv: FakeSimperiumServer, id: string): string[] =>
  srv.received.filter((m) => m.includes(':c:') && m.includes(`"id":"${id}"`));

/** Set navigator.onLine to false. */
function goOffline(): void {
  (navigator as { onLine: boolean }).onLine = false;
}

/** Set navigator.onLine to true and tell window the machine is back. */
function goOnline(): void {
  (navigator as { onLine: boolean }).onLine = true;
  window.dispatchEvent(new Event('online'));
}

/** Poll a condition every 50 ms, at most 40 times. */
async function pollUntil(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const noteData = (content: string) => ({
  content,
  creationDate: 1_000,
  modificationDate: 1_000,
  deleted: 0,
  systemTags: [],
  tags: [],
});

const waitFor = async (cond: () => boolean, timeoutMs = 1000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('T445 a note saved to the server but not yet to state.json comes back on the next start', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  const build = () => {
    const result = buildStore(
      {
        dataDir: dir,
        appId,
        server: server.url,
        noteEditDelayMs: 10,
      },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stopSaving = result.stopSaving;
    return result;
  };

  /** Write state.json by hand: the notes map holds exactly `entries`. */
  const writeState = (entries: Array<[string, Record<string, unknown>]>) => {
    const __map = entries.map(([k, v]) => [k, v] as [string, unknown]);
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ version: 1, data: { notes: { __map } } })
    );
  };

  /** Write ghosts-note.json by hand with the given cv and entries. */
  const writeGhosts = (
    cv: string,
    entries: Array<{ key: string; version: number; data: unknown }>
  ) => {
    fs.writeFileSync(
      path.join(dir, 'ghosts-note.json'),
      JSON.stringify({ version: 1, cv, ghosts: entries })
    );
  };

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t445-'));
    server.seedBucket(appId, 'note', [
      { id: 'a', data: noteData('Seeded a'), version: 1 },
      { id: 'new1', data: noteData('Created just before the kill'), version: 2 },
    ]);
  });

  afterEach(async () => {
    (navigator as { onLine: boolean }).onLine = true;
    stopSaving?.();
    stopSaving = undefined;
    // Let in-flight sync settle, then stop the server (offline.test.ts pattern).
    await sleep(100);
    server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN state.json holds `a` and the ghost holds `a` and `new1` at the server's versions and cv THEN within 1 s new1's content is `Created just before the kill`, `data.notes.size` is `2` and 0 change frames arrived", async () => {
    writeState([['a', noteData('Seeded a')]]);
    writeGhosts(server.getCV(appId, 'note'), [
      { key: 'a', version: 1, data: noteData('Seeded a') },
      { key: 'new1', version: 2, data: noteData('Created just before the kill') },
    ]);

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.get('new1' as never)?.content ===
          'Created just before the kill' && store.getState().data.notes.size === 2
    );

    expect(store.getState().data.notes.get('new1' as never)!.content).toBe(
      'Created just before the kill'
    );
    expect(store.getState().data.notes.size).toBe(2);
    expect(server.received.filter((m) => m.includes(':c:'))).toHaveLength(0);
  });

  it("2: WHEN the ghost also holds `old1` with `deleted: true`, which state.json lacks THEN within 1 s `data.notes` has old1 and its `deleted` is `true`", async () => {
    writeState([['a', noteData('Seeded a')]]);
    writeGhosts(server.getCV(appId, 'note'), [
      { key: 'a', version: 1, data: noteData('Seeded a') },
      { key: 'old1', version: 3, data: { ...noteData('Seeded a'), deleted: true } },
    ]);

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.has('old1' as never) &&
        store.getState().data.notes.get('old1' as never)!.deleted === true
    );

    expect(store.getState().data.notes.has('old1' as never)).toBe(true);
    expect(store.getState().data.notes.get('old1' as never)!.deleted).toBe(true);
  });

  it("3: WHEN the ghost holds an entry `bad1` whose data is `{}` THEN after 500 ms `data.notes.has('bad1')` is `false`", async () => {
    writeState([['a', noteData('Seeded a')]]);
    writeGhosts(server.getCV(appId, 'note'), [
      { key: 'a', version: 1, data: noteData('Seeded a') },
      { key: 'bad1', version: 4, data: {} },
    ]);

    const { store } = build();

    await sleep(500);

    expect(store.getState().data.notes.has('bad1' as never)).toBe(false);
  });

  it("4: WHEN state.json's `a` is `edited locally` and the ghost's `a` is `Seeded a`, both with the same modificationDate THEN after 500 ms the store's a content is `edited locally`", async () => {
    writeState([['a', noteData('edited locally')]]);
    writeGhosts(server.getCV(appId, 'note'), [
      { key: 'a', version: 1, data: noteData('Seeded a') },
    ]);

    const { store } = build();

    await sleep(500);

    expect(store.getState().data.notes.get('a' as never)!.content).toBe(
      'edited locally'
    );
  });

  it("5: WHEN a synced store goes offline, a note `n-off` with content `made offline` is created and the store goes online THEN within 2 s the server's n-off content is `made offline` and exactly `1` change frame names n-off", async () => {
    // No state.json and no ghost file: nothing to restore, so the
    // offline-create path runs untouched.
    const { store } = build();
    await waitFor(() => store.getState().data.notes.size >= 2, 2500);

    goOffline();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n-off' as never,
      note: noteData('made offline'),
    } as never);

    goOnline();
    await pollUntil(
      () => server.getObject(appId, 'note', 'n-off')?.data.content === 'made offline'
    );

    expect(server.getObject(appId, 'note', 'n-off')!.data.content).toBe(
      'made offline'
    );
    expect(changeFramesFor(server, 'n-off')).toHaveLength(1);
  });
});
