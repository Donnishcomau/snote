import type { Note, EntityId } from '@vendor/types';
import { noteTitleAndPreview } from '@vendor/utils/note-utils';

/**
 * Sort note entries according to settings: pinned first, then by sort type.
 */
export function sortEntries(
  entries: { id: EntityId; note: Note }[],
  sortType: string,
  sortReversed: boolean,
  inTrash: boolean
): { id: EntityId; note: Note }[] {
  const filtered = entries.filter((entry) => Boolean(entry.note.deleted) === inTrash);

  // Make a copy before sorting to avoid mutating the original array
  return [...filtered].sort((a, b) => {
    // Pinned notes first
    const aPinned = a.note.systemTags.includes('pinned');
    const bPinned = b.note.systemTags.includes('pinned');
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    // Then by sort type
    let comparison = 0;
    switch (sortType) {
      case 'modificationDate':
        // Descending by default (newest first)
        comparison = b.note.modificationDate - a.note.modificationDate;
        break;
      case 'creationDate':
        // Descending by default (newest first)
        comparison = b.note.creationDate - a.note.creationDate;
        break;
      case 'alphabetical':
        // Ascending by default (A-Z)
        comparison = noteTitleAndPreview(a.note).title
          .localeCompare(noteTitleAndPreview(b.note).title);
        break;
      default:
        // Descending by default (newest first)
        comparison = b.note.modificationDate - a.note.modificationDate;
    }

    if (comparison === 0) {
      return a.id.localeCompare(b.id);
    }

    const result = sortReversed ? -comparison : comparison;
    return result;
  });
}
