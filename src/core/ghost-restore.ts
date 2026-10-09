import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import type { EntityId, Note } from '@vendor/types';
import { isUnsyncedCopy, type UnsyncedRecord } from './unsynced';
import type { State } from './store';

/**
 * The note bucket's ghost file as the start-up reader sees it: every saved
 * entry with its server version and raw data, plus the bucket's change
 * version. FileGhostStore satisfies this shape structurally.
 */
export interface NoteGhostReader {
  eachGhost(
    iterator: (ghost: { key: string; version: number; data: unknown }) => void
  ): void;
}

/**
 * T445 — a note the server confirmed but state.json never caught (the kill
 * landed inside the 500 ms save debounce): the ghost holds the server's copy
 * at its version, so the store is told about it with REMOTE_NOTE_UPDATE, the
 * action the sync middleware itself uses for a note arriving from the server.
 * Nothing is sent back: the server already has every byte of it.
 *
 * An entry with no string `content` is junk from a torn write and is skipped.
 *
 * A note the store already holds is adopted from the ghost only when the
 * ghost's copy is strictly newer: same dispatch, so still nothing is sent.
 * This covers a trash or edit the server confirmed while state.json sat
 * inside its save debounce. An equal or older ghost date, or a missing one
 * (NaN), keeps the store's copy, so a newer local edit is never lost.
 *
 * T493 — `unsynced` is the record of changes the server never confirmed.
 * A held note the record names (its date still matching the recorded one)
 * is such an edit: the ghost's newer date means another device changed it,
 * not that this change was ever confirmed, so the held copy is kept.
 * With no record (the default) the behaviour is exactly as before.
 */
export function restoreNotesFromGhosts(
  store: Store<State, A.ActionType>,
  ghosts: NoteGhostReader,
  unsynced: UnsyncedRecord = {}
): EntityId[] {
  const restored: EntityId[] = [];
  ghosts.eachGhost(({ key, data }) => {
    const note = data as Partial<Note> | null;
    if (!note || typeof note.content !== 'string') {
      return;
    }
    const held = store.getState().data.notes.get(key as EntityId);
    if (held) {
      // T493 — an unconfirmed local change the record names is never
      // replaced, whatever the dates say.
      if (isUnsyncedCopy(unsynced, key, held)) {
        return;
      }
      const ghostDate = Number(note.modificationDate);
      const heldDate = Number(held.modificationDate);
      // Missing dates are NaN and never adopt; only a strictly newer ghost wins.
      if (!(ghostDate > heldDate)) {
        return;
      }
    }
    store.dispatch({
      type: 'REMOTE_NOTE_UPDATE',
      noteId: key as EntityId,
      note: data as Note,
    } as A.ActionType);
    restored.push(key as EntityId);
  });
  return restored;
}
