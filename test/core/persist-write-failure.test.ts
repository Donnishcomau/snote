import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { persistOnChange, loadState } from '../../src/core/persistence';
import { FileGhostStore } from '../../src/core/ghost-store';
import {
  currentProblem,
  resetProblemSignal,
} from '../../src/core/problem-signal';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Poll until the condition holds or 2 s pass; the whole predicate, every
// asserted value included, runs inside the loop.
async function until(cond: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createNote(store: ReturnType<typeof makeStore>, id: string, content: string): void {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: { content, systemTags: [], tags: [] },
  });
}

// Redux only enqueues listeners that existed at dispatch time, so a
// `persistOnChange` attached after the seed actions never fires until
// something new is dispatched; this edit gives the saver a fresh
// `state.data` reference to flush.
function touchNote(store: ReturnType<typeof makeStore>, id: string, content: string): void {
  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: eid(id),
    changes: { content },
  });
}

describe('persist-write-failure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-write-fail-'));
    resetProblemSignal();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN `state.json.tmp` is a directory, a note is created and the stop function of `persistOnChange(store, dir, 50)` is called THEN it does not throw and `currentProblem()` is `could not save notes: EISDIR`", () => {
    fs.mkdirSync(path.join(tmpDir, 'state.json.tmp'));
    const store = makeStore({ stubClient: {} });

    const stop = persistOnChange(store, tmpDir, 50);
    createNote(store, 'note-1', 'First note');
    touchNote(store, 'note-1', 'First note');

    expect(() => stop()).not.toThrow();
    expect(currentProblem()).toBe('could not save notes: EISDIR');
  });

  it("2: WHEN `state.json.tmp` is a directory and a note is created under `persistOnChange(store, dir, 50)` without stopping THEN within 1 s `currentProblem()` is `could not save notes: EISDIR` and the timer throws nothing", async () => {
    fs.mkdirSync(path.join(tmpDir, 'state.json.tmp'));
    const store = makeStore({ stubClient: {} });

    let uncaught: unknown = null;
    const onUncaught = (err: Error): void => {
      uncaught = err;
    };
    process.on('uncaughtException', onUncaught);
    try {
      persistOnChange(store, tmpDir, 50);
      createNote(store, 'note-1', 'Timer note');
      touchNote(store, 'note-1', 'Timer note');

      let seen: string | null = null;
      await until(
        () => {
          const value = currentProblem();
          if (value !== null) {
            seen = value;
          }
          return uncaught === null && seen === 'could not save notes: EISDIR';
        },
        'currentProblem to become `could not save notes: EISDIR` with no uncaught exception'
      );
      expect(uncaught).toBe(null);
      expect(seen).toBe('could not save notes: EISDIR');
    } finally {
      process.removeListener('uncaughtException', onUncaught);
    }
  });

  it("3: WHEN a save failed as in line 1, the `state.json.tmp` directory is then removed and a new `persistOnChange(store, dir, 50)` is stopped THEN `loadState(dir).data.notes.size` is `1`", () => {
    const blocker = path.join(tmpDir, 'state.json.tmp');
    fs.mkdirSync(blocker);
    const store = makeStore({ stubClient: {} });

    const firstStop = persistOnChange(store, tmpDir, 50);
    createNote(store, 'note-1', 'Surviving note');
    touchNote(store, 'note-1', 'Surviving note');
    firstStop();
    expect(currentProblem()).toBe('could not save notes: EISDIR');

    fs.rmSync(blocker, { recursive: true, force: true });

    const secondStop = persistOnChange(store, tmpDir, 50);
    touchNote(store, 'note-1', 'Surviving note again');
    secondStop();

    const loaded = loadState(tmpDir);
    expect(loaded?.data.notes.size).toBe(1);
  });

  it("4: WHEN `ghosts-note.json.tmp` is a directory and `setChangeVersion('7')` then `put('n1', 1, { content: 'x' })` are awaited THEN neither throws nor rejects and `currentProblem()` is `could not save sync state: EISDIR`", async () => {
    fs.mkdirSync(path.join(tmpDir, 'ghosts-note.json.tmp'));
    const store = new FileGhostStore(tmpDir, 'note');

    await expect(store.setChangeVersion('7')).resolves.toBeUndefined();
    await expect(store.put('n1', 1, { content: 'x' })).resolves.toEqual({
      key: 'n1',
      version: 1,
      data: { content: 'x' },
    });

    expect(currentProblem()).toBe('could not save sync state: EISDIR');
  });

  it("5: WHEN nothing fails (empty dir, one note, stop called) THEN `currentProblem()` is `null` and `state.json` exists", () => {
    const store = makeStore({ stubClient: {} });

    const stop = persistOnChange(store, tmpDir, 50);
    createNote(store, 'note-1', 'Quiet note');
    stop();

    expect(currentProblem()).toBe(null);
    expect(fs.existsSync(path.join(tmpDir, 'state.json'))).toBe(true);
  });
});
