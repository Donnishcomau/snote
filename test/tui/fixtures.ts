import type { Note } from '@vendor/types';

/**
 * Create a test note with the given properties.
 */
export function makeNote(
  id: string,
  content: string,
  opts?: {
    pinned?: boolean;
    deleted?: boolean;
    markdown?: boolean;
    creationDate?: number;
    modificationDate?: number;
    tags?: string[];
  }
): Note {
  const now = Math.floor(Date.now() / 1000);
  return {
    content,
    creationDate: opts?.creationDate ?? now,
    deleted: opts?.deleted ?? false,
    modificationDate: opts?.modificationDate ?? now,
    systemTags: [
      ...(opts?.pinned ? (['pinned'] as const) : []),
      ...(opts?.markdown ? (['markdown'] as const) : []),
    ],
    tags: (opts?.tags ?? []) as any,
  };
}

/**
 * Five test notes: one pinned, one deleted, three normal.
 */
export const testNotes: Note[] = [
  makeNote('note-1', 'Pinned note\nThis is pinned content', {
    pinned: true,
    modificationDate: 1000,
  }),
  makeNote('note-2', 'Deleted note\nThis should not appear', {
    deleted: true,
    modificationDate: 2000,
  }),
  makeNote('note-3', 'First normal note\nWith some preview text', {
    modificationDate: 3000,
  }),
  makeNote('note-4', 'Second normal note\nAlso has preview', {
    modificationDate: 4000,
  }),
  makeNote('note-5', 'Third normal note\nMore preview content', {
    modificationDate: 5000,
  }),
];

/**
 * Notes sorted by modificationDate descending (newest first), excluding deleted.
 * Expected order: note-5, note-4, note-3, note-1 (pinned first)
 */
export const sortedNotes: Note[] = [
  testNotes[0], // note-1 (pinned)
  testNotes[4], // note-5
  testNotes[3], // note-4
  testNotes[2], // note-3
];
