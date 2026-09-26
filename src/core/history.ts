import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import type * as A from '@vendor/state/action-types';
import { getRevision } from '@vendor/state/selectors';
import { noteTitleAndPreview } from '@vendor/utils/note-utils';
import { sanitizeForTerminal } from './sanitize';

export type Revision = { version: number; note: Note };

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
    result.push({ version, note });
  });
  result.sort((a, b) => b.version - a.version);
  return result;
}

export function revisionLabel(rev: Revision): string {
  const title = sanitizeForTerminal(noteTitleAndPreview(rev.note).title);
  const dateStr = new Date(rev.note.modificationDate * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
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
