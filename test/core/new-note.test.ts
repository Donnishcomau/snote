/**
 * newNoteFields acceptance tests (T207).
 * One `it()` per numbered Acceptance line in task-T207.md.
 */

import { describe, it, expect } from 'vitest';
import { newNoteFields } from '../../src/core/new-note';
import { makeNote } from '../../test/tui/fixtures';
import type { Collection } from '@vendor/types';

// Helper to create a TagName from a string
const tname = (name: string): string => name;

describe('newNoteFields (T207)', () => {
  it('1: WHEN newNoteFields({ type: all }, makeNote(a, Top, { markdown: true })) is called THEN it returns { systemTags: [markdown], tags: [] }', () => {
    const collection: Collection = { type: 'all' };
    const topNote = makeNote('a', 'Top', { markdown: true });

    const result = newNoteFields(collection, topNote);

    expect(result.systemTags).toEqual(['markdown']);
    expect(result.tags).toEqual([]);
  });

  it('2: WHEN the top note is makeNote(b, Plain top, { pinned: true }) THEN it returns { systemTags: [], tags: [] }', () => {
    const collection: Collection = { type: 'all' };
    const topNote = makeNote('b', 'Plain top', { pinned: true });

    const result = newNoteFields(collection, topNote);

    expect(result.systemTags).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('3: WHEN the collection is { type: tag, tagName: work } and the top note is a markdown note THEN it returns { systemTags: [markdown], tags: [work] }', () => {
    const collection: Collection = { type: 'tag', tagName: 'work' as never };
    const topNote = makeNote('c', 'Work note', { markdown: true });

    const result = newNoteFields(collection, topNote);

    expect(result.systemTags).toEqual(['markdown']);
    expect(result.tags).toEqual(['work']);
  });

  it('4: WHEN topNote is null or undefined (empty list) with { type: untagged } THEN both calls return { systemTags: [], tags: [] }', () => {
    const collection: Collection = { type: 'untagged' };

    const resultNull = newNoteFields(collection, null);
    const resultUndefined = newNoteFields(collection, undefined);

    expect(resultNull.systemTags).toEqual([]);
    expect(resultNull.tags).toEqual([]);
    expect(resultUndefined.systemTags).toEqual([]);
    expect(resultUndefined.tags).toEqual([]);
  });

  it('5: WHEN it is called twice with the same markdown top note THEN the two systemTags arrays are equal but not the same object (not.toBe), and the top note systemTags still equals [markdown]', () => {
    const collection: Collection = { type: 'all' };
    const topNote = makeNote('e', 'Top', { markdown: true });

    const result1 = newNoteFields(collection, topNote);
    const result2 = newNoteFields(collection, topNote);

    expect(result1.systemTags).toEqual(['markdown']);
    expect(result2.systemTags).toEqual(['markdown']);
    expect(result1.systemTags).not.toBe(result2.systemTags);

    expect(topNote.systemTags).toEqual(['markdown']);
  });
});
