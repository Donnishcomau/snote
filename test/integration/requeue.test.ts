/**
 * T85: Offline edits survive a quit — re-queue at start.
 * A saved note newer than its ghost is sent again on start-up (FR-5).
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
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper from Decisions: `for (let i = 0; i < 40 && !cond(); i++) ...`.
// Every asserted value lives inside `cond`; if the poll exhausts without
// satisfying it, we call `cond()` once more so the expect below sees the
// final observed state (and fails with the real values, not a stale read).
const poll = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  cond();
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ORIGINAL_MD = 1000;

describe('T85 re-queue unsynced notes at start-up', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  // The seeded server note: version 1 (one object seeded), modificationDate 1000.
  const serverData: Note = {
    content: 'Original',
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
    server.seedBucket('test-app', 'note', [{ id: 'note1', data: serverData, version: 1 }]);
  };

  // Prepare the data dir by hand (no first session): write the ghost for
  // note1 = serverData at version 1, set the change version to '1', and save
  // a stub store's notes into state.json.
  const prepare = async (localNotes: Array<{ id: string; note: Note }>): Promise<void> => {
    const g = new FileGhostStore(dir, 'note');
    await g.put('note1', 1, serverData);
    await g.setChangeVersion('1');

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t85-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN the saved local note is { ...serverData, content: "edited offline", modificationDate: 2000 } THEN within 2 s server.getObject("test-app", "note", "note1") has the content "edited offline" and version 2', async () => {
    await boot();
    const local = { ...serverData, content: 'edited offline', modificationDate: 2000 };
    await prepare([{ id: 'note1', note: local }]);

    open();

    let obj: { version: number; data: Record<string, unknown> } | undefined;
    await poll(() => {
      obj = server.getObject('test-app', 'note', 'note1');
      return obj?.data.content === 'edited offline' && obj?.version === 2;
    });

    expect(obj?.data.content).toBe('edited offline');
    expect(obj?.version).toBe(2);
  });

  it('2: WHEN the saved local note equals serverData THEN after 400 ms the server\'s note1 still has version 1 and the content "Original"', async () => {
    await boot();
    await prepare([{ id: 'note1', note: serverData }]);

    open();

    await wait(400);

    const obj = server.getObject('test-app', 'note', 'note1');
    expect(obj?.version).toBe(1);
    expect(obj?.data.content).toBe('Original');
  });

  it('3: WHEN the saved local note is { ...serverData, content: "stale", modificationDate: 500 } THEN after 400 ms the server\'s note1 still has the content "Original" and version 1', async () => {
    await boot();
    const local = { ...serverData, content: 'stale', modificationDate: 500 };
    await prepare([{ id: 'note1', note: local }]);

    open();

    await wait(400);

    const obj = server.getObject('test-app', 'note', 'note1');
    expect(obj?.data.content).toBe('Original');
    expect(obj?.version).toBe(1);
  });

  it('4: WHEN the dir also holds a saved note new1 (content "made offline") that has no ghost THEN within 2 s server.getObject("test-app", "note", "new1").data.content is "made offline", and note1 still has version 1', async () => {
    await boot();
    const new1 = makeNote('new1', 'made offline');
    await prepare([
      { id: 'note1', note: serverData },
      { id: 'new1', note: new1 },
    ]);

    open();

    let new1Obj: { version: number; data: Record<string, unknown> } | undefined;
    await poll(() => {
      new1Obj = server.getObject('test-app', 'note', 'new1');
      return new1Obj?.data.content === 'made offline';
    });
    // note1 must remain untouched: the only re-queued note is new1.
    const n1 = server.getObject('test-app', 'note', 'note1');
    expect(n1?.version).toBe(1);

    expect(new1Obj?.data.content).toBe('made offline');
  });

  it('5: WHEN the dir is empty (no state.json, no ghost file) THEN within 2 s the store\'s note1 has the content "Original", and 400 ms later the server\'s note1 still has version 1', async () => {
    await boot();
    const store = open();

    let storeNote: Note | undefined;
    await poll(() => {
      storeNote = store.getState().data.notes.get('note1' as EntityId);
      return storeNote?.content === 'Original';
    });

    await wait(400);

    expect(storeNote?.content).toBe('Original');
    const obj = server.getObject('test-app', 'note', 'note1');
    expect(obj?.version).toBe(1);
  });
});
