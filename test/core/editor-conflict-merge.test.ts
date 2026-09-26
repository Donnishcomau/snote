import { describe, it, expect, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { mergeEditorReturn } from '../../src/core/editor-conflict-merge';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const wait = () => new Promise((r) => setTimeout(r, 50));

type StoreT = ReturnType<typeof makeStore>;

const BASE = 'Conflict target\noriginal body';
const LOCAL_APPEND = 'Conflict target\noriginal body\nLOCAL EDIT BY e2e';
const REMOTE_APPEND = 'Conflict target\noriginal body\nEDITED BY OTHER CLIENT DURING LOCAL EDIT';
const LOCAL_SAME_LINE = 'Conflict target\nLOCAL changed this line';
const REMOTE_SAME_LINE = 'Conflict target\nREMOTE changed this line differently';

function seedStore(content: string): StoreT {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n12'),
    note: {
      content: BASE,
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: 1,
      creationDate: 1,
    },
  } as never);
  // the "remote" state the store sits in before the editor returns
  store.dispatch({
    type: 'REMOTE_NOTE_UPDATE',
    noteId: eid('n12'),
    note: {
      content,
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: 2,
      creationDate: 1,
    },
  } as never);
  return store;
}

const contentOf = (store: StoreT): string | undefined =>
  store.getState().data.notes.get(eid('n12'))?.content;

const entryFor = (store: StoreT, baseContent: string) => ({
  id: eid('n12'),
  note: { content: baseContent } as Note,
});

describe('T299 editor return vs concurrent remote change', () => {
  it('1: WHEN mergeEditorReturn is called with base `Conflict target\\noriginal body`, local `Conflict target\\noriginal body\\nLOCAL EDIT BY e2e`, current equal to base THEN it returns { content: \'Conflict target\\noriginal body\\nLOCAL EDIT BY e2e\', conflict: false }', () => {
    const result = mergeEditorReturn(BASE, LOCAL_APPEND, BASE);
    expect(result).toEqual({
      content: 'Conflict target\noriginal body\nLOCAL EDIT BY e2e',
      conflict: false,
    });
  });

  it('2: WHEN mergeEditorReturn is called with base `Conflict target\\noriginal body`, local `Conflict target\\noriginal body\\nLOCAL EDIT BY e2e`, current `Conflict target\\noriginal body\\nEDITED BY OTHER CLIENT DURING LOCAL EDIT` THEN the returned content contains both `LOCAL EDIT BY e2e` and `EDITED BY OTHER CLIENT DURING LOCAL EDIT`, and conflict is false', () => {
    const result = mergeEditorReturn(BASE, LOCAL_APPEND, REMOTE_APPEND);
    expect(result.content).toContain('LOCAL EDIT BY e2e');
    expect(result.content).toContain('EDITED BY OTHER CLIENT DURING LOCAL EDIT');
    expect(result.conflict).toBe(false);
  });

  it('3: WHEN mergeEditorReturn is called with base `Conflict target\\noriginal body`, local `Conflict target\\nLOCAL changed this line`, current `Conflict target\\nREMOTE changed this line differently` THEN the returned content contains both `LOCAL changed this line` and `REMOTE changed this line differently`, and conflict is true', () => {
    const result = mergeEditorReturn(BASE, LOCAL_SAME_LINE, REMOTE_SAME_LINE);
    expect(result.content).toContain('LOCAL changed this line');
    expect(result.content).toContain('REMOTE changed this line differently');
    expect(result.conflict).toBe(true);
  });

  it('4: WHEN editSelectedNote is called for a note whose store content is `Conflict target\\noriginal body\\nEDITED BY OTHER CLIENT DURING LOCAL EDIT` (dispatched via REMOTE_NOTE_UPDATE before the runEditor stub resolves with `Conflict target\\noriginal body\\nLOCAL EDIT BY e2e`) THEN data.notes content for that note contains both `LOCAL EDIT BY e2e` and `EDITED BY OTHER CLIENT DURING LOCAL EDIT`', async () => {
    const store = seedStore(REMOTE_APPEND);
    const runEditor = vi.fn(async () => LOCAL_APPEND);
    editSelectedNote({
      store,
      selectedEntry: entryFor(store, BASE),
      setRawMode: vi.fn(),
      runEditor,
    });
    await wait();
    const content = contentOf(store);
    expect(content).toContain('LOCAL EDIT BY e2e');
    expect(content).toContain('EDITED BY OTHER CLIENT DURING LOCAL EDIT');
  });

  it('5: WHEN the same setup as line 4 instead has the runEditor stub and the REMOTE_NOTE_UPDATE both change the SAME first line (an unmergeable conflict) THEN onEditorError was called with `A change from another device could not be merged automatically - both versions were kept.`', async () => {
    const store = seedStore(REMOTE_SAME_LINE);
    const runEditor = vi.fn(async () => LOCAL_SAME_LINE);
    const onEditorError = vi.fn();
    editSelectedNote({
      store,
      selectedEntry: entryFor(store, BASE),
      setRawMode: vi.fn(),
      runEditor,
      onEditorError,
    });
    await wait();
    expect(onEditorError).toHaveBeenCalledWith(
      'A change from another device could not be merged automatically - both versions were kept.'
    );
  });

  it('6: WHEN mergeEditorReturn is called with local equal to base (`Conflict target\\noriginal body`) and current `Conflict target\\noriginal body\\nEDITED BY OTHER CLIENT DURING LOCAL EDIT` THEN it returns { content: \'Conflict target\\noriginal body\\nEDITED BY OTHER CLIENT DURING LOCAL EDIT\', conflict: false }', () => {
    const result = mergeEditorReturn(BASE, BASE, REMOTE_APPEND);
    expect(result).toEqual({
      content: 'Conflict target\noriginal body\nEDITED BY OTHER CLIENT DURING LOCAL EDIT',
      conflict: false,
    });
  });
});
