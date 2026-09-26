import type { Dispatch, SetStateAction } from 'react';
import type { Store } from 'redux';
import type { State } from '../core/store';
import type { EntityId, Note } from '@vendor/types';
import { checklistItems, toggleChecklistItem } from '../core/checklist';

export interface NoteKeyCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  itemIndex: number;
  setItemIndex: Dispatch<SetStateAction<number>>;
  setItemAsk?: (v: boolean) => void;
  setNotice?: (v: string | null) => void;
  // T298: opens the export prompt (BottomArea owns the state, App passes it down)
  setExportAsk?: (v: boolean) => void;
}

/**
 * Handle a key press while the note pane has focus.
 * Returns true when the key was consumed, false otherwise.
 */
export function handleNoteKey(
  input: string,
  keyName: string | null,
  ctx: NoteKeyCtx,
): boolean {
  const { store, selectedEntry, itemIndex, setItemIndex, setItemAsk, setNotice, setExportAsk } = ctx;

  const items = selectedEntry
    ? checklistItems(selectedEntry.note.content ?? '')
    : [];
  const at = Math.min(itemIndex, items.length - 1);

  // j / downArrow — move down
  if (keyName === 'downArrow' || input === 'j') {
    if (items.length === 0) return false;
    setItemIndex(Math.min(at + 1, items.length - 1));
    return true;
  }

  // k / upArrow — move up
  if (keyName === 'upArrow' || input === 'k') {
    if (items.length === 0) return false;
    setItemIndex(Math.max(at - 1, 0));
    return true;
  }

  // c — toggle check item
  if (input === 'c') {
    if (selectedEntry && items.length > 0 && !selectedEntry.note.deleted) {
      const content = toggleChecklistItem(selectedEntry.note.content ?? '', at);
      store.dispatch({
        type: 'EDIT_NOTE',
        noteId: selectedEntry.id,
        changes: { content },
      } as never);
    }
    return true;
  }

  // a — ask for a new item
  if (input === 'a') {
    if (selectedEntry && !selectedEntry.note.deleted) {
      setItemAsk?.(true);
    } else if (selectedEntry?.note.deleted) {
      // T293: consistent with T286 — trash blocks `a` with the same notice
      setNotice?.('In trash: press u to restore first');
    }
    return true;
  }

  // w — export the note to a .md file (T298); trash blocks it with T286's notice
  if (input === 'w') {
    if (selectedEntry && !selectedEntry.note.deleted) {
      setExportAsk?.(true);
    } else if (selectedEntry?.note.deleted) {
      setNotice?.('In trash: press u to restore first');
    }
    return true;
  }

  // Every other key: not handled
  return false;
}
