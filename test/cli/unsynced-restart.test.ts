/**
 * T493: an edit or trash the server has not confirmed survives a restart
 * and is sent, whatever the dates say. `pendingNotes` knows which local
 * changes the server never acknowledged but lives only in memory, so the
 * record of those ids (with the date each change carried) now lives in
 * unsynced.json: at start-up a held note the record names is never
 * replaced by a newer ghost copy, and requeueUnsynced sends it even when
 * the ghost's date is larger. Only content the server confirmed may still
 * be adopted from the ghost (test 3, the T487 guard).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { makeStore } from '../../src/core/store';
import { loadState, saveState } from '../../src/core/persistence';

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

describe('T493 an edit or trash the server has not confirmed survives a restart and is sent, whatever the dates say', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  /** Session against the fake server. */
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

  /**
   * Session with no server reachable: tracking still on, so the edit is
   * recorded as a local change the server has not confirmed.
   */
  const buildUnreachable = () => {
    const result = buildStore(
      {
        dataDir: dir,
        appId,
        server: 'ws://127.0.0.1:9',
        noteEditDelayMs: 10,
      },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stopSaving = result.stopSaving;
    return result;
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

  /** Session 1 with nothing reachable: edit or trash `a`, let state.json land. */
  const offlineSession = async (action: 'EDIT' | 'TRASH'): Promise<void> => {
    writeStoreState([
      { id: 'a', note: noteData('Seeded a') as unknown as Note },
      { id: 'b', note: noteData('Seeded b') as unknown as Note },
    ]);
    const { store } = buildUnreachable();
    store.dispatch(
      action === 'EDIT'
        ? ({
            type: 'EDIT_NOTE',
            noteId: 'a',
            changes: { content: 'edited locally' },
          } as A.ActionType)
        : ({ type: 'TRASH_NOTE', noteId: 'a' } as A.ActionType)
    );
    await waitFor(() => loadState(dir)?.data?.notes?.has('a' as EntityId) === true, 2000);
    // state.json lands on the 500 ms debounce; the record is written at once.
    await sleep(700);
    stopSaving?.();
    stopSaving = undefined;
    // Nothing reachable, so nothing in flight to settle.
    await sleep(100);
  };

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t493-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    // Let in-flight sync settle, then stop the server (offline.test.ts pattern).
    await sleep(100);
    server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN `a` was edited to `edited locally` with no server reachable, snote stopped, and the server and ghost now hold `a` as `other device` THEN within 2 s the server's `a` content is `edited locally` with exactly `1` change frame naming `a`, the store's `a` is `edited locally` and `b` is `Seeded b`", async () => {
    await offlineSession('EDIT');

    // Another device changed `a` while this machine was offline.
    const otherDevice = {
      ...noteData('other device'),
      modificationDate: 9_999_999_999,
    };
    seed(otherDevice, 2);
    await writeGhosts([
      { id: 'a', version: 2, data: otherDevice },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);

    const { store } = build();

    await waitFor(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally' &&
        changeFramesFor(server, 'a').length === 1 &&
        store.getState().data.notes.get('a' as EntityId)?.content === 'edited locally' &&
        store.getState().data.notes.get('b' as EntityId)?.content === 'Seeded b',
      2000
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('edited locally');
    expect(changeFramesFor(server, 'a')).toHaveLength(1);
    expect(store.getState().data.notes.get('a' as EntityId)!.content).toBe('edited locally');
    expect(store.getState().data.notes.get('b' as EntityId)!.content).toBe('Seeded b');
  });

  it("2: WHEN `a` was trashed with no server reachable, snote stopped, and the server and ghost now hold `a` as `other device` (`deleted` 0) THEN within 2 s the server's `a` has `deleted` `true` with exactly `1` change frame naming `a` and the store's `a` has `deleted` `true`", async () => {
    await offlineSession('TRASH');

    // Another device edited `a` (still not trashed) while this machine was offline.
    const otherDevice = {
      ...noteData('other device'),
      modificationDate: 9_999_999_999,
      deleted: 0,
    };
    seed(otherDevice, 2);
    await writeGhosts([
      { id: 'a', version: 2, data: otherDevice },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);

    const { store } = build();

    await waitFor(
      () =>
        !!server.getObject(appId, 'note', 'a')?.data.deleted === true &&
        changeFramesFor(server, 'a').length === 1 &&
        store.getState().data.notes.get('a' as EntityId)?.deleted === true,
      2000
    );

    expect(!!server.getObject(appId, 'note', 'a')!.data.deleted).toBe(true);
    expect(changeFramesFor(server, 'a')).toHaveLength(1);
    expect(store.getState().data.notes.get('a' as EntityId)!.deleted).toBe(true);
  });

  it("3: WHEN `a` was edited to `confirmed edit` with the server reachable and confirmed, snote stopped, and state.json was put back to `Seeded a` (modificationDate 1000) THEN within 1 s the store's `a` is `confirmed edit`, the server's `a` is `confirmed edit` and 400 ms later no further change frame has arrived", async () => {
    seed(noteData('Seeded a'), 1);
    writeStoreState([
      { id: 'a', note: noteData('Seeded a') as unknown as Note },
      { id: 'b', note: noteData('Seeded b') as unknown as Note },
    ]);

    const first = build();
    first.store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'a',
      changes: { content: 'confirmed edit' },
    } as A.ActionType);

    await waitFor(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'confirmed edit' &&
        first.store.getState().simperium.pendingNotes['a'] === undefined,
      2000
    );

    const framesAfterAck = server.received.filter((m) => m.includes(':c:')).length;

    first.stopSaving();
    stopSaving = undefined;
    await sleep(100);

    // state.json goes back to the stale `Seeded a` (modificationDate 1000).
    writeStoreState([
      { id: 'a', note: noteData('Seeded a') as unknown as Note },
      { id: 'b', note: noteData('Seeded b') as unknown as Note },
    ]);

    const { store } = build();

    await waitFor(
      () =>
        store.getState().data.notes.get('a' as EntityId)?.content === 'confirmed edit' &&
        server.getObject(appId, 'note', 'a')?.data.content === 'confirmed edit',
      1000
    );

    await sleep(400);

    expect(store.getState().data.notes.get('a' as EntityId)!.content).toBe('confirmed edit');
    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('confirmed edit');
    expect(server.received.filter((m) => m.includes(':c:')).length).toBe(framesAfterAck);
  });
});
