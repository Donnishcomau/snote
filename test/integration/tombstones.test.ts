/**
 * T151: Tombstones — deletions made offline are sent again at start-up.
 * A "delete forever" recorded while offline is re-sent for every tombstone
 * whose note the server still holds (FR-5).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { loadTombstones, saveTombstones } from '../../src/core/tombstones';
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper copied from test/integration/requeue.test.ts: every asserted
// value lives inside `cond`; after exhaustion we call `cond()` once more so
// the expect below sees the final observed state.
const poll = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  cond();
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ORIGINAL_MD = 1000;

describe('T151 tombstones: offline deletions resent at start-up', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  // Seeded server notes, both version 1 (fixture from Decisions).
  const serverData: Note = {
    content: 'Original',
    creationDate: ORIGINAL_MD,
    modificationDate: ORIGINAL_MD,
    deleted: 0,
    systemTags: [],
    tags: [],
  } as unknown as Note;

  const keepData: Note = {
    content: 'Keep me',
    creationDate: ORIGINAL_MD,
    modificationDate: ORIGINAL_MD,
    deleted: 0,
    systemTags: [],
    tags: [],
  } as unknown as Note;

  // One server per test, started then seeded before the test body runs.
  const boot = async (): Promise<void> => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket('test-app', 'note', [
      { id: 'note1', data: serverData as unknown as Record<string, unknown>, version: 1 },
      { id: 'note2', data: keepData as unknown as Record<string, unknown>, version: 1 },
    ]);
  };

  // Prepare the data dir by hand: ghosts for BOTH notes at version 1, the
  // change version set to the server's post-seed CV, and a state.json holding
  // only the given local notes (note1 was deleted forever offline).
  const prepare = async (localNotes: Array<{ id: string; note: Note }>): Promise<void> => {
    const g = new FileGhostStore(dir, 'note');
    await g.put('note1', 1, serverData);
    await g.put('note2', 1, keepData);
    await g.setChangeVersion(server.getCV('test-app', 'note'));

    const stub = makeStore({ stubClient: {} });
    for (const { id, note } of localNotes) {
      stub.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: id as EntityId,
        note,
      } as A.ActionType);
    }
    saveState(stub.getState(), dir);
  };

  const open = () => {
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    stopSaving = built.stopSaving;
    return built.store;
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t151-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN the tombstones are ["note1"] and open() runs THEN before it the server has note1; within 2 s server.getObject("test-app", "note", "note1") is undefined, and note2 still has version 1 and Keep me', async () => {
    await boot();
    await prepare([{ id: 'note2', note: keepData }]);
    saveTombstones(dir, ['note1']);

    expect(server.getObject('test-app', 'note', 'note1')).not.toBeUndefined();

    open();

    let gone = false;
    await poll(() => {
      gone = server.getObject('test-app', 'note', 'note1') === undefined;
      return gone;
    });

    const n2 = server.getObject('test-app', 'note', 'note2');
    expect(gone).toBe(true);
    expect(n2?.version).toBe(1);
    expect(n2?.data.content).toBe('Keep me');
  });

  it('2: WHEN the tombstones are ["gone9", "note1"] (no ghost for gone9) and open() runs THEN 300 ms later loadTombstones(dir) equals ["note1"] and no frame in server.received contains gone9', async () => {
    await boot();
    await prepare([{ id: 'note2', note: keepData }]);
    saveTombstones(dir, ['gone9', 'note1']);

    open();

    await wait(300);

    expect(loadTombstones(dir)).toEqual(['note1']);
    expect(server.received.some((f) => f.includes('gone9'))).toBe(false);
  });

  it('3: WHEN there is no tombstones.json and open() runs THEN after 400 ms the server still has note1 and note2 at version 1, the store has note2 with Keep me, and tombstones.json does not exist (fs.existsSync)', async () => {
    await boot();
    await prepare([{ id: 'note2', note: keepData }]);

    const store = open();

    await wait(400);

    const n1 = server.getObject('test-app', 'note', 'note1');
    const n2 = server.getObject('test-app', 'note', 'note2');
    const storeNote2 = store.getState().data.notes.get('note2' as EntityId);
    expect(n1?.version).toBe(1);
    expect(n2?.version).toBe(1);
    expect(storeNote2?.content).toBe('Keep me');
    expect(fs.existsSync(path.join(dir, 'tombstones.json'))).toBe(false);
  });

  it('4: WHEN open() ran on an EMPTY dir, both notes arrived, and TRASH_NOTE then DELETE_NOTE_FOREVER are dispatched for note1 THEN right after that loadTombstones(dir) equals ["note1"], and within 2 s the server has no note1 but still note2', async () => {
    await boot();

    const store = open();

    let arrived = false;
    await poll(() => {
      arrived =
        store.getState().data.notes.has('note1' as EntityId) &&
        store.getState().data.notes.has('note2' as EntityId);
      return arrived;
    });
    expect(arrived).toBe(true);

    store.dispatch({ type: 'TRASH_NOTE', noteId: 'note1' as EntityId } as A.ActionType);
    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'note1' as EntityId } as A.ActionType);

    expect(loadTombstones(dir)).toEqual(['note1']);

    let gone = false;
    await poll(() => {
      gone = server.getObject('test-app', 'note', 'note1') === undefined;
      return gone;
    });

    const n2 = server.getObject('test-app', 'note', 'note2');
    expect(gone).toBe(true);
    expect(n2).not.toBeUndefined();
  });

  it('5: WHEN after line 4\'s steps (server note1 gone) open() runs a second time on the same dir THEN 400 ms later loadTombstones(dir) equals [] and the server\'s note2 still has version 1', async () => {
    await boot();

    const first = open();

    let arrived = false;
    await poll(() => {
      arrived =
        first.getState().data.notes.has('note1' as EntityId) &&
        first.getState().data.notes.has('note2' as EntityId);
      return arrived;
    });
    expect(arrived).toBe(true);

    first.dispatch({ type: 'TRASH_NOTE', noteId: 'note1' as EntityId } as A.ActionType);
    first.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'note1' as EntityId } as A.ActionType);

    let gone = false;
    await poll(() => {
      gone = server.getObject('test-app', 'note', 'note1') === undefined;
      return gone;
    });
    expect(gone).toBe(true);

    // Close the first session, then start again on the same dir.
    stopSaving?.();
    stopSaving = undefined;
    await wait(200);

    open();

    await wait(400);

    const n2 = server.getObject('test-app', 'note', 'note2');
    expect(loadTombstones(dir)).toEqual([]);
    expect(n2?.version).toBe(1);
  });
});
