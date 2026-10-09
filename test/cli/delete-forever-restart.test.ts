/**
 * T488: A note deleted forever stays deleted when snote is killed before
 * state.json is saved. The delete reaches the server and the ghost file at
 * once, but state.json lands 500 ms later; killed inside that window the
 * restart must not load the stale state and re-create the note on the server.
 * Rig copied from test/integration/tombstones.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { loadState, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { saveTombstones } from '../../src/core/tombstones';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper copied from test/integration/tombstones.test.ts: every asserted
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

const CONTENT: Record<string, string> = {
  a: 'Seeded a',
  a2: 'Seeded a2',
  b: 'Seeded b',
};

const noteData = (id: string): Note =>
  ({
    content: CONTENT[id],
    creationDate: ORIGINAL_MD,
    modificationDate: ORIGINAL_MD,
    deleted: 0,
    systemTags: [],
    tags: [],
  }) as unknown as Note;

describe('T488 delete forever survives a kill before state.json is saved', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  // Lay out the data dir by hand per the Decisions: server, ghost and
  // state.json each hold exactly the ids named, all at version 1.
  const prepare = async (plan: {
    server: string[];
    ghost: string[];
    state: string[];
  }): Promise<void> => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(
      'test-app',
      'note',
      plan.server.map((id) => ({
        id,
        data: noteData(id) as unknown as Record<string, unknown>,
        version: 1,
      }))
    );

    const g = new FileGhostStore(dir, 'note');
    for (const id of plan.ghost) {
      await g.put(id, 1, noteData(id));
    }
    await g.setChangeVersion(server.getCV('test-app', 'note'));

    const stub = makeStore({ stubClient: {} });
    for (const id of plan.state) {
      stub.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: id as EntityId,
        note: noteData(id),
      } as A.ActionType);
    }
    saveState(stub.getState(), dir);
  };

  // Start snote on the prepared dir, keeping both store and stopSaving.
  const open = () => {
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    stopSaving = built.stopSaving;
    return built.store;
  };

  // Change frames that name a given note id.
  const framesFor = (id: string): number =>
    server.received.filter((m) => m.includes(':c:') && m.includes(`"${id}"`)).length;

  const noteIds = (store: ReturnType<typeof makeStore>): string[] => [
    ...store.getState().data.notes.keys(),
  ];

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t488-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN tombstones.json is ["a"], state.json holds a and b, the ghost holds only b and the server holds only b THEN within 1 s the store has no a, data.notes.size is 1, and 1 s later server.getObject("test-app", "note", "a") is undefined and 0 change frames name a', async () => {
    await prepare({ server: ['b'], ghost: ['b'], state: ['a', 'b'] });
    saveTombstones(dir, ['a']);

    const store = open();

    let gone = false;
    await poll(() => {
      gone = !store.getState().data.notes.has('a' as EntityId);
      return gone;
    });

    expect(gone).toBe(true);
    expect(store.getState().data.notes.size).toBe(1);

    await wait(1000);

    expect(store.getState().data.notes.has('a' as EntityId)).toBe(false);
    expect(server.getObject('test-app', 'note', 'a')).toBeUndefined();
    expect(framesFor('a')).toBe(0);
  });

  it('2: WHEN line 1\'s start has run for 300 ms, loadState(dir) is read, the returned stopSaving() is called and the same dir is started again THEN the state read has note ids exactly b, and 1 s after the second start the store has b only and 0 change frames name a', async () => {
    await prepare({ server: ['b'], ghost: ['b'], state: ['a', 'b'] });
    saveTombstones(dir, ['a']);

    const first = open();

    await wait(300);

    const loaded = loadState(dir);
    const loadedIds = [...(loaded?.data?.notes?.keys() ?? [])];

    stopSaving?.();
    stopSaving = undefined;

    expect(loadedIds).toEqual(['b']);

    const second = open();

    await wait(1000);

    expect(noteIds(second)).toEqual(['b']);
    expect(framesFor('a')).toBe(0);
  });

  it('3: WHEN tombstones.json is ["a"], state.json holds a and b, and both the ghost (version 1) and the server hold a THEN within 2 s the server has no a, b is still at version 1 with Seeded b, and the store has no a', async () => {
    await prepare({ server: ['a', 'b'], ghost: ['a', 'b'], state: ['a', 'b'] });
    saveTombstones(dir, ['a']);

    const store = open();

    let gone = false;
    await poll(() => {
      gone = server.getObject('test-app', 'note', 'a') === undefined;
      return gone;
    });

    const b = server.getObject('test-app', 'note', 'b');
    expect(gone).toBe(true);
    expect(b?.version).toBe(1);
    expect(b?.data.content).toBe('Seeded b');
    expect(store.getState().data.notes.has('a' as EntityId)).toBe(false);
  });

  it('4: WHEN tombstones.json is ["a"] and state.json holds a, a2 (Seeded a2) and b, with ghosts and server holding a2 and b THEN after 500 ms the store\'s note ids are exactly a2 and b, with contents Seeded a2 and Seeded b', async () => {
    await prepare({ server: ['a2', 'b'], ghost: ['a2', 'b'], state: ['a', 'a2', 'b'] });
    saveTombstones(dir, ['a']);

    const store = open();

    await wait(500);

    expect(noteIds(store)).toEqual(['a2', 'b']);
    expect(store.getState().data.notes.get('a2' as EntityId)?.content).toBe('Seeded a2');
    expect(store.getState().data.notes.get('b' as EntityId)?.content).toBe('Seeded b');
  });

  it('5: WHEN tombstones.json holds the text {not json and state.json holds a, a2 and b THEN after 500 ms data.notes.size is 3 and the store still has a', async () => {
    await prepare({ server: ['a', 'a2', 'b'], ghost: ['a', 'a2', 'b'], state: ['a', 'a2', 'b'] });
    fs.writeFileSync(path.join(dir, 'tombstones.json'), '{not json');

    const store = open();

    await wait(500);

    expect(store.getState().data.notes.size).toBe(3);
    expect(store.getState().data.notes.has('a' as EntityId)).toBe(true);
  });
});
