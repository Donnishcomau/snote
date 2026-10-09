/**
 * T487: after a kill inside the save delay, an edited or trashed note comes
 * back as the server has it. state.json is written 500 ms after the last
 * change while the ghost file lands at once when the server confirms, so a
 * kill inside that window leaves state.json stale. At start-up, a note the
 * store already holds whose ghost copy has a strictly LARGER modificationDate
 * is replaced by the ghost copy — and nothing is sent back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

const appId = 'test-app';

/** Change frames naming a note id, in receive order. */
const changeFramesFor = (srv: FakeSimperiumServer, id: string): string[] =>
  srv.received.filter((m) => m.includes(':c:') && m.includes(`"id":"${id}"`));

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

describe('T487 after a kill inside the save delay, an edited or trashed note comes back as the server has it', () => {
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

  /**
   * Seed the two server notes: `a` carries the given data and version,
   * `b` is always the unchanged `Seeded b` at version 1.
   */
  const seed = (aData: Record<string, unknown>, aVersion: number): void => {
    server.seedBucket(appId, 'note', [
      { id: 'a', data: aData, version: aVersion },
      { id: 'b', data: noteData('Seeded b'), version: 1 },
    ]);
  };

  /**
   * Write the ghost file through the real FileGhostStore, exactly as the
   * sync would: entries at their server versions, then the cv the server
   * holds after the last confirmed change.
   */
  const writeGhosts = async (
    entries: Array<{ id: string; version: number; data: unknown }>
  ): Promise<void> => {
    const g = new FileGhostStore(dir, 'note');
    for (const e of entries) {
      await g.put(e.id, e.version, e.data);
    }
    await g.setChangeVersion(server.getCV(appId, 'note'));
  };

  /**
   * Write state.json through a stub store: dispatch IMPORT_NOTE_WITH_ID per
   * note, then saveState — the same route test/integration/tombstones.test.ts
   * uses, so the file has the real persistence shape.
   */
  const writeStoreState = (
    entries: Array<{ id: string; note: Note }>
  ): void => {
    const stub = makeStore({ stubClient: {} });
    for (const { id, note } of entries) {
      stub.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: id as EntityId,
        note,
      } as A.ActionType);
    }
    saveState(stub.getState(), dir);
  };

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t487-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    // Let in-flight sync settle, then stop the server (offline.test.ts pattern).
    await sleep(100);
    server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN state.json holds `a` (`Seeded a`, modificationDate 1000) and `b` (`Seeded b`), the ghost holds `a` as `edited a` (modificationDate 2000, version 2) and `b` unchanged, and the server holds the same THEN within 1 s `a`'s content is `edited a`, `b`'s content is `Seeded b`, `data.notes.size` is `2`, and 400 ms later `0` change frames have arrived", async () => {
    const editedA = { ...noteData('edited a'), modificationDate: 2_000 };
    seed(editedA, 2);
    await writeGhosts([
      { id: 'a', version: 2, data: editedA },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
    writeState([
      ['a', noteData('Seeded a')],
      ['b', noteData('Seeded b')],
    ]);

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.get('a' as never)?.content === 'edited a' &&
        store.getState().data.notes.get('b' as never)?.content === 'Seeded b' &&
        store.getState().data.notes.size === 2
    );

    await sleep(400);

    expect(store.getState().data.notes.get('a' as never)!.content).toBe(
      'edited a'
    );
    expect(store.getState().data.notes.get('b' as never)!.content).toBe(
      'Seeded b'
    );
    expect(store.getState().data.notes.size).toBe(2);
    expect(server.received.filter((m) => m.includes(':c:'))).toHaveLength(0);
  });

  it("2: WHEN the ghost's `a` has `deleted: true` and modificationDate 2000 while state.json's `a` has `deleted: 0` THEN within 1 s the store's `a` has `deleted` `true`, `b` is untouched and `0` change frames arrive", async () => {
    const trashedA = {
      ...noteData('Seeded a'),
      modificationDate: 2_000,
      deleted: true,
    };
    seed(trashedA, 2);
    await writeGhosts([
      { id: 'a', version: 2, data: trashedA },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
    writeState([
      ['a', noteData('Seeded a')],
      ['b', noteData('Seeded b')],
    ]);

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.get('a' as never)?.deleted === true &&
        store.getState().data.notes.get('b' as never)?.content === 'Seeded b'
    );

    await sleep(400);

    expect(store.getState().data.notes.get('a' as never)!.deleted).toBe(true);
    expect(store.getState().data.notes.get('b' as never)!.content).toBe(
      'Seeded b'
    );
    expect(server.received.filter((m) => m.includes(':c:'))).toHaveLength(0);
  });

  it("3: WHEN state.json's `a` is `edited locally` (modificationDate 3000) and the ghost's `a` is `Seeded a` (modificationDate 2000) THEN after 500 ms the store's `a` is still `edited locally` and within 2 s the server's `a` content is `edited locally` with exactly `1` change frame naming `a`", async () => {
    seed(noteData('Seeded a'), 1);
    await writeGhosts([
      { id: 'a', version: 1, data: noteData('Seeded a') },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
    writeStoreState([
      {
        id: 'a',
        note: {
          ...noteData('edited locally'),
          modificationDate: 3_000,
        } as unknown as Note,
      },
    ]);

    const { store } = build();

    await sleep(500);

    expect(store.getState().data.notes.get('a' as never)!.content).toBe(
      'edited locally'
    );

    await waitFor(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally' &&
        changeFramesFor(server, 'a').length === 1,
      2000
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe(
      'edited locally'
    );
    expect(changeFramesFor(server, 'a')).toHaveLength(1);
  });

  it("4: WHEN the ghost holds `a` as `edited a` (modificationDate 2000, version 2) but the server removed `a` with `serverRemove('note', 'a')` after the ghost was saved THEN within 2 s `data.notes.has('a')` is `false`, `server.getObject('test-app', 'note', 'a')` is `undefined` and no change frame naming `a` contains `\"o\":\"M\"`", async () => {
    const editedA = { ...noteData('edited a'), modificationDate: 2_000 };
    seed(editedA, 2);
    await writeGhosts([
      { id: 'a', version: 2, data: editedA },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
    writeState([['a', noteData('Seeded a')]]);

    // The server trashed-forever `a` after the ghost was saved.
    server.serverRemove('note', 'a');

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.has('a' as never) === false &&
        server.getObject(appId, 'note', 'a') === undefined,
      2000
    );

    expect(store.getState().data.notes.has('a' as never)).toBe(false);
    expect(server.getObject(appId, 'note', 'a')).toBeUndefined();
    expect(
      changeFramesFor(server, 'a').filter((f) => f.includes('"o":"M"'))
    ).toHaveLength(0);
  });

  it("5: WHEN the ghost's `a` is `{ modificationDate: 9999, deleted: true }` (no `content`) and state.json's `a` is `Seeded a` THEN after 500 ms the store's `a` still has content `Seeded a` and `deleted` `0`", async () => {
    seed(noteData('Seeded a'), 1);
    await writeGhosts([
      { id: 'a', version: 2, data: { modificationDate: 9_999, deleted: true } },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
    writeState([['a', noteData('Seeded a')]]);

    const { store } = build();

    await sleep(500);

    expect(store.getState().data.notes.get('a' as never)!.content).toBe(
      'Seeded a'
    );
    expect(store.getState().data.notes.get('a' as never)!.deleted).toBe(0);
  });
});
