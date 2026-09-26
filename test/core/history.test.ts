import { describe, it, expect, beforeEach } from 'vitest';
import { makeStore } from '../../src/core/store';
import type { EntityId, Note } from '@vendor/types';
import {
  revisionsOf,
  revisionLabel,
  restoreRevisionAction,
} from '../../src/core/history';

const eid = (id: string): EntityId => id as unknown as EntityId;

function makeNoteWithSystemTags(
  content: string,
  opts?: {
    pinned?: boolean;
    deleted?: boolean;
    markdown?: boolean;
    creationDate?: number;
    modificationDate?: number;
    tags?: string[];
    systemTags?: string[];
  }
): Note {
  const now = Math.floor(Date.now() / 1000);
  return {
    content,
    creationDate: opts?.creationDate ?? now,
    deleted: opts?.deleted ?? false,
    modificationDate: opts?.modificationDate ?? now,
    systemTags: (opts?.systemTags ?? [
      ...(opts?.pinned ? ['pinned' as const] : []),
      ...(opts?.markdown ? ['markdown' as const] : []),
    ]) as any,
    tags: (opts?.tags ?? []) as any,
  };
}

function buildStore() {
  const store = makeStore({ stubClient: {} });
  const n1 = eid('n1');
  const n2 = eid('n2');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n1,
    note: makeNoteWithSystemTags('Third draft', { pinned: true }),
  });

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n2,
    note: makeNoteWithSystemTags('Other note'),
  });

  store.dispatch({
    type: 'LOAD_REVISIONS',
    noteId: n1,
    revisions: [
      [1, makeNoteWithSystemTags('First draft')],
      [2, makeNoteWithSystemTags('Second draft\nbody', { modificationDate: 1000000000, systemTags: [] })],
      [10, makeNoteWithSystemTags('Tenth draft')],
    ],
  });

  return { store, n1, n2 };
}

describe('history', () => {
  let state: ReturnType<typeof makeStore>['getState'];
  let n1: EntityId;
  let n2: EntityId;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    const result = buildStore();
    store = result.store;
    n1 = result.n1;
    n2 = result.n2;
    state = store.getState.bind(store);
  });

  it('1: WHEN revisionsOf(state, n1) is called THEN it returns 3 entries whose versions are [10, 2, 1] and the first entry note content is "Tenth draft"', () => {
    const revs = revisionsOf(state(), n1);
    expect(revs.length).toBe(3);
    expect(revs.map((r) => r.version)).toEqual([10, 2, 1]);
    expect(revs[0].note.content).toBe('Tenth draft');
  });

  it('2a: WHEN revisionsOf(state, null) is called THEN it returns an array of length 0', () => {
    const revs = revisionsOf(state(), null);
    expect(revs.length).toBe(0);
  });

  it('2b: WHEN revisionsOf(state, n2) is called THEN it returns an array of length 0', () => {
    const revs = revisionsOf(state(), n2);
    expect(revs.length).toBe(0);
  });

  it('3: WHEN revisionLabel gets the version 2 entry of revisionsOf(state, n1) THEN it returns "v2  2001-09-09 01:46  Second draft"', () => {
    const revs = revisionsOf(state(), n1);
    const entry2 = revs.find((r) => r.version === 2);
    expect(entry2).toBeDefined();
    expect(revisionLabel(entry2!)).toBe('v2  2001-09-09 01:46  Second draft');
  });

  it('4: WHEN restoreRevisionAction(state, n1, 2) is dispatched THEN n1 goes from "Third draft" to "Second draft\\nbody", its systemTags still hold "pinned", data.notes.size stays 2 and the n2 note is the same object (toBe)', () => {
    // Capture the original n2 object reference
    const n2Before = state().data.notes.get(n2);
    expect(n2Before).toBeDefined();
    const n2Ref = n2Before;

    // Dispatch the restore action
    const action = restoreRevisionAction(state(), n1, 2);
    expect(action).not.toBeNull();
    store.dispatch(action as any);

    const after = state();
    const n1After = after.data.notes.get(n1);
    expect(n1After!.content).toBe('Second draft\nbody');
    expect(n1After!.systemTags).toContain('pinned');
    expect(after.data.notes.size).toBe(2);
    expect(after.data.notes.get(n2)).toBe(n2Ref);
  });

  it('5a: WHEN restoreRevisionAction(state, n1, 9) is called (version not loaded) THEN it returns null', () => {
    const result = restoreRevisionAction(state(), n1, 9);
    expect(result).toBeNull();
  });

  it('5b: WHEN restoreRevisionAction is called for the unknown note id n9 with version 2 THEN it returns null', () => {
    const n9 = eid('n9');
    const result = restoreRevisionAction(state(), n9, 2);
    expect(result).toBeNull();
  });

  it('6: WHEN restoreRevisionAction(state, n1, 2) is called and NOT dispatched THEN it returns an action with the type RESTORE_NOTE_REVISION and the noteId n1, and the store s n1 still has the content "Third draft"', () => {
    const action = restoreRevisionAction(state(), n1, 2);
    expect(action).not.toBeNull();
    if (action) {
      expect(action.type).toBe('RESTORE_NOTE_REVISION');
      expect((action as any).noteId).toBe(n1);
    }
    // Verify store is unchanged
    const n1Note = state().data.notes.get(n1);
    expect(n1Note!.content).toBe('Third draft');
  });
});
