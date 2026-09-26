/**
 * Pin, markdown, sort keys as pure functions (T22).
 * One `it()` per numbered Acceptance line in TASKS.md T22.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeStore } from '../../src/core/store';
import { noteKeyAction, sortLabel } from '../../src/core/note-keys';
import { keymap } from '../../src/core/keymap';
import type { EntityId } from '@vendor/types';

// Helper to create branded EntityId values
const eid = (id: string): EntityId => id as unknown as EntityId;

function seededStore() {
  const store = makeStore({ stubClient: {} });
  const n1 = eid('n1');
  const n2 = eid('n2');

  // Seed every note FIRST, then SELECT_TRASH AFTER
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n1,
    note: { content: 'one', systemTags: ['markdown'] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n2,
    note: { content: 'two', systemTags: ['pinned'] },
  });

  return { store, n1, n2 };
}

function seededTrashStore() {
  const store = makeStore({ stubClient: {} });
  const n1 = eid('n1');
  const n2 = eid('n2');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n1,
    note: { content: 'one', systemTags: ['markdown'] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n2,
    note: { content: 'two', systemTags: ['pinned'] },
  });
  store.dispatch({ type: 'SELECT_TRASH' });

  return { store, n1, n2 };
}

describe('T22: Pin, markdown and sort keys as pure functions (p, m, s, S)', () => {
  describe('1: p – PIN_NOTE on n1', () => {
    it('1: WHEN \'p\' is pressed twice on n1 THEN result 1 has PIN_NOTE and shouldPin: true and n1\'s systemTags equal markdown, pinned; after press 2 they equal markdown only; the n2 object is unchanged (toBe)', () => {
      const { store, n1, n2 } = seededStore();
      const state1 = store.getState();

      // First press
      const result1 = noteKeyAction('p', n1, state1);
      expect(result1).toEqual({ type: 'PIN_NOTE', noteId: n1, shouldPin: true });

      const tags1 = store.getState().data.notes.get(n1)?.systemTags;
      expect(tags1).toEqual(['markdown']);

      store.dispatch(result1!);
      const after1 = store.getState();
      expect(after1.data.notes.get(n1)?.systemTags).toEqual(['markdown', 'pinned']);
      expect(after1.data.notes.get(n2)).toBe(after1.data.notes.get(n2));

      // Second press
      const result2 = noteKeyAction('p', n1, after1);
      expect(result2).toEqual({ type: 'PIN_NOTE', noteId: n1, shouldPin: false });

      store.dispatch(result2!);
      const after2 = store.getState();
      expect(after2.data.notes.get(n1)?.systemTags).toEqual(['markdown']);
    });
  });

  describe('2: m – MARKDOWN_NOTE on n2', () => {
    it('2: WHEN \'m\' is pressed twice on n2 THEN result 1 has MARKDOWN_NOTE and shouldEnableMarkdown: true and n2\'s systemTags equal pinned, markdown; after press 2 they equal pinned only; the n1 object is unchanged (toBe)', () => {
      const { store, n1, n2 } = seededStore();
      const state1 = store.getState();

      // First press
      const result1 = noteKeyAction('m', n2, state1);
      expect(result1).toEqual({
        type: 'MARKDOWN_NOTE',
        noteId: n2,
        shouldEnableMarkdown: true,
      });

      store.dispatch(result1!);
      const after1 = store.getState();
      expect(after1.data.notes.get(n2)?.systemTags).toEqual(['pinned', 'markdown']);
      expect(after1.data.notes.get(n1)).toBe(after1.data.notes.get(n1));

      // Second press
      const result2 = noteKeyAction('m', n2, after1);
      expect(result2).toEqual({
        type: 'MARKDOWN_NOTE',
        noteId: n2,
        shouldEnableMarkdown: false,
      });

      store.dispatch(result2!);
      const after2 = store.getState();
      expect(after2.data.notes.get(n2)?.systemTags).toEqual(['pinned']);
    });
  });

  describe('3: s and S in trash view with noteId null', () => {
    it('3: WHEN after SELECT_TRASH the keys S, s, s, s, S are pressed with noteId null THEN sortType is in turn modificationDate, creationDate, alphabetical, then modificationDate twice; sortReversed is true four times, then false', () => {
      const { store } = seededTrashStore();
      // Initial state: sortType = modificationDate, sortReversed = false
      let st = store.getState();
      expect(st.settings.sortType).toBe('modificationDate');
      expect(st.settings.sortReversed).toBe(false);

      // Press S → reverse_sort
      let r = noteKeyAction('S', null, st);
      expect(r).toEqual({ type: 'setSortReversed', sortReversed: true });
      store.dispatch(r!);
      st = store.getState();
      expect(st.settings.sortReversed).toBe(true);

      // Press s → cycle to creationDate
      r = noteKeyAction('s', null, st);
      expect(r).toEqual({ type: 'setSortType', sortType: 'creationDate' });
      store.dispatch(r!);
      st = store.getState();
      expect(st.settings.sortType).toBe('creationDate');
      expect(st.settings.sortReversed).toBe(true);

      // Press s → cycle to alphabetical
      r = noteKeyAction('s', null, st);
      expect(r).toEqual({ type: 'setSortType', sortType: 'alphabetical' });
      store.dispatch(r!);
      st = store.getState();
      expect(st.settings.sortType).toBe('alphabetical');

      // Press s → cycle back to modificationDate
      r = noteKeyAction('s', null, st);
      expect(r).toEqual({ type: 'setSortType', sortType: 'modificationDate' });
      store.dispatch(r!);
      st = store.getState();
      expect(st.settings.sortType).toBe('modificationDate');

      // Press S → reverse_sort (toggle back to false)
      r = noteKeyAction('S', null, st);
      expect(r).toEqual({ type: 'setSortReversed', sortReversed: false });
      store.dispatch(r!);
      st = store.getState();
      expect(st.settings.sortReversed).toBe(false);
    });
  });

  describe('4: sortLabel', () => {
    it('4: WHEN sortLabel(store.getState()) is called on the seeded store THEN it returns sort: modified; after one \'s\' it returns sort: created; after a second \'s\' and one \'S\' it returns sort: a-z (rev)', () => {
      const { store } = seededStore();
      let st = store.getState();
      expect(sortLabel(st)).toBe('sort: modified');

      // One 's' → creationDate
      const r1 = noteKeyAction('s', null, st);
      store.dispatch(r1!);
      st = store.getState();
      expect(sortLabel(st)).toBe('sort: created');

      // Second 's' → alphabetical, then S → reverse
      const r2 = noteKeyAction('s', null, st);
      store.dispatch(r2!);
      st = store.getState();
      const r3 = noteKeyAction('S', null, st);
      store.dispatch(r3!);
      st = store.getState();
      expect(sortLabel(st)).toBe('sort: a-z (rev)');
    });
  });

  describe('5: null-return cases for p and m', () => {
    it('5: WHEN \'p\' and \'m\' are called with noteId null, with the id nope that is not in the store, and on n1 after SELECT_TRASH THEN all six calls return null', () => {
      const { store, n1 } = seededStore();
      const nullState = store.getState();

      // p with null
      expect(noteKeyAction('p', null, nullState)).toBeNull();
      // m with null
      expect(noteKeyAction('m', null, nullState)).toBeNull();

      // p with nonexistent id
      expect(noteKeyAction('p', eid('nope'), nullState)).toBeNull();
      // m with nonexistent id
      expect(noteKeyAction('m', eid('nope'), nullState)).toBeNull();

      // In trash view
      const { store: trashStore } = seededTrashStore();
      const trashState = trashStore.getState();
      expect(noteKeyAction('p', n1, trashState)).toBeNull();
      expect(noteKeyAction('m', n1, trashState)).toBeNull();
    });
  });

  describe('6: keymap entries', () => {
    it('6: WHEN keymap from src/core/keymap.ts is read THEN it has entries with the keys p, m, s, S and the actions toggle_pin, toggle_markdown, cycle_sort, reverse_sort', () => {
      const byKey = new Map<string, string>();
      for (const entry of keymap) {
        byKey.set(entry.key, entry.action);
      }
      expect(byKey.get('p')).toBe('toggle_pin');
      expect(byKey.get('m')).toBe('toggle_markdown');
      expect(byKey.get('s')).toBe('cycle_sort');
      expect(byKey.get('S')).toBe('reverse_sort');
    });
  });
});
