import type { Collection, Note, SystemTag, TagName } from '@vendor/types';

/**
 * Compute the default systemTags and tags for a new note based on the
 * current collection and the top (first visible) note.
 *
 * Rules (mirroring upstream middleware):
 *  - systemTags includes 'markdown' when the top note has 'markdown'.
 *  - tags includes the collection's tagName when the collection is a tag view.
 *
 * @returns A new object with fresh arrays; `topNote` is never mutated.
 */
export function newNoteFields(
  collection: Collection,
  topNote: Note | null | undefined,
): { systemTags: SystemTag[]; tags: TagName[] } {
  const systemTags: SystemTag[] =
    topNote?.systemTags.includes('markdown') ? ['markdown'] : [];

  const tags: TagName[] =
    collection.type === 'tag' ? [collection.tagName as unknown as TagName] : [];

  return { systemTags, tags };
}
