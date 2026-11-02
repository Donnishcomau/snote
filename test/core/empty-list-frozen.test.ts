/**
 * #222: the two shared empty lists of the vendored code are
 * frozen, so a push on the default ui list or on the empty tag-suggestion result throws instead of
 * growing a list every reader shares. The search middleware's `filterTags` import does not exist in
 * snote's stubbed vendor/simplenote/tag-suggestions.ts (snote does not use that middleware), so it
 * is mocked here to return no tags, which is the path that hands out the empty list. The module is
 * loaded by a computed path: snote's typecheck does not cover that unused vendored file (its
 * imports and window globals do not typecheck), and a static import would pull it in.
 */
import { applyMiddleware, combineReducers, createStore } from 'redux';
import { describe, expect, it, vi } from 'vitest';

import dataReducer from '../../vendor/simplenote/state/data/reducer';
import settingsReducer from '../../vendor/simplenote/state/settings/reducer';
import uiReducer from '../../vendor/simplenote/state/ui/reducer';

vi.mock('../../vendor/simplenote/tag-suggestions', () => ({ filterTags: () => [] }));
const SEARCH_MODULE = ['..', '..', 'vendor', 'simplenote', 'search', 'index'].join('/');

describe('#222 the vendored empty lists are frozen', () => {
  it('5: WHEN the ui reducer default list and the empty search-tags result are read THEN each satisfies `Object.isFrozen` and a push on it throws `TypeError`', async () => {
    const { middleware: searchMiddleware } = (await import(/* @vite-ignore */ SEARCH_MODULE)) as { middleware: unknown };
    const ui = uiReducer(undefined, { type: 'snote/none' } as never);
    const store = createStore(
      combineReducers({ data: dataReducer, settings: settingsReducer, ui: uiReducer }),
      applyMiddleware(searchMiddleware as never),
    );
    store.dispatch({ type: 'SHOW_ALL_NOTES' } as never);
    const searchTags = (store.getState() as { ui: { tagSuggestions: unknown[] } }).ui.tagSuggestions;
    expect(searchTags).toEqual([]);
    expect(searchTags).not.toBe(ui.tagSuggestions);
    for (const [label, list] of [
      ['ui.filteredNotes', ui.filteredNotes],
      ['ui.unsyncedNoteIds', ui.unsyncedNoteIds],
      ['ui.tagSuggestions', ui.tagSuggestions],
      ['search tagSuggestions', searchTags],
    ] as [string, unknown[]][]) {
      expect(Object.isFrozen(list), label).toBe(true);
      expect(() => list.push('x'), label).toThrow(TypeError);
      expect(list, label).toEqual([]);
    }
  });
});
