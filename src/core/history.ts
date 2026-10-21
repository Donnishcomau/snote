import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import type * as A from '@vendor/state/action-types';
import { getRevision } from '@vendor/state/selectors';
import { noteTitleAndPreview } from '@vendor/utils/note-utils';
import { sanitizeForTerminal } from './sanitize';

type Revision = { version: number; note: Note };

export function revisionsOf(state: State, noteId: EntityId | null): Revision[] {
  if (noteId === null) {
    return [];
  }
  const revisions = state.data.noteRevisions.get(noteId);
  if (!revisions) {
    return [];
  }
  const result: Revision[] = [];
  revisions.forEach((note, version) => {
    // F244: a revision whose text is not a string cannot be shown or restored.
    if (typeof note?.content === 'string') result.push({ version, note });
  });
  result.sort((a, b) => b.version - a.version);
  return result;
}

export function revisionLabel(rev: Revision): string {
  const title = sanitizeForTerminal(noteTitleAndPreview(rev.note).title);
  // F244: a date that is not a finite number of seconds, or beyond what Date
  // can hold, would throw in toISOString() during render.
  const when = new Date(Number(rev.note.modificationDate) * 1000);
  const dateStr = Number.isNaN(when.getTime())
    ? 'unknown date'
    : when.toISOString().slice(0, 16).replace('T', ' ');
  return `v${rev.version}  ${dateStr}  ${title}`;
}

export function restoreRevisionAction(
  state: State,
  noteId: EntityId,
  version: number
): A.ActionType | null {
  const note = getRevision(state, noteId, version, true);
  if (note === null) {
    return null;
  }
  return { type: 'RESTORE_NOTE_REVISION', noteId, note };
}
