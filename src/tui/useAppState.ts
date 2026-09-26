import { useEffect, useRef, useState } from 'react';
import { Store } from 'redux';

import type { State } from '../core/store';
import type { Note, EntityId } from '@vendor/types';
import { sortEntries } from './app-model';
import { parseQuery, matchParsed } from '../core/search';
import { inCollection } from '../core/collection';
import { tagRows } from '../core/collection';
import { pendingCount } from '../core/simperium-reducer';
import { sortLabel } from '../core/note-keys';

export function useAppState(store: Store<State>) {
  const [noteEntries, setNoteEntries] = useState<{ id: EntityId; note: Note }[]>([]);
  const selectedIdRef = useRef<EntityId | null>(null);
  const openedRef = useRef<EntityId | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(0);
  const [allTagNames, setAllTagNames] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [collection, setCollection] = useState<{ type: string; tagName?: string }>({ type: 'all' });
  const [inTrash, setInTrash] = useState(false);
  const [sortLabelStr, setSortLabelStr] = useState('');
  // T292: cache sorted entries keyed on (notes, sortType, sortReversed, inTrash)
  const sortCacheRef = useRef<{
    key: [unknown, State['settings']['sortType'], boolean, boolean];
    sorted: { id: EntityId; note: Note }[];
  } | null>(null);
  // T300: while a reselect (by id) is in flight, syncFromStore must not
  // re-pin selectedIdRef to whatever selectedIndex happens to be.
  // T300: id of a note whose reselect (after clearing a search) is in flight;
  // while set, syncFromStore must not re-pin selection to another note.
  const externalSelectRef = useRef<EntityId | null>(null);

  useEffect(() => {
    if (externalSelectRef.current !== null) return; // T300: a reselect is in flight; do not fight it
    selectedIdRef.current = noteEntries[selectedIndex]?.id ?? null;
  }, [noteEntries, selectedIndex]);

  useEffect(() => {
    const render = () => {
      const state = store.getState();
      const inTrashNow = state.ui.collection.type === 'trash';
      const cache = sortCacheRef.current;
      let sorted: { id: EntityId; note: Note }[];
      if (
        cache &&
        cache.key[0] === state.data.notes &&
        cache.key[1] === state.settings.sortType &&
        cache.key[2] === state.settings.sortReversed &&
        cache.key[3] === inTrashNow
      ) {
        sorted = cache.sorted;
      } else {
        const allEntries: { id: EntityId; note: Note }[] = [];
        for (const [id, note] of state.data.notes) {
          allEntries.push({ id, note });
        }
        sorted = sortEntries(
          allEntries,
          state.settings.sortType,
          state.settings.sortReversed,
          inTrashNow
        );
        sortCacheRef.current = {
          key: [state.data.notes, state.settings.sortType, state.settings.sortReversed, inTrashNow],
          sorted,
        };
      }
      const q = state.ui.searchQuery;
      setQuery(q);
      let filtered = sorted;
      if (q) {
        const parsed = parseQuery(q);
        filtered = sorted.filter((e) => matchParsed(e.note, parsed));
      }
      filtered = filtered.filter((e) =>
        inCollection(e.note, state.ui.collection, q !== '')
      );
      setNoteEntries(filtered);
      setInTrash(inTrashNow);
      setSortLabelStr(sortLabel(state));
      // T204: a locally created note opens itself (meta.nextNoteToOpen);
      // follow ui.openedNote onto the marker exactly once per change.
      const opened = state.ui.openedNote;
      if (opened !== openedRef.current) {
        openedRef.current = opened;
        if (opened && filtered.some((e) => e.id === opened)) {
          selectedIdRef.current = opened;
        }
      }
      // T300: a reselect is in flight — keep the id we reselect toward,
      // and let the reselect own selectedIndex (no clamping to 0).
      const ext = externalSelectRef.current;
      if (ext) {
        const at = filtered.findIndex((e) => e.id === ext);
        if (at >= 0) {
          selectedIdRef.current = ext;
          setSelectedIndex(at);
          externalSelectRef.current = null;
        }
      } else {
        const at = filtered.findIndex((e) => e.id === selectedIdRef.current);
        if (at >= 0) {
          setSelectedIndex(at);
        } else {
          setSelectedIndex((i) => Math.max(0, Math.min(i, filtered.length - 1)));
        }
      }
      setConnected(state.simperium.connected);
      setPending(pendingCount(state.simperium));
      const tags: string[] = [];
      for (const [, tag] of state.data.tags) {
        tags.push(tag.name);
      }
      setAllTagNames(tags);
      setTagNames(tagRows(state.data.tags));
      setCollection(state.ui.collection);
    };

    render();
    const unsubscribe = store.subscribe(render);
    return unsubscribe;
  }, [store]);

  // T300: start (or clear) a reselect by id; setExternalSelect(null) aborts it
  const setExternalSelect = (id: EntityId | null) => {
    externalSelectRef.current = id;
  };

  return { noteEntries, selectedIndex, setSelectedIndex, setExternalSelect, connected, pending, allTagNames, query, setQuery, tagNames, collection, inTrash, sortLabelStr };
}
