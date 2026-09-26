import React from 'react';
import { Store } from 'redux';

import { moveTagActions } from '../core/collection';
import { revisionsOf, restoreRevisionAction } from '../core/history';
import { pushKeyEvent } from '../core/crash-ring';
import { shouldAutoOpenTags } from '../core/layout';
import { emptyTrashActions } from '../core/note-keys';
import { copyLink, forceSyncNow } from './app-actions';
import type { State } from '../core/store';
import type { KeyEvent } from '../core/crash-ring';

import type { EntityId, Note, TagName } from '@vendor/types';
import type { Key } from 'ink';

let keyLog: KeyEvent[] = [];

export function recordKeyEvent(input: string, key: Key, textPromptOpen: boolean): void {
  // T291 — while a text prompt is open the user is typing content; the ring
  // must never store what was typed, only that a keystroke happened.
  keyLog = pushKeyEvent(keyLog, { input: textPromptOpen && input ? '<text>' : input, key: { ...key } });
}

export function getKeyLog(): KeyEvent[] {
  return keyLog;
}

export function resetKeyLog(): void {
  keyLog = [];
}

export interface SearchKeyCtx {
  store: Store<State>;
  setSearchOpen: (v: boolean) => void;
  setQuery: (v: string) => void;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  // T300: when present, Escape keeps the selected note instead of jumping to row 0
  rememberSelection?: () => void;
}

/**
 * Handle a key press while the search input is open.
 */
export function handleSearchKey(input: string, key: Key, ctx: SearchKeyCtx): void {
  const { store, setSearchOpen, setQuery, setSelectedIndex, rememberSelection } = ctx;
  if (key.return) {
    setSearchOpen(false);
    return;
  }
  if (key.escape) {
    if (rememberSelection) {
      // T300: rememberSelection clears the query and useReselect reselects the note
      rememberSelection();
      setSearchOpen(false);
      return;
    }
    store.dispatch({ type: 'SEARCH', searchQuery: '' });
    setQuery('');
    setSearchOpen(false);
    setSelectedIndex(0);
    return;
  }
  if (key.backspace || key.delete) {
    const currentQuery = store.getState().ui.searchQuery;
    if (currentQuery.length > 0) {
      store.dispatch({
        type: 'SEARCH',
        searchQuery: currentQuery.slice(0, -1),
      });
      setSelectedIndex(0);
    }
    return;
  }
  if (input && input !== '\r' && input !== '\u001b' && !key.ctrl && !key.meta && !key.tab) {
    store.dispatch({ type: 'SEARCH', searchQuery: store.getState().ui.searchQuery + input });
    setSelectedIndex(0);
    return;
  }
  return;
}

/**
 * T300: Escape with a query applied — clear it but keep the selected note.
 * Returns true when the key was handled.
 */
export function handleSearchClearKey(
  keyName: string | null,
  ctx: { store: Store<State>; query: string; selectedId: EntityId | null; remember: (id: EntityId | null, filtered?: boolean) => void }
): boolean {
  if (keyName !== 'Escape' || !ctx.query) return false;
  ctx.remember(ctx.selectedId, true);
  return true;
}

export interface TagsKeyCtx {
  store: Store<State>;
  tagNames: string[];
  tagIndex: number;
  setTagIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setTagsFocused: (v: boolean) => void;
  setTagsOpen: (v: boolean) => void;
  setTagDialog: (v: null | { kind: 'rename' | 'delete'; tagName: string }) => void;
}

/**
 * Handle a key press while the tags pane has focus.
 */
export function handleTagsKey(input: string, keyName: string | null, ctx: TagsKeyCtx): void {
  const { store, tagNames, tagIndex, setTagIndex, setSelectedIndex, setTagsFocused, setTagsOpen, setTagDialog } = ctx;
  if (keyName === 'downArrow' || input === 'j') {
    setTagIndex((i) => Math.min(i + 1, tagNames.length + 2));
    return;
  }
  if (keyName === 'upArrow' || input === 'k') {
    setTagIndex((i) => Math.max(i - 1, 0));
    return;
  }
  if (keyName === 'Enter') {
    if (tagIndex === 0) {
      store.dispatch({ type: 'SHOW_ALL_NOTES' });
    } else if (tagIndex === tagNames.length + 1) {
      store.dispatch({ type: 'SHOW_UNTAGGED_NOTES' });
    } else if (tagIndex === tagNames.length + 2) {
      // the Trash row opens the trash, same state as the `T` key
      store.dispatch({ type: 'SELECT_TRASH' });
    } else {
      store.dispatch({ type: 'OPEN_TAG', tagName: tagNames[tagIndex - 1] });
    }
    setSelectedIndex(0);
    setTagsFocused(false);
    return;
  }
  if (keyName === 'Tab') {
    setTagsFocused(false);
    return;
  }
  if (input === 't' || keyName === 'Escape') {
    setTagsOpen(false);
    setTagsFocused(false);
    return;
  }
  // R = rename tag, x = delete tag (only on actual tag rows, not All notes/Untagged)
  if (tagIndex > 0 && tagIndex <= tagNames.length) {
    if (input === 'R') {
      setTagDialog({ kind: 'rename', tagName: tagNames[tagIndex - 1] });
      return;
    }
    if (input === 'x') {
      setTagDialog({ kind: 'delete', tagName: tagNames[tagIndex - 1] });
      return;
    }
    // J = move tag down, K = move tag up
    if (input === 'K' || input === 'J') {
      const delta = input === 'K' ? -1 : 1;
      const actions = moveTagActions(tagNames as TagName[], tagNames[tagIndex - 1] as TagName, delta as -1 | 1);
      if (actions.length > 0) {
        actions.forEach(action => store.dispatch(action));
        setTagIndex(tagIndex + delta);
      }
      return;
    }
  }
  return;
}

export interface HistoryKeyCtx {
  store: Store<State>;
  noteEntries: { id: EntityId; note: Note }[];
  selectedIndex: number;
  historyIndex: number;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
  setHistoryOpen: (v: boolean) => void;
}

/**
 * Handle a key press while the note history is open.
 */
export function handleHistoryKey(input: string, keyName: string | null, ctx: HistoryKeyCtx): void {
  const { store, noteEntries, selectedIndex, historyIndex, setHistoryIndex, setHistoryOpen } = ctx;
  const state = store.getState();
  const selectedId = noteEntries[selectedIndex]?.id ?? null;
  const revisions = selectedId ? revisionsOf(state, selectedId) : [];
  if (keyName === 'downArrow' || input === 'j') {
    setHistoryIndex((i) => Math.min(i + 1, revisions.length - 1));
    return;
  }
  if (keyName === 'upArrow' || input === 'k') {
    setHistoryIndex((i) => Math.max(i - 1, 0));
    return;
  }
  if (keyName === 'Enter') {
    const rev = revisions[historyIndex];
    if (rev) {
      const action = restoreRevisionAction(store.getState(), selectedId!, rev.version);
      if (action) store.dispatch(action);
    } else {
      store.dispatch({ type: 'CLOSE_REVISION' });
    }
    setHistoryOpen(false);
    return;
  }
  if (keyName === 'Escape' || input === 'h') {
    store.dispatch({ type: 'CLOSE_REVISION' });
    setHistoryOpen(false);
    return;
  }
  return;
}

export interface OpenHistoryCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  setHistoryOpen: (v: boolean) => void;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Open the note history for the selected note.
 */
export function openHistory(ctx: OpenHistoryCtx): void {
  const { store, selectedEntry, setHistoryOpen, setHistoryIndex } = ctx;
  // Open note history
  if (selectedEntry) {
    store.dispatch({ type: 'OPEN_NOTE', noteId: selectedEntry.id });
    store.dispatch({ type: 'REVISIONS_TOGGLE' });
    setHistoryOpen(true);
    setHistoryIndex(0);
  }
}

export interface IdleKeyCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  onForceSync?: () => void;
  copyText?: (text: string) => boolean;
  syncedTimerRef: { current: ReturnType<typeof setTimeout> | null };
  setSyncedAt: (v: string | null) => void;
  setCopyResult: (v: null | { noteId: EntityId; ok: boolean }) => void;
  setTagEditorOpen: (v: boolean) => void;
  setEmptyAsk: (v: number) => void;
  // T304: export from the idle list (same shape as note-focus's setExportAsk)
  setExportAsk?: (v: boolean) => void;
  setNotice?: (v: string) => void;
}

/**
 * Keys with no pane focus: g, y, r and E (h/e/n/j/k/... stay in App).
 */
export function handleIdleKey(input: string, ctx: IdleKeyCtx): void {
  const { store, selectedEntry } = ctx;
  if (input === 'g') {
    if (selectedEntry) ctx.setTagEditorOpen(true);
  } else if (input === 'w') {
    // T304: export from the idle list (mirrors the `g` branch shape)
    if (selectedEntry) {
      if (selectedEntry.note.deleted) {
        ctx.setNotice?.('In trash: press u to restore first');
      } else {
        ctx.setExportAsk?.(true);
      }
    }
  } else if (input === 'y') {
    copyLink({ selectedEntry, copyText: ctx.copyText, setCopyResult: ctx.setCopyResult });
  } else if (input === 'r') {
    forceSyncNow({ store, onForceSync: ctx.onForceSync, timerRef: ctx.syncedTimerRef, setSyncedAt: ctx.setSyncedAt });
  } else if (input === 'E') {
    const n = emptyTrashActions(store.getState()).length;
    if (n > 0) ctx.setEmptyAsk(n);
  }
}

/**
 * Effects the App runs: auto-open tags on wide terminals, clear the sync timer.
 */
export function useAppEffects(width: number, tagCount: number, setTagsOpen: (v: boolean) => void, syncedTimerRef: { current: ReturnType<typeof setTimeout> | null }): void {
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (!autoOpened.current && shouldAutoOpenTags(width, tagCount)) {
      autoOpened.current = true;
      setTagsOpen(true);
    }
  }, [width, tagCount]);
  React.useEffect(() => () => {
    if (syncedTimerRef.current) {
      clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = null;
    }
  }, []);
}
