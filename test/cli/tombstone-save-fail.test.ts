/**
 * T494: A failed state save while dropping deleted-forever notes at start
 * no longer stops snote from starting. `dropTombstonedNotes` writes the
 * pruned state.json at once; when that write throws (here, a directory
 * named `state.json.tmp` makes `writeFileSync` fail with EISDIR) the
 * failure shows on the notice line like every other save failure does,
 * instead of throwing out of `buildStore`. Rig copied from
 * test/cli/delete-forever-restart.test.ts (T488).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { saveState } from '../../src/core/persistence';
import {
  currentProblem,
  onProblem,
  resetProblemSignal,
} from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';
import { saveTombstones } from '../../src/core/tombstones';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper copied from test/cli/delete-forever-restart.test.ts: every
// asserted value lives inside `cond`; after exhaustion we call `cond()`
// once more so the expect below sees the final observed value.
const poll = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  cond();
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ORIGINAL_MD = 1000;

// The Decisions: server and ghost hold `b` ("Seeded b", version 1);
// state.json holds `a` and `b`; tombstones.json is ["a"].
const CONTENT: Record<string, string> = {
  a: 'Seeded a',
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

describe('T494 a failed state save while dropping tombstoned notes at start', () => {
  let dir: string;
  let stopSaving: (() => void) | undefined;
  let problems: string[];
  let offProblem: (() => void) | undefined;

  // Lay out the data dir by hand per the Decisions: the server and the
  // ghost each hold `b` at version 1; state.json holds every id named in
  // `state`. The server is closed again at once: `buildStore` runs on the
  // stubbed client (as in the T488 rig), so the one thing these tests
  // observe happens entirely against the local files, and no server
  // socket stays open while they run.
  const prepare = async (state: string[]): Promise<void> => {
    const server = new FakeSimperiumServer();
    await server.start();
    try {
      server.seedBucket(
        'test-app',
        'note',
        ['b'].map((id) => ({
          id,
          data: noteData(id) as unknown as Record<string, unknown>,
          version: 1,
        }))
      );

      const g = new FileGhostStore(dir, 'note');
      await g.put('b', 1, noteData('b'));
      await g.setChangeVersion(server.getCV('test-app', 'note'));

      const stub = makeStore({ stubClient: {} });
      for (const id of state) {
        stub.dispatch({
          type: 'IMPORT_NOTE_WITH_ID',
          noteId: id as EntityId,
          note: noteData(id),
        } as A.ActionType);
      }
      saveState(stub.getState(), dir);
    } finally {
      server.stop();
    }
  };

  // The server is closed by `prepare` before any of this runs, so buildStore
  // dials a port nothing listens on (the T488 rig never needs it alive
  // either: everything buildStore does here happens on the stub client).
  const open = () => {
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: 'ws://127.0.0.1:1', noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    stopSaving = built.stopSaving;
    return built.store;
  };

  const hasNote = (
    store: ReturnType<typeof makeStore>,
    id: string
  ): boolean => store.getState().data.notes.has(id as EntityId);

  beforeEach(async () => {
    resetProblemSignal();
    // `currentProblem()` clears the slot when read, so a poll records
    // publishes through `onProblem` and only reads `currentProblem()`
    // once, outside the poll.
    problems = [];
    offProblem = onProblem((message) => problems.push(message));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t494-'));
  });

  afterEach(async () => {
    offProblem?.();
    offProblem = undefined;
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN `state.json.tmp` is a directory in the data dir and `buildStore` runs THEN it does not throw, within 1 s the store has no `a` and has `b`, and `currentProblem()` contains `could not save notes`', async () => {
    await prepare(['a', 'b']);
    saveTombstones(dir, ['a']);
    fs.mkdirSync(path.join(dir, 'state.json.tmp'));

    let store: ReturnType<typeof makeStore> | undefined;
    let threw: unknown;
    try {
      store = open();
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeUndefined();

    let settled = false;
    await poll(() => {
      const gone = store !== undefined && !hasNote(store, 'a');
      const kept = store !== undefined && hasNote(store, 'b');
      const problemSeen = problems.some((p) => p.includes('could not save notes'));
      settled = gone && kept && problemSeen;
      return settled;
    });

    const problem = currentProblem();

    expect(store).toBeDefined();
    expect(settled).toBe(true);
    expect(hasNote(store!, 'a')).toBe(false);
    expect(hasNote(store!, 'b')).toBe(true);
    expect(problem).toContain('could not save notes');
  });

  it('2: WHEN no `state.json.tmp` directory exists and `buildStore` runs THEN within 1 s the store has no `a` and `currentProblem()` is `null`', async () => {
    await prepare(['a', 'b']);
    saveTombstones(dir, ['a']);

    const store = open();

    let gone = false;
    let problemSeen = false;
    await poll(() => {
      gone = !hasNote(store, 'a');
      problemSeen = problems.some((p) => p.includes('could not save notes'));
      return gone && !problemSeen;
    });

    expect(gone).toBe(true);
    expect(currentProblem()).toBeNull();
  });

  it('3: WHEN `src/core/tombstones.ts` is read as text THEN it does not contain `as never` and contains `as EntityId`', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/core/tombstones.ts'),
      'utf8'
    );

    expect(source).not.toContain('as never');
    expect(source).toContain('as EntityId');
  });
});
