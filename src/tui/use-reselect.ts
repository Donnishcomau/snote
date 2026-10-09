import { useRef } from 'react';
import { Store } from 'redux';

import type { State } from '../core/store';
import type { EntityId } from '@vendor/types';

interface ReselectCtx {
  store: Store<State>;
  /**
   * Declares the note that selection should land on after the upcoming
   * store-driven list update. useAppState applies it (clamping into range)
   * when the id appears in the new list, and keeps the selection from being
   * re-pinned to whatever row was selected while the list was filtered.
   */
  setExternalSelect: (id: EntityId | null) => void;
}

/**
 * T300: keep the note selected across a search clear.
 *
 * `remember(id)` declares the note to land on and clears the search. The
 * actual selection is applied by useAppState once the full (unfiltered)
 * list is back: the remembered id becomes the selected row, or row 0 if
 * the id is no longer in the list.
 */
export function useReselect(
  ctx: ReselectCtx
): (id: EntityId | null, filtered?: boolean) => void {
  const store = ctx.store;

  return (id: EntityId | null) => {
    if (id === null) {
      store.dispatch({ type: 'SEARCH', searchQuery: '' });
      ctx.setExternalSelect(null);
      return;
    }
    ctx.setExternalSelect(id);
    store.dispatch({ type: 'SEARCH', searchQuery: '' });
  };
}
