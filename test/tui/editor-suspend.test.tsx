import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { makeStore } from '../../src/core/store';
import { editSelectedNote, createNote } from '../../src/tui/app-actions';
import { testNotes } from './fixtures';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const wait = () => new Promise((r) => setTimeout(r, 50));

type StoreT = ReturnType<typeof makeStore>;

function seedNotes(): StoreT {
  const store = makeStore({ stubClient: {} });
  // 5 testNotes seeded
  testNotes.forEach((note, idx) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
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

const entry = (store: StoreT, id: string) => ({
  id: eid(id),
  note: store.getState().data.notes.get(eid(id)) as Note,
});

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('editor suspend', () => {
  let store: StoreT;
  let order: string[];
  let suspend: (run: () => Promise<void>) => Promise<unknown>;
  let runEditor: (initial: string) => Promise<string | null>;

  beforeEach(() => {
    store = seedNotes();
    order = [];
    suspend = vi.fn(async (run: () => Promise<void>) => {
      order.push('suspend');
      await run();
      order.push('resume');
    });
    runEditor = vi.fn(async () => {
      order.push('editor');
      return 'Edited text';
    });
  });

  it("1: WHEN editSelectedNote is called for note-3 with suspend and runEditor THEN order equals ['suspend', 'editor', 'resume'] and note-3 has the content Edited text", async () => {
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-3'),
      setRawMode: vi.fn(),
      runEditor,
      suspend,
    };
    editSelectedNote(ctx);
    await wait();
    expect(order).toEqual(['suspend', 'editor', 'resume']);
    expect(store.getState().data.notes.get(eid('note-3'))?.content).toBe('Edited text');
  });

  it("2: WHEN createNote is called with them THEN order equals ['suspend', 'editor', 'resume'] and data.notes.size goes from 5 to 6", async () => {
    expect(store.getState().data.notes.size).toBe(5);
    const ctx = {
      store,
      setRawMode: vi.fn(),
      runEditor,
      setSelectedIndex: vi.fn(),
      suspend,
    };
    createNote(ctx);
    await wait();
    expect(order).toEqual(['suspend', 'editor', 'resume']);
    expect(store.getState().data.notes.size).toBe(6);
  });

  it("3: WHEN runEditor rejects with new Error('editor failed: exit 1') inside suspend THEN order ends with resume, onEditorError was called with editor failed: exit 1, and data.notes is the same Map as before (toBe)", async () => {
    const failing = vi.fn(async () => {
      order.push('editor');
      throw new Error('editor failed: exit 1');
    });
    const before = store.getState().data.notes;
    const onEditorError = vi.fn();
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-3'),
      setRawMode: vi.fn(),
      runEditor: failing,
      onEditorError,
      suspend,
    };
    editSelectedNote(ctx);
    await wait();
    expect(order[order.length - 1]).toBe('resume');
    expect(onEditorError).toHaveBeenCalledWith('editor failed: exit 1');
    expect(store.getState().data.notes).toBe(before);
  });

  it("4: WHEN editSelectedNote is called WITHOUT suspend THEN note-3 still gets the content Edited text (today's path)", async () => {
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-3'),
      setRawMode: vi.fn(),
      runEditor,
    };
    editSelectedNote(ctx);
    await wait();
    expect(store.getState().data.notes.get(eid('note-3'))?.content).toBe('Edited text');
  });

  it("5: WHEN src/tui/App.tsx is read THEN it contains suspendTerminal at least 2 times and suspend: suspendTerminal exactly 2 times; and src/tui/app-actions.ts contains CREATE_NOTE_WITH_ID exactly 1 time and EDIT_NOTE exactly 1 time", () => {
    const app = read('src/tui/App.tsx');
    const actions = read('src/tui/app-actions.ts');
    expect(countOf(app, 'suspendTerminal')).toBeGreaterThanOrEqual(2);
    expect(countOf(app, 'suspend: suspendTerminal')).toBe(2);
    expect(countOf(actions, 'CREATE_NOTE_WITH_ID')).toBe(1);
    expect(countOf(actions, 'EDIT_NOTE')).toBe(1);
  });
});
