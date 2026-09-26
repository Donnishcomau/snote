import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from 'redux';

import { makeStore } from '../../src/core/store.js';
import { InMemoryGhost } from '../../vendor/simplenote/state/simperium/functions/in-memory-ghost.js';
import { FileGhostStore } from '../../src/core/ghost-store.js';
import { unsyncedNoteIds, requeueUnsynced } from '../../src/core/requeue.js';
import { makeNote } from '../tui/fixtures.js';

import type { EntityId, Note } from '@vendor/types';
import type { State } from '../../src/core/store';
import type * as A from '@vendor/state/action-types';

const eid = (id: string): EntityId => id as unknown as EntityId;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'snote-requeue-'));
}

describe('requeue', () => {
  let store: ReturnType<typeof makeStore>;
  let ghost: InMemoryGhost<Note>;
  let noteA: Note;
  let noteB: Note;
  let noteC: Note;
  let noteD: Note;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    noteA = makeNote('a', 'store and ghost equal', { modificationDate: 1000 });
    noteB = makeNote('b', 'edited offline', { modificationDate: 2000 });
    noteC = makeNote('c', 'stale', { modificationDate: 1000 });
    noteD = makeNote('d', 'in the store only', { modificationDate: 3000 });

    // Seed store with IMPORT_NOTE_WITH_ID
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('a'), note: noteA } as A.ActionType);
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('b'), note: noteB } as A.ActionType);
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('c'), note: noteC } as A.ActionType);
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('d'), note: noteD } as A.ActionType);

    // Ghost: a matches, b is old, c is newer on server
    ghost = new InMemoryGhost<Note>();
    ghost.put('a' as never, 1, noteA as never);
    ghost.put('b' as never, 1, makeNote('b', 'old', { modificationDate: 1000 }) as never);
    ghost.put('c' as never, 1, makeNote('c', 'newer on server', { modificationDate: 2000 }) as never);
  });

  it('1: WHEN unsyncedNoteIds(notes, ghost) is called THEN it resolves exactly [\'b\', \'d\']', async () => {
    const result = await unsyncedNoteIds(store.getState().data.notes, ghost);
    expect(result).toEqual(['b', 'd']);
  });

  it('2: WHEN requeueUnsynced(store, ghost) runs with vi.spyOn(store, \'dispatch\') THEN dispatch was called exactly twice, with IMPORT_NOTE_WITH_ID for b and for d, each carrying the store\'s note object', async () => {
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    await requeueUnsynced(store as Store<State, A.ActionType>, ghost);

    expect(dispatchSpy).toHaveBeenCalledTimes(2);

    // Check the dispatched actions
    const calls = dispatchSpy.mock.calls;
    const actionIds = calls.map((c) => (c[0] as { noteId: EntityId }).noteId);
    expect(actionIds).toContain('b');
    expect(actionIds).toContain('d');

    // Verify each dispatch carries the store's note object
    for (const call of calls) {
      const action = call[0] as { type: string; noteId: EntityId; note: Note };
      expect(action.type).toBe('IMPORT_NOTE_WITH_ID');
      const storeNote = store.getState().data.notes.get(action.noteId);
      expect(action.note).toBe(storeNote);
    }
  });

  it('3: WHEN it has run THEN the store\'s notes a, b, c, d have the same content and modificationDate as before', async () => {
    const beforeA = store.getState().data.notes.get(eid('a'));
    const beforeB = store.getState().data.notes.get(eid('b'));
    const beforeC = store.getState().data.notes.get(eid('c'));
    const beforeD = store.getState().data.notes.get(eid('d'));

    await requeueUnsynced(store as Store<State, A.ActionType>, ghost);

    expect(store.getState().data.notes.get(eid('a'))).toBe(beforeA);
    expect(store.getState().data.notes.get(eid('b'))).toBe(beforeB);
    expect(store.getState().data.notes.get(eid('c'))).toBe(beforeC);
    expect(store.getState().data.notes.get(eid('d'))).toBe(beforeD);
  });

  it('4: WHEN the ghost reader is a FileGhostStore on an empty temp dir THEN unsyncedNoteIds resolves all four ids', async () => {
    const dir = makeTempDir();
    try {
      const fileGhost = new FileGhostStore<Note>(dir, 'note');
      // No ghosts written — empty dir

      const result = await unsyncedNoteIds(store.getState().data.notes, fileGhost);
      expect(result).toEqual(['a', 'b', 'c', 'd']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5: WHEN notes is an empty Map THEN it resolves []', async () => {
    const result = await unsyncedNoteIds(new Map(), ghost);
    expect(result).toEqual([]);
  });
});
