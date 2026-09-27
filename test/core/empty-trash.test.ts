/**
 * emptyTrashActions + E key acceptance tests (T74).
 * One `it()` per numbered acceptance line of T74.
 */

import { describe, it, expect } from 'vitest';
import { makeStore } from '../../src/core/store';
import { emptyTrashActions } from '../../src/core/note-keys';
import { keymap } from '../../src/core/keymap';
import type { EntityId } from '@vendor/types';

// Helper to create branded EntityId values
const eid = (id: string): EntityId => id as unknown as EntityId;

/**
 * Seed helper:
 *   - seed `n-gone1` (deleted: true), `n-live` (content 'alive', deleted: false),
 *     `n-gone2` (deleted: true)
 *   - SELECT_TRASH after seeding so that the trash view is active
 *   - data.notes.size = 3
 */
function seededTrashStore() {
  const store = makeStore({ stubClient: {} });

  const nGone1 = eid('n-gone1');
  const nLive = eid('n-live');
  const nGone2 = eid('n-gone2');

  // Seed every note FIRST (CREATE_NOTE_WITH_ID switches trash view back to all notes)
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nGone1,
    note: { content: 'gone1', deleted: true, systemTags: [], tags: [] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nLive,
    note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nGone2,
    note: { content: 'gone2', deleted: true, systemTags: [], tags: [] },
  });
  // Now switch to trash view
  store.dispatch({ type: 'SELECT_TRASH' });

  return { store, nGone1, nLive, nGone2 };
}

describe('emptyTrashActions (T74)', () => {
  describe('1: returns 2 DELETE_NOTE_FOREVER actions in trash view', () => {
    it('1: WHEN the trash view is on and emptyTrashActions(store.getState()) is called THEN it returns 2 actions of type DELETE_NOTE_FOREVER, noteId n-gone1 then n-gone2, and data.notes.size is still 3', () => {
      const { store, nGone1, nLive, nGone2 } = seededTrashStore();

      const actions = emptyTrashActions(store.getState());

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual({ type: 'DELETE_NOTE_FOREVER', noteId: nGone1 });
      expect(actions[1]).toEqual({ type: 'DELETE_NOTE_FOREVER', noteId: nGone2 });

      // state must be unchanged
      expect(store.getState().data.notes.size).toBe(3);
      expect(store.getState().data.notes.has(nGone1)).toBe(true);
      expect(store.getState().data.notes.has(nLive)).toBe(true);
      expect(store.getState().data.notes.has(nGone2)).toBe(true);
    });
  });

  describe('2: after dispatching every returned action', () => {
    it('2: WHEN every returned action is dispatched THEN data.notes.size is 1, n-live still has content alive, and a second call returns an array of length 0', () => {
      const { store, nGone1, nLive, nGone2 } = seededTrashStore();

      const actions = emptyTrashActions(store.getState());
      for (const action of actions) {
        store.dispatch(action);
      }

      expect(store.getState().data.notes.size).toBe(1);
      expect(store.getState().data.notes.get(nLive)?.content).toBe('alive');
      expect(store.getState().data.notes.has(nGone1)).toBe(false);
      expect(store.getState().data.notes.has(nGone2)).toBe(false);

      // second call should return empty
      const actions2 = emptyTrashActions(store.getState());
      expect(actions2).toHaveLength(0);
    });
  });

  describe('3: all notes view returns 0 actions', () => {
    it('3: WHEN the view is all notes (same 3 notes) THEN the function returns an array of length 0', () => {
      const store = makeStore({ stubClient: {} });

      const nGone1 = eid('n-gone1');
      const nLive = eid('n-live');
      const nGone2 = eid('n-gone2');

      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nGone1,
        note: { content: 'gone1', deleted: true, systemTags: [], tags: [] },
      });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nLive,
        note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
      });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nGone2,
        note: { content: 'gone2', deleted: true, systemTags: [], tags: [] },
      });
      // No SELECT_TRASH – stays in all-notes view

      const actions = emptyTrashActions(store.getState());
      expect(actions).toHaveLength(0);
    });
  });

  describe('4: deleted: 1 as never is treated as truthy', () => {
    it('4: WHEN a fourth note n-gone3 was seeded with deleted: 1 as never and the trash view is on THEN the result has length 3 and its last action has noteId n-gone3', () => {
      const store = makeStore({ stubClient: {} });

      const nGone1 = eid('n-gone1');
      const nLive = eid('n-live');
      const nGone2 = eid('n-gone2');
      const nGone3 = eid('n-gone3');

      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nGone1,
        note: { content: 'gone1', deleted: true, systemTags: [], tags: [] },
      });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nLive,
        note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
      });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nGone2,
        note: { content: 'gone2', deleted: true, systemTags: [], tags: [] },
      });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nGone3,
        note: { content: 'gone3', deleted: 1 as never, systemTags: [], tags: [] },
      });
      store.dispatch({ type: 'SELECT_TRASH' });

      const actions = emptyTrashActions(store.getState());

      expect(actions).toHaveLength(3);
      expect(actions[2]).toEqual({ type: 'DELETE_NOTE_FOREVER', noteId: nGone3 });
    });
  });

  describe('5: keymap entry for E', () => {
    it('5: WHEN keymap is read THEN exactly one entry has key E, its action is empty_trash, and the entry with key e still has action edit_note', () => {
      const entriesByKey = keymap.filter((e) => e.key === 'E');
      expect(entriesByKey).toHaveLength(1);
      expect(entriesByKey[0].action).toBe('empty_trash');

      const entryForEdit = keymap.find((e) => e.key === 'e');
      expect(entryForEdit?.action).toBe('edit_note');
    });
  });

  describe('6: only n-live in trash view returns 0 actions', () => {
    it('6: WHEN only n-live was seeded and the trash view is on THEN the function returns an array of length 0 and data.notes.size is still 1', () => {
      const store = makeStore({ stubClient: {} });

      const nLive = eid('n-live');

      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: nLive,
        note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
      });
      store.dispatch({ type: 'SELECT_TRASH' });

      const actions = emptyTrashActions(store.getState());

      expect(actions).toHaveLength(0);
      expect(store.getState().data.notes.size).toBe(1);
    });
  });
});
