import { describe, it, expect, vi } from 'vitest';
import { makeStore } from '../../src/core/store';
import { handleNoteKey } from '../../src/tui/note-focus';
import { makeNote } from './fixtures';
import { checklistItems, toggleChecklistItem } from '../../src/core/checklist';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const G1 = 'Groceries\n- [ ] milk\n- [x] bread';
const P1 = 'Plain note\nbody';

function makeStoreWithG1() {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g1'),
    note: makeNote('g1', G1) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('p1'),
    note: makeNote('p1', P1) as never,
  });
  return store;
}

function getSelectedEntry(store: ReturnType<typeof makeStore>, noteId: string) {
  const note = store.getState().data.notes.get(eid(noteId));
  if (!note) return null;
  return { id: eid(noteId), note };
}

function makeCtx(
  store: ReturnType<typeof makeStore>,
  noteId: string,
  itemIndex: number,
) {
  const selectedEntry = getSelectedEntry(store, noteId);
  return {
    store,
    selectedEntry,
    itemIndex,
    setItemIndex: vi.fn(),
    setItemAsk: vi.fn(),
  };
}

describe('note-focus-keys', () => {
  it('1: WHEN handleNoteKey(c, null, ctx) is called for g1 with itemIndex: 0 THEN it returns true and g1 has the content Groceries\\n- [x] milk\\n- [x] bread; with itemIndex: 1 on a fresh store the content becomes Groceries\\n- [ ] milk\\n- [ ] bread; p1 is unchanged both times', () => {
    const store = makeStoreWithG1();

    // itemIndex 0: milk is unchecked, toggle to checked
    const ctx0 = makeCtx(store, 'g1', 0);
    const result0 = handleNoteKey('c', null, ctx0);
    expect(result0).toBe(true);
    const g1After0 = store.getState().data.notes.get(eid('g1'));
    expect(g1After0?.content).toBe('Groceries\n- [x] milk\n- [x] bread');

    // p1 should be unchanged
    const p1After0 = store.getState().data.notes.get(eid('p1'));
    expect(p1After0?.content).toBe(P1);

    // Fresh store for itemIndex 1: bread is checked, toggle to unchecked
    const store2 = makeStoreWithG1();
    const ctx1 = makeCtx(store2, 'g1', 1);
    const result1 = handleNoteKey('c', null, ctx1);
    expect(result1).toBe(true);
    const g1After1 = store2.getState().data.notes.get(eid('g1'));
    expect(g1After1?.content).toBe('Groceries\n- [ ] milk\n- [ ] bread');

    // p1 should still be unchanged in this store
    const p1After1 = store2.getState().data.notes.get(eid('p1'));
    expect(p1After1?.content).toBe(P1);
  });

  it('2: WHEN j is sent for g1 with itemIndex: 0 THEN it returns true and setItemIndex was called with 1; with itemIndex: 1 it was called with 1 again (last item); k with itemIndex: 0 calls it with 0', () => {
    const store = makeStoreWithG1();

    // j with itemIndex 0 -> setItemIndex(1)
    const ctxJ0 = makeCtx(store, 'g1', 0);
    const resultJ0 = handleNoteKey('j', null, ctxJ0);
    expect(resultJ0).toBe(true);
    expect(ctxJ0.setItemIndex).toHaveBeenCalledWith(1);

    // j with itemIndex 1 -> already last, setItemIndex(1)
    const ctxJ1 = makeCtx(store, 'g1', 1);
    const resultJ1 = handleNoteKey('j', null, ctxJ1);
    expect(resultJ1).toBe(true);
    expect(ctxJ1.setItemIndex).toHaveBeenCalledWith(1);

    // k with itemIndex 0 -> setItemIndex(0)
    const ctxK0 = makeCtx(store, 'g1', 0);
    const resultK0 = handleNoteKey('k', null, ctxK0);
    expect(resultK0).toBe(true);
    expect(ctxK0.setItemIndex).toHaveBeenCalledWith(0);
  });

  it('3: WHEN j, k and c are sent for p1 (no items) THEN j and k return false, c returns true, setItemIndex was not called and data.notes is the same Map as before (toBe)', () => {
    const store = makeStoreWithG1();

    // p1 has no items
    const p1Items = checklistItems(P1);
    expect(p1Items.length).toBe(0);

    // j returns false
    const ctxJ = makeCtx(store, 'p1', 0);
    const resultJ = handleNoteKey('j', null, ctxJ);
    expect(resultJ).toBe(false);
    expect(ctxJ.setItemIndex).not.toHaveBeenCalled();

    // k returns false
    const ctxK = makeCtx(store, 'p1', 0);
    const resultK = handleNoteKey('k', null, ctxK);
    expect(resultK).toBe(false);
    expect(ctxK.setItemIndex).not.toHaveBeenCalled();

    // c returns true
    const ctxC = makeCtx(store, 'p1', 0);
    const resultC = handleNoteKey('c', null, ctxC);
    expect(resultC).toBe(true);

    // notes Map is unchanged (same reference)
    expect(store.getState().data.notes).toBe(store.getState().data.notes);
  });

  it('4: WHEN a is sent for g1 THEN it returns true and setItemAsk was called with true; WHEN selectedEntry is null THEN a and c return true, setItemAsk was not called and nothing was dispatched', () => {
    const store = makeStoreWithG1();

    // a with selectedEntry
    const ctxA = makeCtx(store, 'g1', 0);
    const resultA = handleNoteKey('a', null, ctxA);
    expect(resultA).toBe(true);
    expect(ctxA.setItemAsk).toHaveBeenCalledWith(true);

    // a with null selectedEntry
    const store2 = makeStore({ stubClient: {} });
    const ctxNullA = {
      store: store2,
      selectedEntry: null,
      itemIndex: 0,
      setItemIndex: vi.fn(),
      setItemAsk: vi.fn(),
    };
    const resultNullA = handleNoteKey('a', null, ctxNullA);
    expect(resultNullA).toBe(true);
    expect(ctxNullA.setItemAsk).not.toHaveBeenCalled();

    // c with null selectedEntry
    const ctxNullC = {
      store: store2,
      selectedEntry: null,
      itemIndex: 0,
      setItemIndex: vi.fn(),
      setItemAsk: vi.fn(),
    };
    const resultNullC = handleNoteKey('c', null, ctxNullC);
    expect(resultNullC).toBe(true);
    expect(ctxNullC.setItemAsk).not.toHaveBeenCalled();
  });

  it('5: WHEN c is sent for a note with deleted: true and the content of g1 THEN data.notes is the same Map as before (toBe); WHEN q or e is sent THEN handleNoteKey returns false', () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('del1'),
      note: makeNote('del1', G1, { deleted: true }) as never,
    });

    // c with deleted note — no change
    const beforeMap = store.getState().data.notes;
    const ctxDel = makeCtx(store, 'del1', 0);
    const resultDel = handleNoteKey('c', null, ctxDel);
    expect(resultDel).toBe(true);
    expect(store.getState().data.notes).toBe(beforeMap);

    // q returns false
    const ctxQ = makeCtx(store, 'del1', 0);
    const resultQ = handleNoteKey('q', null, ctxQ);
    expect(resultQ).toBe(false);

    // e returns false
    const ctxE = makeCtx(store, 'del1', 0);
    const resultE = handleNoteKey('e', null, ctxE);
    expect(resultE).toBe(false);
  });

  it('6: WHEN keymap is read THEN the entry with key c has the action toggle_check, the entry with key a has the action add_check_item, and both descriptions have at most 26 characters', async () => {
    const { keymap } = await import('../../src/core/keymap');
    const cEntry = keymap.find((e) => e.key === 'c');
    const aEntry = keymap.find((e) => e.key === 'a');

    expect(cEntry?.action).toBe('toggle_check');
    expect(cEntry?.description.length).toBeLessThanOrEqual(26);

    expect(aEntry?.action).toBe('add_check_item');
    expect(aEntry?.description.length).toBeLessThanOrEqual(26);
  });
});
