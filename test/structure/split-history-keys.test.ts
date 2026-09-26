import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { handleHistoryKey, openHistory } from '../../src/tui/app-keys';
import { makeNote, testNotes } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function seedNotes() {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    const noteId = eid(`note-${idx + 1}`);
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  });
  return store;
}

const entry = (store: ReturnType<typeof makeStore>, id: string) => ({
  id: id as never,
  note: store.getState().data.notes.get(id as never),
});

function makeNoteEntries(store: ReturnType<typeof makeStore>) {
  return ['note-1', 'note-5'].map((id) => entry(store, id));
}

function makeOpenHistoryCtx(store: ReturnType<typeof makeStore>, selectedEntry: { id: EntityId; note: Note } | null) {
  return {
    store,
    selectedEntry,
    setHistoryOpen: vi.fn(),
    setHistoryIndex: vi.fn(),
  };
}

function makeHistoryKeyCtx(store: ReturnType<typeof makeStore>, historyIndex: number) {
  return {
    store,
    noteEntries: makeNoteEntries(store),
    selectedIndex: 0,
    historyIndex,
    setHistoryIndex: vi.fn(),
    setHistoryOpen: vi.fn(),
  };
}

const loadRevisions = (store: ReturnType<typeof makeStore>) => {
  store.dispatch({
    type: 'LOAD_REVISIONS',
    noteId: eid('note-1'),
    revisions: [
      [1, makeNote('note-1', 'Old pinned text')],
      [2, makeNote('note-1', 'Newer pinned text')],
    ],
  });
};

describe('split-history-keys', () => {
  it('1: WHEN openHistory gets the note-1 entry THEN ui.openedNote goes from null to note-1, ui.showRevisions from false to true, setHistoryOpen was called with true, setHistoryIndex with 0; WHEN selectedEntry is null THEN store.getState() is unchanged (toBe)', () => {
    const store = seedNotes();
    expect(store.getState().ui.openedNote).toBe(null);
    expect(store.getState().ui.showRevisions).toBe(false);
    const ctx = makeOpenHistoryCtx(store, entry(store, 'note-1'));
    openHistory(ctx);
    expect(store.getState().ui.openedNote).toBe('note-1');
    expect(store.getState().ui.showRevisions).toBe(true);
    expect(ctx.setHistoryOpen).toHaveBeenCalledWith(true);
    expect(ctx.setHistoryIndex).toHaveBeenCalledWith(0);

    const before = store.getState();
    const ctxNull = makeOpenHistoryCtx(store, null);
    openHistory(ctxNull);
    expect(store.getState()).toBe(before);
  });

  it('2: WHEN after the load handleHistoryKey("", "Enter", ctx) is called with historyIndex: 1 THEN the content of note-1 becomes Old pinned text (before: it starts with Pinned note), data.notes.size is still 5, and setHistoryOpen was called with false', () => {
    const store = seedNotes();
    expect(store.getState().data.notes.get(eid('note-1'))?.content).toMatch(/^Pinned note/);
    const ctx = makeOpenHistoryCtx(store, entry(store, 'note-1'));
    openHistory(ctx);
    loadRevisions(store);

    const keyCtx = makeHistoryKeyCtx(store, 1);
    handleHistoryKey('', 'Enter', keyCtx);
    expect(store.getState().data.notes.get(eid('note-1'))?.content).toBe('Old pinned text');
    expect(store.getState().data.notes.size).toBe(5);
    expect(keyCtx.setHistoryOpen).toHaveBeenCalledWith(false);
  });

  it("3: WHEN after the load handleHistoryKey('', 'Escape', ctx) is called THEN ui.showRevisions goes from true to false, data.notes is the same Map (toBe), setHistoryOpen was called with false; the same holds for input h", () => {
    const store = seedNotes();
    openHistory(makeOpenHistoryCtx(store, entry(store, 'note-1')));
    loadRevisions(store);
    expect(store.getState().ui.showRevisions).toBe(true);

    const before = store.getState().data.notes;
    const ctx = makeHistoryKeyCtx(store, 0);
    handleHistoryKey('', 'Escape', ctx);
    const afterClose = store.getState().data.notes;
    expect(store.getState().ui.showRevisions).toBe(false);
    // CLOSE_REVISION clears noteRevisions but never touches the notes Map
    expect(afterClose).toBe(before);
    expect(ctx.setHistoryOpen).toHaveBeenCalledWith(false);

    // the same holds for input h
    openHistory(makeOpenHistoryCtx(store, entry(store, 'note-1')));
    loadRevisions(store);
    expect(store.getState().ui.showRevisions).toBe(true);
    expect(store.getState().data.notes).toBe(before);
    const ctxH = makeHistoryKeyCtx(store, 0);
    handleHistoryKey('h', null, ctxH);
    expect(store.getState().ui.showRevisions).toBe(false);
    expect(store.getState().data.notes).toBe(before);
    expect(ctxH.setHistoryOpen).toHaveBeenCalledWith(false);
  });

  it('4: WHEN openHistory ran but no LOAD_REVISIONS was dispatched and Enter is sent THEN data.notes is the same Map as before (toBe), ui.showRevisions is false and setHistoryOpen was called with false', () => {
    const store = seedNotes();
    openHistory(makeOpenHistoryCtx(store, entry(store, 'note-1')));
    const before = store.getState().data.notes;

    const ctx = makeHistoryKeyCtx(store, 0);
    handleHistoryKey('', 'Enter', ctx);
    expect(store.getState().data.notes).toBe(before);
    expect(store.getState().ui.showRevisions).toBe(false);
    expect(ctx.setHistoryOpen).toHaveBeenCalledWith(false);
  });

  it('5: WHEN after the load q and then e are sent THEN store.getState() is the same object as before (toBe) and neither setHistoryOpen nor setHistoryIndex was called again', () => {
    const store = seedNotes();
    openHistory(makeOpenHistoryCtx(store, entry(store, 'note-1')));
    loadRevisions(store);

    const ctx = makeHistoryKeyCtx(store, 0);
    const before = store.getState();
    handleHistoryKey('q', null, ctx);
    handleHistoryKey('e', null, ctx);
    expect(store.getState()).toBe(before);
    expect(ctx.setHistoryOpen).not.toHaveBeenCalled();
    expect(ctx.setHistoryIndex).not.toHaveBeenCalled();
  });

  it('6: WHEN the sources are read THEN src/tui/App.tsx contains handleHistoryKey( and openHistory(, neither restoreRevisionAction nor REVISIONS_TOGGLE, and has fewer than 290 lines; src/tui/app-keys.ts contains export function openHistory', () => {
    const app = read('src/tui/App.tsx');
    expect(app).toContain('handleHistoryKey(');
    expect(app).toContain('openHistory(');
    expect(app).not.toContain('restoreRevisionAction');
    expect(app).not.toContain('REVISIONS_TOGGLE');
    expect(app.split('\n').length).toBeLessThan(290);
    const keys = read('src/tui/app-keys.ts');
    expect(keys).toContain('export function openHistory');
  });
});
