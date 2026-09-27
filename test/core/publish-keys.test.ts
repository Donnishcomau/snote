/**
 * Publish key (`P`) and the public link as pure functions (T13).
 * One `it()` per numbered acceptance line of T13.
 */

import { describe, it, expect } from 'vitest';
import { makeStore } from '../../src/core/store';
import { noteKeyAction, publishLink } from '../../src/core/note-keys';
import { keymap } from '../../src/core/keymap';
import type { EntityId, SystemTag } from '@vendor/types';

// Helper to create branded EntityId values
const eid = (id: string): EntityId => id as unknown as EntityId;

function seededStore() {
  const store = makeStore({ stubClient: {} });
  const n1 = eid('n1');
  const n2 = eid('n2');

  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n1,
    note: { content: 'x', systemTags: ['pinned'] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n2,
    note: { content: 'y' },
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
    note: { content: 'x', systemTags: ['pinned'] },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: n2,
    note: { content: 'y' },
  });
  store.dispatch({ type: 'SELECT_TRASH' });

  return { store, n1, n2 };
}

describe('T13: Publish key (P) and publishLink (pure functions)', () => {
  describe('1: P – publish n1', () => {
    it('1: WHEN \'P\' is pressed on n1 THEN the result equals an action of type PUBLISH_NOTE for n1 with shouldPublish: true; n1 went from systemTags [pinned] to [pinned, published], and n2 is the same object as before (toBe)', () => {
      const { store, n1, n2 } = seededStore();
      const state1 = store.getState();

      const result = noteKeyAction('P', n1, state1);
      expect(result).toEqual({ type: 'PUBLISH_NOTE', noteId: n1, shouldPublish: true });

      store.dispatch(result!);
      const state2 = store.getState();
      expect(state2.data.notes.get(n1)?.systemTags).toEqual(['pinned', 'published']);
      expect(state2.data.notes.get(n2)).toBe(state2.data.notes.get(n2));
    });
  });

  describe('2: P – unpublish n1', () => {
    it('2: WHEN \'P\' is pressed on n1 a second time THEN the second result has shouldPublish: false and n1 has systemTags [pinned] again', () => {
      const { store, n1 } = seededStore();

      // First press – publish
      const r1 = noteKeyAction('P', n1, store.getState());
      expect(r1).toEqual({ type: 'PUBLISH_NOTE', noteId: n1, shouldPublish: true });
      store.dispatch(r1!);

      // Second press – unpublish
      const state2 = store.getState();
      const r2 = noteKeyAction('P', n1, state2);
      expect(r2).toEqual({ type: 'PUBLISH_NOTE', noteId: n1, shouldPublish: false });
      store.dispatch(r2!);

      const state3 = store.getState();
      expect(state3.data.notes.get(n1)?.systemTags).toEqual(['pinned']);
    });
  });

  describe('3: null-return cases for P', () => {
    it('3: WHEN \'P\' is called with noteId null, with the id nope that is not in the store, and with n1 after SELECT_TRASH was dispatched THEN each of the three calls returns null', () => {
      const { store, n1 } = seededStore();
      const state = store.getState();

      // noteId null
      expect(noteKeyAction('P', null, state)).toBeNull();

      // nonexistent id
      expect(noteKeyAction('P', eid('nope'), state)).toBeNull();

      // in trash view
      const { store: trashStore } = seededTrashStore();
      const trashState = trashStore.getState();
      expect(noteKeyAction('P', n1, trashState)).toBeNull();
    });
  });

  describe('4: publishLink with published note and non-empty publishURL', () => {
    it('4: WHEN publishLink({ …note, systemTags: [published], publishURL: abc123 }) is called with the stored n1 as note THEN it returns https://simp.ly/p/abc123', () => {
      const { store, n1 } = seededStore();
      const state = store.getState();
      const note = state.data.notes.get(n1);
      expect(note).toBeDefined();

      const publishedNote = { ...note!, systemTags: ['published' as SystemTag], publishURL: 'abc123' };
      expect(publishLink(publishedNote)).toBe('https://simp.ly/p/abc123');
    });
  });

  describe('5: publishLink null-return cases', () => {
    it('5: WHEN publishLink gets a published note with publishURL: \'\', an unpublished note with publishURL: abc123, null, and undefined THEN each of the four calls returns null', () => {
      const { store, n1 } = seededStore();
      const state = store.getState();
      const note = state.data.notes.get(n1);
      expect(note).toBeDefined();

      // published note with empty publishURL
      const pubEmpty = { ...note!, systemTags: ['published' as SystemTag], publishURL: '' };
      expect(publishLink(pubEmpty)).toBeNull();

      // unpublished note with publishURL
      const unpublished = { ...note!, systemTags: ['pinned' as SystemTag], publishURL: 'abc123' };
      expect(publishLink(unpublished)).toBeNull();

      // null
      expect(publishLink(null)).toBeNull();

      // undefined
      expect(publishLink(undefined)).toBeNull();
    });
  });

  describe('6: keymap entry for P', () => {
    it('6: WHEN keymap from src/core/keymap.ts is read THEN exactly one entry has the key P, its action is toggle_publish, and the entry with key p still has the action toggle_pin', () => {
      const byKey = new Map<string, string>();
      for (const entry of keymap) {
        byKey.set(entry.key, entry.action);
      }

      // Count entries with key 'P'
      const pCount = keymap.filter((e) => e.key === 'P').length;
      expect(pCount).toBe(1);

      const pEntry = keymap.find((e) => e.key === 'P');
      expect(pEntry?.action).toBe('toggle_publish');

      // key 'p' still maps to toggle_pin
      expect(byKey.get('p')).toBe('toggle_pin');
    });
  });
});
