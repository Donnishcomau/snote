import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { handleTagsKey } from '../../src/tui/app-keys';
import { makeNote } from '../tui/fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const tagRows = (store: ReturnType<typeof makeStore>) =>
  Array.from(store.getState().data.tags.keys());

function seedTags() {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('n1'),
    note: makeNote('n1', 'Alpha', { tags: ['home'] }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('n2'),
    note: makeNote('n2', 'Beta', { tags: ['work'] }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('n3'),
    note: makeNote('n3', 'Gamma', { tags: ['zoo'] }) as never,
  });
  return store;
}

function makeCtx(store: ReturnType<typeof makeStore>, tagIndex: number) {
  return {
    store,
    tagNames: ['home', 'work', 'zoo'],
    tagIndex,
    setTagIndex: vi.fn(),
    setSelectedIndex: vi.fn(),
    setTagsFocused: vi.fn(),
    setTagsOpen: vi.fn(),
    setTagDialog: vi.fn(),
  };
}

const collection = (store: ReturnType<typeof makeStore>) => store.getState().ui.collection;

describe('split-tags-keys', () => {
  it("1: WHEN handleTagsKey('', 'Enter', ctx) is called with tagIndex: 2 THEN ui.collection goes from { type: 'all' } to { type: 'tag', tagName: 'work' }, setSelectedIndex was called with 0 and setTagsFocused with false", () => {
    const store = seedTags();
    expect(collection(store)).toEqual({ type: 'all' });
    const ctx = makeCtx(store, 2);
    handleTagsKey('', 'Enter', ctx);
    expect(collection(store)).toEqual({ type: 'tag', tagName: 'work' });
    expect(ctx.setSelectedIndex).toHaveBeenCalledWith(0);
    expect(ctx.setTagsFocused).toHaveBeenCalledWith(false);
  });

  it("2: WHEN after that Enter is sent with tagIndex: 4 THEN ui.collection equals { type: 'untagged' }; WHEN then with tagIndex: 0 THEN it equals { type: 'all' }", () => {
    const store = seedTags();
    handleTagsKey('', 'Enter', makeCtx(store, 2));
    handleTagsKey('', 'Enter', makeCtx(store, 4));
    expect(collection(store)).toEqual({ type: 'untagged' });
    handleTagsKey('', 'Enter', makeCtx(store, 0));
    expect(collection(store)).toEqual({ type: 'all' });
  });

  it('3: WHEN K is sent with tagIndex: 2 THEN the rows go from [home, work, zoo] to [work, home, zoo] and setTagIndex was called with 1; WHEN with tagIndex: 1 THEN data.tags is the same Map (toBe) and it was not called', () => {
    const store = seedTags();
    expect(tagRows(store)).toEqual(['home', 'work', 'zoo']);
    const ctx = makeCtx(store, 2);
    handleTagsKey('K', null, ctx);
    expect(tagRows(store)).toEqual(['work', 'home', 'zoo']);
    expect(ctx.setTagIndex).toHaveBeenCalledWith(1);

    const before = store.getState().data.tags;
    const ctx2 = makeCtx(store, 1);
    handleTagsKey('K', null, ctx2);
    expect(store.getState().data.tags).toBe(before);
    expect(ctx2.setTagIndex).not.toHaveBeenCalled();
  });

  it("4: WHEN R is sent with tagIndex: 2 THEN setTagDialog was called with { kind: 'rename', tagName: 'work' }; WHEN x THEN with { kind: 'delete', tagName: 'work' }; WHEN R with tagIndex: 0 THEN it was not called", () => {
    const store = seedTags();
    const ctx = makeCtx(store, 2);
    handleTagsKey('R', null, ctx);
    expect(ctx.setTagDialog).toHaveBeenCalledWith({ kind: 'rename', tagName: 'work' });

    const ctx2 = makeCtx(store, 2);
    handleTagsKey('x', null, ctx2);
    expect(ctx2.setTagDialog).toHaveBeenCalledWith({ kind: 'delete', tagName: 'work' });

    const ctx3 = makeCtx(store, 0);
    handleTagsKey('R', null, ctx3);
    expect(ctx3.setTagDialog).not.toHaveBeenCalled();
  });

  it("5: WHEN t is sent THEN setTagsOpen and setTagsFocused were each called with false; WHEN '' with 'Tab' is sent THEN setTagsFocused was called with false, setTagsOpen was not called, and ui.collection is still { type: 'all' }", () => {
    const store = seedTags();
    const ctx = makeCtx(store, 2);
    handleTagsKey('t', null, ctx);
    expect(ctx.setTagsOpen).toHaveBeenCalledWith(false);
    expect(ctx.setTagsFocused).toHaveBeenCalledWith(false);

    const ctx2 = makeCtx(store, 2);
    handleTagsKey('', 'Tab', ctx2);
    expect(ctx2.setTagsFocused).toHaveBeenCalledWith(false);
    expect(ctx2.setTagsOpen).not.toHaveBeenCalled();
    expect(collection(store)).toEqual({ type: 'all' });
  });

  it('6: WHEN the sources are read THEN src/tui/App.tsx contains handleTagsKey( and neither moveTagActions nor SHOW_UNTAGGED_NOTES and has fewer than 320 lines, and src/tui/app-keys.ts contains export function handleTagsKey', () => {
    const app = read('src/tui/App.tsx');
    expect(app).toContain('handleTagsKey(');
    expect(app).not.toContain('moveTagActions');
    expect(app).not.toContain('SHOW_UNTAGGED_NOTES');
    expect(app.split('\n').length).toBeLessThan(320);
    const keys = read('src/tui/app-keys.ts');
    expect(keys).toContain('export function handleTagsKey');
  });
});
