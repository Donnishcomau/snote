import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { editSelectedNote, createNote, copyLink } from '../../src/tui/app-actions';
import { makeNote, testNotes } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const wait = () => new Promise((r) => setTimeout(r, 50));

type StoreT = ReturnType<typeof makeStore>;

function seedNotes() {
  const store = makeStore({ stubClient: {} });
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

function seedNote(store: StoreT, note: Note, id: string) {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: {
      content: note.content,
      systemTags: note.systemTags,
      tags: note.tags,
      deleted: note.deleted,
      modificationDate: note.modificationDate,
      creationDate: note.creationDate,
      publishURL: note.publishURL,
    },
  });
}

const entry = (store: StoreT, id: string) => ({
  id: eid(id),
  note: store.getState().data.notes.get(eid(id)) as Note,
});

function contents(store: StoreT): string[] {
  return [...store.getState().data.notes.values()].map((n) => n.content);
}

describe('split-actions', () => {
  it("1: WHEN createNote is called and runEditor resolves New text THEN data.notes.size goes from 5 to 6, exactly 1 note has the content New text, runEditor was called with '', and setRawMode was called with false and then true", async () => {
    const store = seedNotes();
    expect(store.getState().data.notes.size).toBe(5);
    const ctx = {
      store,
      setRawMode: vi.fn(),
      runEditor: vi.fn().mockResolvedValue('New text'),
      setSelectedIndex: vi.fn(),
    };
    createNote(ctx);
    await wait();
    expect(store.getState().data.notes.size).toBe(6);
    expect(contents(store).filter((c) => c === 'New text')).toHaveLength(1);
    expect(ctx.runEditor).toHaveBeenCalledWith('');
    expect(ctx.setRawMode.mock.calls.map((c) => c[0])).toEqual([false, true]);
  });

  it('2: WHEN createNote is called and runEditor resolves null THEN data.notes is the same Map as before (toBe) and setRawMode was called 2 times', async () => {
    const store = seedNotes();
    const before = store.getState().data.notes;
    const ctx = {
      store,
      setRawMode: vi.fn(),
      runEditor: vi.fn().mockResolvedValue(null),
      setSelectedIndex: vi.fn(),
    };
    createNote(ctx);
    await wait();
    expect(store.getState().data.notes).toBe(before);
    expect(ctx.setRawMode).toHaveBeenCalledTimes(2);
  });

  it('3: WHEN editSelectedNote gets note-3 and runEditor resolves Edited text THEN note-3 has the content Edited text, note-4 still starts with Second normal note, data.notes.size is 5; WHEN selectedEntry is null THEN runEditor was not called', async () => {
    const store = seedNotes();
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-3'),
      setRawMode: vi.fn(),
      runEditor: vi.fn().mockResolvedValue('Edited text'),
    };
    editSelectedNote(ctx);
    await wait();
    expect(store.getState().data.notes.get(eid('note-3'))?.content).toBe('Edited text');
    expect(store.getState().data.notes.get(eid('note-4'))?.content).toMatch(/^Second normal note/);
    expect(store.getState().data.notes.size).toBe(5);

    const nullCtx = {
      store,
      selectedEntry: null,
      setRawMode: vi.fn(),
      runEditor: vi.fn().mockResolvedValue('Edited text'),
    };
    editSelectedNote(nullCtx);
    await wait();
    expect(nullCtx.runEditor).not.toHaveBeenCalled();
  });

  it("4: WHEN copyLink gets the published note note-9 THEN copyText was called with https://simp.ly/p/abc123 and setCopyResult with { noteId: 'note-9', ok: true }; WHEN the note has no published tag THEN neither was called", async () => {
    const store = seedNotes();
    seedNote(store, { ...makeNote('note-9', 'Shared'), systemTags: ['published'], publishURL: 'abc123' }, 'note-9');
    const published = entry(store, 'note-9');
    const ctx = {
      selectedEntry: published,
      copyText: vi.fn(() => true),
      setCopyResult: vi.fn(),
    };
    copyLink(ctx);
    await wait();
    expect(ctx.copyText).toHaveBeenCalledWith('https://simp.ly/p/abc123');
    expect(ctx.setCopyResult).toHaveBeenCalledWith({ noteId: 'note-9', ok: true });

    const store2 = seedNotes();
    seedNote(store2, makeNote('note-9', 'Shared'), 'note-9');
    const unpCtx = {
      selectedEntry: entry(store2, 'note-9'),
      copyText: vi.fn(() => true),
      setCopyResult: vi.fn(),
    };
    copyLink(unpCtx);
    await wait();
    expect(unpCtx.copyText).not.toHaveBeenCalled();
    expect(unpCtx.setCopyResult).not.toHaveBeenCalled();
  });

  it("5: WHEN src/tui/App.tsx is read THEN it has none of CREATE_NOTE_WITH_ID, editInEditor, copyToClipboard, and still has input === 'j', input === 'k', keyName === 'Enter', keyName === 'Tab', input === 'q', input === 'v'", () => {
    const app = read('src/tui/App.tsx');
    expect(app).not.toContain('CREATE_NOTE_WITH_ID');
    expect(app).not.toContain('editInEditor');
    expect(app).not.toContain('copyToClipboard');
    expect(app).toContain("input === 'j'");
    expect(app).toContain("input === 'k'");
    expect(app).toContain("keyName === 'Enter'");
    expect(app).toContain("keyName === 'Tab'");
    expect(app).toContain("input === 'q'");
    expect(app).toContain("input === 'v'");
  });

  it('6: WHEN the lines of every .ts/.tsx file directly in src/tui are counted THEN App.tsx has fewer than 250 (about 255 before this task, about 205 after) and no file has 300 or more', () => {
    const dir = resolve(process.cwd(), 'src/tui');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    const lines = new Map(files.map((f) => [f, readFileSync(join(dir, f), 'utf8').split('\n').length]));
    expect(lines.get('App.tsx')!).toBeLessThan(250);
    for (const [file, count] of lines) {
      expect(count, file).toBeLessThan(300);
    }
  });
});
