import type { Note, Tag, TagName, TagHash, Collection } from '@vendor/types';
import { tagHashOf } from '@vendor/utils/tag-hash';
import isEmailTag from '@vendor/utils/is-email-tag';
import type * as A from '@vendor/state/action-types';
import { sanitizeForTerminal } from './sanitize';

/**
 * Return an ordered list of tag names for the tags pane.
 *
 * Sorted by `index` ascending (tags without `index` come after all
 * tagged ones), ties and the rest by `name.localeCompare`.
 * Returns a new array; the Map is never mutated.
 */
export function tagRows(tags: Map<TagHash, Tag>): TagName[] {
  const arr: Tag[] = [];
  tags.forEach((tag) => {
    if (typeof tag?.name === 'string' && tag.name !== '' && !isEmailTag(tag.name)) arr.push(tag);
  });
  arr.sort((a, b) => {
    const aIdx = a.index ?? Infinity;
    const bIdx = b.index ?? Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });
  // OMARCHY: boundary cast — TagName is a branded string and the sanitize
  // result is a plain string with identical runtime shape.
  return arr.map((tag) => sanitizeForTerminal(tag.name) as TagName);
}

/**
 * Whether `note` belongs to the given `collection`.
 *
 * - `all` / `trash`  → always `true`
 * - `untagged`       → `note.tags.length === 0`
 * - `tag`            → when `hasQuery` is true the filter is ignored
 *   (return `true`); otherwise whether one of the note's tag names has
 *   the same hash as `collection.tagName`.
 */
export function inCollection(
  note: Note,
  collection: Collection,
  hasQuery: boolean = false,
): boolean {
  if (collection.type === 'all' || collection.type === 'trash') {
    return true;
  }

  if (collection.type === 'untagged') {
    return note.tags.length === 0;
  }

  // collection.type === 'tag'
  if (hasQuery) {
    return true;
  }

  const hash = tagHashOf(collection.tagName);
  return note.tags.some((tagName) => tagHashOf(tagName) === hash);
}

/**
 * Return the `REORDER_TAG` actions needed to move `tagName` one position
 * up (`delta === -1`) or down (`delta === 1`) within the ordered `rows`.
 *
 * Returns an empty array when the tag is not found, would move off the
 * ends, or `rows` is empty.  Otherwise copies `rows`, swaps the two
 * positions, and returns one `REORDER_TAG` action per row so that the
 * caller can dispatch them in order.
 */
export function moveTagActions(
  rows: TagName[],
  tagName: TagName,
  delta: -1 | 1,
): A.ActionType[] {
  const i = rows.findIndex(
    (name) => tagHashOf(name) === tagHashOf(tagName),
  );

  if (i === -1) {
    return [];
  }

  const j = i + delta;

  if (j < 0 || j >= rows.length) {
    return [];
  }

  const copy = [...rows];
  [copy[i], copy[j]] = [copy[j], copy[i]];

  return copy.map((name, k) => ({
    type: 'REORDER_TAG',
    tagName: name,
    newIndex: k,
  }));
}
