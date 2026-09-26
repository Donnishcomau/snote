/**
 * Tag rows and collection filter tests (T35).
 * Verifies `tagRows` ordering and `inCollection` membership logic.
 */
import { describe, it, expect } from 'vitest';
import { tagRows, inCollection } from '../../src/core/collection';
import type { Note, Tag, TagHash, TagName } from '@vendor/types';
import { makeNote } from './fixtures';
import { tagHashOf } from '@vendor/utils/tag-hash';

// Helper tags for tests 1 & 2
const tagsMap1 = new Map<TagHash, Tag>(
  [
    [tagHashOf('b' as TagName), { name: 'b' as TagName }],
    [tagHashOf('a' as TagName), { name: 'a' as TagName, index: 1 }],
    [tagHashOf('c' as TagName), { name: 'c' as TagName, index: 0 }],
    [tagHashOf('d' as TagName), { name: 'd' as TagName }],
  ] as [TagHash, Tag][],
);

describe('tagRows', () => {
  it('1: returns tags sorted by index then name, does not mutate Map', () => {
    const keysBefore = Array.from(tagsMap1.keys());
    const result = tagRows(tagsMap1);
    expect(result).toEqual(['c', 'a', 'b', 'd']);
    // Map keys are still in insertion order
    expect(Array.from(tagsMap1.keys())).toEqual(keysBefore);
  });

  it('2: empty Map gives []  z(1)/y(1) gives [y,z]', () => {
    expect(tagRows(new Map<TagHash, Tag>())).toHaveLength(0);
    const tagsMap2 = new Map<TagHash, Tag>([
      [tagHashOf('z' as TagName), { name: 'z' as TagName, index: 1 }],
      [tagHashOf('y' as TagName), { name: 'y' as TagName, index: 1 }],
    ]);
    expect(tagRows(tagsMap2)).toEqual(['y', 'z']);
  });
});

describe('inCollection', () => {
  const w = makeNote('w', 'note tagged home and Work', {
    tags: ['home', 'Work'],
  });
  const u = makeNote('u', 'note with no tags');

  it('3: tag collection matches by hash; different tag does not match', () => {
    expect(inCollection(w, { type: 'tag', tagName: 'work' as TagName })).toBe(
      true,
    );
    expect(inCollection(u, { type: 'tag', tagName: 'work' as TagName })).toBe(
      false,
    );
    expect(inCollection(w, { type: 'tag', tagName: 'nope' as TagName })).toBe(
      false,
    );
    expect(inCollection(u, { type: 'tag', tagName: 'nope' as TagName })).toBe(
      false,
    );
  });

  it('4: untagged collection - w has tags, u does not; hasQuery has no effect', () => {
    expect(inCollection(w, { type: 'untagged' })).toBe(false);
    expect(inCollection(u, { type: 'untagged' })).toBe(true);
    expect(inCollection(w, { type: 'untagged' }, true)).toBe(false);
    expect(inCollection(u, { type: 'untagged' }, true)).toBe(true);
  });

  it('5: tag collection with hasQuery=true accepts both', () => {
    expect(
      inCollection(u, { type: 'tag', tagName: 'work' as TagName }, true),
    ).toBe(true);
    expect(
      inCollection(w, { type: 'tag', tagName: 'work' as TagName }, true),
    ).toBe(true);
  });

  it('6: all and trash collections accept everyone', () => {
    expect(inCollection(w, { type: 'all' })).toBe(true);
    expect(inCollection(u, { type: 'all' })).toBe(true);
    expect(inCollection(w, { type: 'trash' })).toBe(true);
    expect(inCollection(u, { type: 'trash' })).toBe(true);
  });
});
