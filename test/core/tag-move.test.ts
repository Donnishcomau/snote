/**
 * Tag reorder pure function tests (T76).
 * Verifies `moveTagActions` produces the correct `REORDER_TAG` actions
 * and that the reducer applies them to the expected order.
 */
import { describe, it, expect } from 'vitest';
import { createStore } from 'redux';
import { moveTagActions, tagRows } from '../../src/core/collection';
import dataReducer from '@vendor/state/data/reducer';
import { makeNote } from '../tui/fixtures';
import { tagHashOf } from '@vendor/utils/tag-hash';
import type { TagName } from '@vendor/types';
import type * as A from '@vendor/state/action-types';
import { keymap } from '../../src/core/keymap';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

// ---- helpers ----

/**
 * Build a store whose `tags` reducer starts with four tags
 * (`d, c, b, a`) by importing four notes each tagged with a different
 * single tag.  `IMPORT_NOTE_WITH_ID` adds tags to `state.tags`
 * without an index.
 */
function makeTagsStore(
  noteTags: string[],
): Store<ReturnType<typeof dataReducer>, A.ActionType> {
  const store = createStore(dataReducer) as unknown as Store<ReturnType<typeof dataReducer>, A.ActionType>;

  // seed tags via IMPORT_NOTE_WITH_ID (notes without index → appear last)
  noteTags.forEach((tagName, idx) => {
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: `note-${idx}` as never,
      note: makeNote(`note-${idx}`, `content-${tagName}`, {
        tags: [tagName],
      }) as never,
    } as never);
  });

  return store;
}

// ---- acceptance tests ----

describe('moveTagActions', () => {
  // seed four notes tagged d, c, b, a (insertion order)
  const seedTagsStore = makeTagsStore(['d', 'c', 'b', 'a']);

  // rows = tagRows(store.getState().tags) → ['a','b','c','d']
  const rows = tagRows(seedTagsStore.getState().tags);

  it('1: moveTagActions(rows, "c", -1) returns 4 actions reordering c up; rows unmutated', () => {
    const result = moveTagActions(rows, 'c' as TagName, -1);
    expect(result).toHaveLength(4);
    expect(result.every((a: A.ActionType) => a.type === 'REORDER_TAG')).toBe(true);
    expect(result.map((a) => (a as A.ReorderTag).tagName)).toEqual(['a', 'c', 'b', 'd']);
    expect(result.map((a) => (a as A.ReorderTag).newIndex)).toEqual([0, 1, 2, 3]);
    expect(rows).toEqual(['a', 'b', 'c', 'd']);
  });

  it('2: dispatching those 4 actions in order yields ["a","c","b","d"] with indexes [0,1,2,3]', () => {
    const store = makeTagsStore(['d', 'c', 'b', 'a']);
    const actions = moveTagActions(tagRows(store.getState().tags), 'c' as TagName, -1);
    actions.forEach((a: A.ActionType) => store.dispatch(a));
    const newRows = tagRows(store.getState().tags);
    expect(newRows).toEqual(['a', 'c', 'b', 'd']);
    const idxes = newRows.map((name) => {
      const hash = tagHashOf(name as TagName);
      return store.getState().tags.get(hash)?.index;
    });
    expect(idxes).toEqual([0, 1, 2, 3]);
  });

  it('3: after line-2 steps, moveTagActions(newRows, "a", 1) gives ["c","a","b","d"], then moveTagActions(newRows2, "d", -1) gives ["c","a","d","b"]', () => {
    const store = makeTagsStore(['d', 'c', 'b', 'a']);
    let rows_ = tagRows(store.getState().tags);
    // move c up
    moveTagActions(rows_, 'c' as TagName, -1).forEach((a: A.ActionType) => store.dispatch(a));
    rows_ = tagRows(store.getState().tags);
    expect(rows_).toEqual(['a', 'c', 'b', 'd']);

    // move a down
    moveTagActions(rows_, 'a' as TagName, 1).forEach((a: A.ActionType) => store.dispatch(a));
    rows_ = tagRows(store.getState().tags);
    expect(rows_).toEqual(['c', 'a', 'b', 'd']);

    // move d up
    moveTagActions(rows_, 'd' as TagName, -1).forEach((a: A.ActionType) => store.dispatch(a));
    rows_ = tagRows(store.getState().tags);
    expect(rows_).toEqual(['c', 'a', 'd', 'b']);
  });

  it('4: boundary / missing tag returns empty array', () => {
    expect(moveTagActions(rows, 'a' as TagName, -1)).toHaveLength(0);
    expect(moveTagActions(rows, 'd' as TagName, 1)).toHaveLength(0);
    expect(moveTagActions(rows, 'zzz' as TagName, 1)).toHaveLength(0);
    expect(moveTagActions([], 'a' as TagName, 1)).toHaveLength(0);
  });

  it('5: moveTagActions(rows, "C", -1) returns same 4 actions using row spelling ("c")', () => {
    const result = moveTagActions(rows, 'C' as TagName, -1);
    expect(result).toHaveLength(4);
    expect(result.map((a) => (a as A.ReorderTag).tagName)).toEqual(['a', 'c', 'b', 'd']);
  });
});

describe('keymap J/K entries', () => {
  it('6: keymap has J→move_tag_down and K→move_tag_up', () => {
    const jEntry = keymap.find((e) => e.key === 'J');
    const kEntry = keymap.find((e) => e.key === 'K');
    expect(jEntry?.action).toBe('move_tag_down');
    expect(kEntry?.action).toBe('move_tag_up');
  });
});
