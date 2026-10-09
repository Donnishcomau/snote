/**
 * T502: an unconfirmed local change stays in the unsynced record until the
 * server confirms it, even while its note is held or not yet re-sent.
 * `pendingNotes` alone does not know about a note the start-up re-queue is
 * still holding (offline, it differs from its ghost but has not gone
 * pending), so a record rebuilt from the pending set alone drops such an
 * entry the moment another note goes pending. Here an entry loaded from
 * unsynced.json stays until its change is confirmed this session, the note
 * is gone locally, or the start-up re-send finished without it pending.
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

describe('T502 an unconfirmed local change stays in the unsynced record until the server confirms it, even while its note is held or not yet re-sent', () => {
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
   * Seed both server notes at version 1: `a` = `Seeded a`, `b` = `Seeded b`.
   */
  const seed = (): void => {
    server.seedBucket(appId, 'note', [
      { id: 'a', data: noteData('Seeded a'), version: 1 },
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

  const seededState = () =>
    writeStoreState([
      { id: 'a', note: noteData('Seeded a') as unknown as Note },
      { id: 'b', note: noteData('Seeded b') as unknown as Note },
    ]);

  /** The record as it sits on disk right now. */
  const readRecord = (): Record<string, number> =>
    JSON.parse(fs.readFileSync(path.join(dir, 'unsynced.json'), 'utf8')) as Record<
      string,
      number
    >;

  /**
   * Offline session editing one note: unreachable server, EDIT_NOTE, wait
   * until unsynced.json names the note, let state.json land, stop the saver.
   */
  const offlineEdit = async (id: string, content: string): Promise<void> => {
    const { store } = buildUnreachable();
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: id,
      changes: { content },
    } as A.ActionType);
    await waitFor(() => id in readRecord(), 2000);
    // state.json lands on the 500 ms debounce; the record is written at once.
    await sleep(700);
    stopSaving?.();
    stopSaving = undefined;
    await sleep(100);
  };

  /** Another device's copy of `a`: content `other device`, newer. */
  const putOtherDevice = async (): Promise<void> => {
    const otherDevice = {
      ...noteData('other device'),
      modificationDate: 9_999_999_999,
    };
    server.seedBucket(appId, 'note', [
      { id: 'a', data: otherDevice, version: 2 },
      { id: 'b', data: noteData('Seeded b'), version: 1 },
    ]);
    await writeGhosts([
      { id: 'a', version: 2, data: otherDevice },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
  };

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t502-'));
    seed();
    await writeGhosts([
      { id: 'a', version: 1, data: noteData('Seeded a') },
      { id: 'b', version: 1, data: noteData('Seeded b') },
    ]);
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    // Let in-flight sync settle, then stop the server (offline.test.ts pattern).
    await sleep(100);
    server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN `a` was edited offline to `edited locally` in session 1, `b` was edited offline to `edited b` in session 2, and the server and ghost then hold `a` as `other device`, THEN `unsynced.json` names both `a` and `b` after session 2, and in an online session 3 within 2 s the server's `a` is `edited locally` with exactly `1` change frame naming `a` and the server's `b` is `edited b`", async () => {
    seededState();
    await offlineEdit('a', 'edited locally');
    await offlineEdit('b', 'edited b');

    expect(Object.keys(readRecord()).sort()).toEqual(['a', 'b']);

    await putOtherDevice();

    const { store } = build();

    await waitFor(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally' &&
        changeFramesFor(server, 'a').length === 1 &&
        server.getObject(appId, 'note', 'b')?.data.content === 'edited b' &&
        store.getState().data.notes.get('a' as EntityId)?.content === 'edited locally' &&
        store.getState().data.notes.get('b' as EntityId)?.content === 'edited b',
      2000
    );

    expect(server.getObject(appId, 'note', 'a')!.data.content).toBe('edited locally');
    expect(changeFramesFor(server, 'a')).toHaveLength(1);
    expect(server.getObject(appId, 'note', 'b')!.data.content).toBe('edited b');
  });

  it("2: WHEN `a` was edited offline and snote then starts online and `b` is edited to `edited b` straight away THEN on every store change until the server's `a` is `edited locally` the file `unsynced.json` names `a`, and the server's `b` ends as `edited b`", async () => {
    seededState();
    await offlineEdit('a', 'edited locally');

    const { store } = build();

    // Registered after trackUnsynced's listener, so it runs after it on
    // every store change: sample the record while `a` is still unconfirmed.
    const samplesWithoutA: string[] = [];
    store.subscribe(() => {
      const sent =
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally';
      if (sent) {
        return;
      }
      const record = readRecord();
      if (!('a' in record)) {
        samplesWithoutA.push(JSON.stringify(record));
      }
    });

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'b',
      changes: { content: 'edited b' },
    } as A.ActionType);

    await waitFor(
      () =>
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally' &&
        server.getObject(appId, 'note', 'b')?.data.content === 'edited b',
      2000
    );

    expect(samplesWithoutA).toEqual([]);
    expect(server.getObject(appId, 'note', 'b')!.data.content).toBe('edited b');
  });

  it("3: WHEN `a` was edited offline and snote then starts online and sent it and the server confirmed THEN within 2 s `unsynced.json` holds exactly `{}`", async () => {
    seededState();
    await offlineEdit('a', 'edited locally');

    build();

    await waitFor(() => {
      const sent =
        server.getObject(appId, 'note', 'a')?.data.content === 'edited locally';
      return sent && JSON.stringify(readRecord()) === '{}';
    }, 2000);

    expect(JSON.stringify(readRecord())).toBe('{}');
  });
});
