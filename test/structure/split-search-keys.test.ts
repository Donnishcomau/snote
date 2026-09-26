import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { handleSearchKey } from '../../src/tui/app-keys';
import { testNotes } from '../tui/fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function seed() {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    const noteId = eid('note-' + (idx + 1));
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
  store.dispatch({ type: 'SEARCH', searchQuery: 'ab' });
  return store;
}

const query = (store: ReturnType<typeof makeStore>) => store.getState().ui.searchQuery;

function makeCtx(store: ReturnType<typeof makeStore>) {
  return {
    store,
    setSearchOpen: vi.fn(),
    setQuery: vi.fn(),
    setSelectedIndex: vi.fn(),
  };
}

describe('split-search-keys', () => {
  it("1: WHEN handleSearchKey('c', {}, ctx) is called THEN the query goes from ab to abc, setSelectedIndex was called with 0, setSearchOpen was not called, and data.notes is the same Map as before (toBe)", () => {
    const store = seed();
    const ctx = makeCtx(store);
    const before = store.getState().data.notes;
    expect(query(store)).toBe('ab');
    handleSearchKey('c', {} as never, ctx);
    expect(query(store)).toBe('abc');
    expect(ctx.setSelectedIndex).toHaveBeenCalledWith(0);
    expect(ctx.setSearchOpen).not.toHaveBeenCalled();
    expect(store.getState().data.notes).toBe(before);
  });

  it("2: WHEN it is called with '' and { backspace: true } THEN the query goes from ab to a; WHEN the query is '' and the same call is made THEN it stays '' and setSelectedIndex was not called", () => {
    const store = seed();
    const ctx = makeCtx(store);
    expect(query(store)).toBe('ab');
    handleSearchKey('', { backspace: true } as never, ctx);
    expect(query(store)).toBe('a');

    store.dispatch({ type: 'SEARCH', searchQuery: '' });
    ctx.setSelectedIndex.mockClear();
    handleSearchKey('', { backspace: true } as never, ctx);
    expect(query(store)).toBe('');
    expect(ctx.setSelectedIndex).not.toHaveBeenCalled();
  });

  it("3: WHEN it is called with '' and { escape: true } THEN the query is '', setQuery was called with '', setSearchOpen with false and setSelectedIndex with 0", () => {
    const store = seed();
    const ctx = makeCtx(store);
    handleSearchKey('', { escape: true } as never, ctx);
    expect(query(store)).toBe('');
    expect(ctx.setQuery).toHaveBeenCalledWith('');
    expect(ctx.setSearchOpen).toHaveBeenCalledWith(false);
    expect(ctx.setSelectedIndex).toHaveBeenCalledWith(0);
  });

  it("4: WHEN it is called with '' and { return: true } THEN the query is still ab and setSearchOpen was called with false; WHEN it is called with x and { ctrl: true } THEN the query is still ab and no setter was called", () => {
    const store = seed();
    const ctx = makeCtx(store);
    handleSearchKey('', { return: true } as never, ctx);
    expect(query(store)).toBe('ab');
    expect(ctx.setSearchOpen).toHaveBeenCalledWith(false);

    const ctx2 = makeCtx(store);
    handleSearchKey('x', { ctrl: true } as never, ctx2);
    expect(query(store)).toBe('ab');
    expect(ctx2.setQuery).not.toHaveBeenCalled();
    expect(ctx2.setSearchOpen).not.toHaveBeenCalled();
    expect(ctx2.setSelectedIndex).not.toHaveBeenCalled();
  });

  it("5: WHEN src/tui/App.tsx is read THEN it contains handleSearchKey(input, key, and useInput( and isActive: emptyAsk === 0, and not currentQuery; and src/tui/app-keys.ts contains export function handleSearchKey", () => {
    const app = read('src/tui/App.tsx');
    expect(app).toContain('handleSearchKey(input, key,');
    expect(app).toContain('useInput(');
    expect(app).toContain('isActive: emptyAsk === 0');
    expect(app).not.toContain('currentQuery');
    const keys = read('src/tui/app-keys.ts');
    expect(keys).toContain('export function handleSearchKey');
  });

  it('6: WHEN the lines of src/tui/App.tsx are counted THEN there are fewer than 370', () => {
    const lines = read('src/tui/App.tsx').split('\n').length;
    expect(lines).toBeLessThan(370);
  });
});
