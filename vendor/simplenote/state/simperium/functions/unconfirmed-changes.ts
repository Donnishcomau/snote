// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-11-07).
import { notesAreEqual } from '../../selectors';

import type * as S from '../../';
import type * as T from '../../../types'; // OMARCHY: typed ghost read
import type { EntityId } from 'simperium';

const getUnconfirmedNotes = (state: S.State): EntityId[] => {
  const notes: EntityId[] = [];

  state.data.notes.forEach((note, noteId) => {
    const ghost = state.simperium.ghosts[1].get('note')?.get(noteId);
    const ghostData = ghost?.data as T.Note | undefined; // OMARCHY: typed ghost read

    if (!ghost || !notesAreEqual(note, ghostData)) { // OMARCHY: typed ghost read
      notes.push(noteId);
    }
  });

  return notes;
};

const getUnconfirmedPreferences = (state: S.State): EntityId[] => {
  return [];
};

const getUnconfirmedTags = (state: S.State): EntityId[] => {
  return [];
};

export const getUnconfirmedChanges = (
  state: S.State
): Record<'notes' | 'preferences' | 'tags', EntityId[]> => {
  return {
    notes: getUnconfirmedNotes(state),
    preferences: getUnconfirmedPreferences(state),
    tags: getUnconfirmedTags(state),
  };
};
