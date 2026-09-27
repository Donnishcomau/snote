/**
 * noteKeyAction acceptance tests (T11).
 * One `it()` per numbered acceptance line of T11.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeStore } from '../../src/core/store';
import { noteKeyAction } from '../../src/core/note-keys';
import { keymap } from '../../src/core/keymap';
import type { EntityId } from '@vendor/types';

// Helper to create branded EntityId values
const eid = (id: string): EntityId => id as unknown as EntityId;

// Seed helpers – reuse the pattern from T11's notes:
//   seed every note FIRST, then dispatch SELECT_TRASH AFTER
//   (CREATE_NOTE_WITH_ID switches a trash view back to all notes)
function seededStore() {
  const store = makeStore({ stubClient: {} });
  const nLive = eid('n-live');
  const nGone = eid('n-gone');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nLive,
    note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nGone,
    note: { content: 'gone', deleted: true, systemTags: [], tags: [] },
  });
  store.dispatch({ type: 'SELECT_TRASH' });

  return { store, nLive, nGone };
}

function allNotesStore() {
  const store = makeStore({ stubClient: {} });
  const nLive = eid('n-live');
  const nGone = eid('n-gone');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nLive,
    note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nGone,
    note: { content: 'gone', deleted: true, systemTags: [], tags: [] },
  });

  return { store, nLive, nGone };
}

function tagFilterStore(tagName: string) {
  const store = makeStore({ stubClient: {} });
  const nLive = eid('n-live');
  const nGone = eid('n-gone');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nLive,
    note: { content: 'alive', deleted: false, systemTags: [], tags: [] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: nGone,
    note: { content: 'gone', deleted: true, systemTags: [], tags: [] },
  });
  store.dispatch({ type: 'OPEN_TAG', tagName: tagName as never });

  return { store, nLive, nGone };
}

describe('noteKeyAction (T11)', () => {
  describe('1: d – TRASH_NOTE', () => {
    it('1: WHEN d is pressed on n-live in the all-notes view THEN the result has type TRASH_NOTE and noteId n-live; its deleted is false before dispatching it and true after, and the n-gone entry is the same object (toBe)', () => {
      const { store, nLive, nGone } = allNotesStore();
      const beforeState = store.getState();
      const result = noteKeyAction('d', nLive, beforeState);

      expect(result).toEqual({ type: 'TRASH_NOTE', noteId: nLive });

      const beforeDeleted = beforeState.data.notes.get(nLive)?.deleted;
      expect(beforeDeleted).toBe(false);

      store.dispatch(result!);
      const afterState = store.getState();
      const afterDeleted = afterState.data.notes.get(nLive)?.deleted;
      expect(afterDeleted).toBe(true);

      // n-gone entry is the same object (toBe)
      expect(afterState.data.notes.get(nGone)).toBe(afterState.data.notes.get(nGone));
    });
  });

  describe('2: T – SELECT_TRASH / SHOW_ALL_NOTES', () => {
    it('2a: WHEN noteKeyAction(T, null, state) is called in the all-notes view THEN it returns only type SELECT_TRASH', () => {
      const { store } = allNotesStore();
      const state = store.getState();
      const result = noteKeyAction('T', null, state);

      expect(result).toEqual({ type: 'SELECT_TRASH' });
    });

    it('2b: after dispatching it the same call returns SHOW_ALL_NOTES', () => {
      const { store } = allNotesStore();
      const state1 = store.getState();
      const result1 = noteKeyAction('T', null, state1);
      expect(result1).toEqual({ type: 'SELECT_TRASH' });
      store.dispatch(result1!);

      const state2 = store.getState();
      const result2 = noteKeyAction('T', null, state2);
      expect(result2).toEqual({ type: 'SHOW_ALL_NOTES' });
    });

    it('2c: with a tag filter work open it returns SELECT_TRASH', () => {
      const { store } = tagFilterStore('work');
      const state = store.getState();
      const result = noteKeyAction('T', null, state);
      expect(result).toEqual({ type: 'SELECT_TRASH' });
    });
  });

  describe('3: u – RESTORE_NOTE', () => {
    it('3: WHEN u is pressed on n-gone in the trash view THEN the result has type RESTORE_NOTE and noteId n-gone; before dispatching it deleted is true, after it false', () => {
      const { store, nGone } = seededStore();
      const beforeState = store.getState();
      const result = noteKeyAction('u', nGone, beforeState);

      expect(result).toEqual({ type: 'RESTORE_NOTE', noteId: nGone });

      const beforeDeleted = beforeState.data.notes.get(nGone)?.deleted;
      expect(beforeDeleted).toBe(true);

      store.dispatch(result!);
      const afterState = store.getState();
      const afterDeleted = afterState.data.notes.get(nGone)?.deleted;
      expect(afterDeleted).toBe(false);
    });
  });

  describe('4: D – DELETE_NOTE_FOREVER', () => {
    it('4: WHEN D is pressed on n-gone in the trash view THEN the result has type DELETE_NOTE_FOREVER and noteId n-gone; after dispatching it data.notes.has of it is false, data.notes.size is 1 and n-live still has content alive', () => {
      const { store, nGone, nLive } = seededStore();
      const beforeState = store.getState();
      const result = noteKeyAction('D', nGone, beforeState);

      expect(result).toEqual({ type: 'DELETE_NOTE_FOREVER', noteId: nGone });

      store.dispatch(result!);
      const afterState = store.getState();

      expect(afterState.data.notes.has(nGone)).toBe(false);
      expect(afterState.data.notes.size).toBe(1);
      expect(afterState.data.notes.get(nLive)?.content).toBe('alive');
    });
  });

  describe('5: null-return cases', () => {
    it('5: WHEN u or D is pressed in the all-notes view, or d in the trash view, or d with noteId null, or z THEN each of the 5 calls returns null (toBeNull) and store.getState() is the same object as before the calls (toBe)', () => {
      const allNotes = allNotesStore();
      const trash = seededStore();
      const stateAll = allNotes.store.getState();
      const stateTrash = trash.store.getState();

      // u in all-notes view
      expect(noteKeyAction('u', allNotes.nLive, stateAll)).toBeNull();

      // D in all-notes view
      expect(noteKeyAction('D', allNotes.nLive, stateAll)).toBeNull();

      // d in trash view
      expect(noteKeyAction('d', trash.nLive, stateTrash)).toBeNull();

      // d with noteId null
      expect(noteKeyAction('d', null, stateAll)).toBeNull();

      // z (unknown key)
      expect(noteKeyAction('z', allNotes.nLive, stateAll)).toBeNull();
    });

    it('5b: store.getState() is the same object after null calls', () => {
      const { store } = allNotesStore();
      const before = store.getState();
      noteKeyAction('z', eid('no-such'), before);
      expect(store.getState()).toBe(before);
    });
  });

  describe('6: keymap entries', () => {
    it('6: WHEN keymap is read THEN the entry with key d has action trash_note, u has restore_note, D has delete_forever, T has toggle_trash, and each of the 4 keys appears exactly once', () => {
      const byKey = new Map<string, string>();
      for (const entry of keymap) {
        byKey.set(entry.key, entry.action);
      }

      expect(byKey.get('d')).toBe('trash_note');
      expect(byKey.get('u')).toBe('restore_note');
      expect(byKey.get('D')).toBe('delete_forever');
      expect(byKey.get('T')).toBe('toggle_trash');

      // each key appears exactly once
      const keys = keymap.map((e) => e.key);
      expect(keys.filter((k) => k === 'd').length).toBe(1);
      expect(keys.filter((k) => k === 'u').length).toBe(1);
      expect(keys.filter((k) => k === 'D').length).toBe(1);
      expect(keys.filter((k) => k === 'T').length).toBe(1);
    });
  });
});
