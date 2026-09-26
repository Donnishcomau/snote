/**
 * Trash/restore/delete key actions as a pure function.
 * T11: one pure function turns a pressed key plus the current state into
 * the Redux action for trash, restore, delete forever and the trash-view toggle.
 * T13: add 'P' case for publish toggle and publishLink pure function.
 */

import type * as A from '@vendor/state/action-types';
import type { EntityId, SortType, Note } from '@vendor/types';
import type { State } from './store';
import isEmailTag from '@vendor/utils/is-email-tag';

/**
 * Given a key press, the currently selected note's ID, and the full
 * Redux state, return the action that should dispatch (or `null`).
 */
export function noteKeyAction(
  input: string,
  noteId: EntityId | null,
  state: State
): A.ActionType | null {
  const inTrash = state.ui.collection.type === 'trash';

  switch (input) {
    case 'd':
      // Move to trash (only when not already in trash and noteId is known)
      if (noteId !== null && !inTrash) {
        return { type: 'TRASH_NOTE', noteId } as A.ActionType;
      }
      return null;

    case 'u':
      // Restore from trash (only when in trash view and noteId is known)
      if (noteId !== null && inTrash) {
        return { type: 'RESTORE_NOTE', noteId } as A.ActionType;
      }
      return null;

    case 'D':
      // Delete forever (only when in trash view and noteId is known)
      if (noteId !== null && inTrash) {
        return { type: 'DELETE_NOTE_FOREVER', noteId } as A.ActionType;
      }
      return null;

    case 'T':
      // Toggle trash / all notes
      if (inTrash) {
        return { type: 'SHOW_ALL_NOTES' } as A.ActionType;
      }
      return { type: 'SELECT_TRASH' } as A.ActionType;

    case 'S':
      // Reverse sort (toggle) – works in every view, even with noteId null
      return { type: 'setSortReversed', sortReversed: !state.settings.sortReversed } as A.ActionType;

    case 's':
      // Cycle sort type – works in every view, even with noteId null
      const cycle: SortType[] = ['modificationDate', 'creationDate', 'alphabetical'];
      const idx = cycle.indexOf(state.settings.sortType);
      const nextSort = cycle[(idx + 1) % cycle.length];
      return { type: 'setSortType', sortType: nextSort } as A.ActionType;

    case 'p':
      // Pin / unpin toggle (only when noteId known, note exists, not in trash)
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyPinned = note.systemTags.includes('pinned');
          return { type: 'PIN_NOTE', noteId, shouldPin: !alreadyPinned } as A.ActionType;
        }
      }
      return null;

    case 'm':
      // Markdown toggle (only when noteId known, note exists, not in trash)
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyMarkdown = note.systemTags.includes('markdown');
          return { type: 'MARKDOWN_NOTE', noteId, shouldEnableMarkdown: !alreadyMarkdown } as A.ActionType;
        }
      }
      return null;

    case 'P':
      // Publish / unpublish toggle (only when noteId known, note exists, not in trash)
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyPublished = note.systemTags.includes('published');
          return { type: 'PUBLISH_NOTE', noteId, shouldPublish: !alreadyPublished } as A.ActionType;
        }
      }
      return null;

    default:
      return null;
  }
}

/**
 * Return a label for the current sort mode, for display in the status bar.
 */
export function sortLabel(state: State): string {
  const map: Record<SortType, string> = {
    modificationDate: 'sort: modified',
    creationDate: 'sort: created',
    alphabetical: 'sort: a-z',
  };
  let label = map[state.settings.sortType];
  if (state.settings.sortReversed) {
    label += ' (rev)';
  }
  return label;
}

/**
 * Return an array of `DELETE_NOTE_FOREVER` actions that would empty the
 * trash (one per trashed note).  Never dispatches and never mutates state.
 */
export function emptyTrashActions(state: State): A.ActionType[] {
  const inTrash = state.ui.collection.type === 'trash';
  if (!inTrash) {
    return [];
  }

  const actions: A.ActionType[] = [];
  for (const [noteId, note] of state.data.notes) {
    if (Boolean(note.deleted)) {
      actions.push({ type: 'DELETE_NOTE_FOREVER', noteId } as A.ActionType);
    }
  }
  return actions;
}

/**
 * Build the public link URL for a published note, or null when the note
 * is not published or lacks a publishURL.
 */
export function publishLink(note: Note | null | undefined): string | null {
  if (!note || !note.systemTags?.includes('published')) {
    return null;
  }
  if (typeof note.publishURL === 'string' && note.publishURL.length > 0) {
    return 'https://simp.ly/p/' + note.publishURL;
  }
  return null;
}

/**
 * Return a label showing who a note is shared with, or null.
 */
export function sharedLine(note: Note | null | undefined): string | null {
  if (!note) {
    return null;
  }
  const emails = note.tags.filter(isEmailTag);
  if (emails.length > 0) {
    return 'shared with: ' + emails.join(', ');
  }
  if (note.systemTags.includes('shared')) {
    return 'shared';
  }
  return null;
}
