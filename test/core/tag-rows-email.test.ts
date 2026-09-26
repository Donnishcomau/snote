import { describe, it, expect } from 'vitest';
import { tagRows } from '../../src/core/collection';
import type { Tag, TagHash, TagName } from '@vendor/types';

function mkTag(name: string, index?: number): Tag {
  return { name: name as unknown as TagName, index };
}

describe('tagRows – email filtering', () => {
  it('1: WHEN tagRows is called with a Map of 4 tags named work, ann@example.com, home and bob@example.org THEN it returns exactly [\"work\", \"home\"]', () => {
    const tags = new Map<TagHash, Tag>();
    tags.set(1 as unknown as TagHash, mkTag('work', 0));
    tags.set(2 as unknown as TagHash, mkTag('ann@example.com', 0));
    tags.set(3 as unknown as TagHash, mkTag('home', 0));
    tags.set(4 as unknown as TagHash, mkTag('bob@example.org', 0));

    const result = tagRows(tags);
    expect(result).toEqual(['home', 'work']);
  });

  it('2: WHEN tagRows is called with a Map whose only tags are ann@example.com and bob@example.org THEN it returns [] and does not throw', () => {
    const tags = new Map<TagHash, Tag>();
    tags.set(1 as unknown as TagHash, mkTag('ann@example.com', 0));
    tags.set(2 as unknown as TagHash, mkTag('bob@example.org', 0));

    const result = tagRows(tags);
    expect(result).toEqual([]);
  });

  it('3: WHEN tagRows is called with 3 non-email tags work (index 2), home (index 0) and ideas (index 1) THEN it returns [\"home\", \"ideas\", \"work\"], the same order as before this change', () => {
    const tags = new Map<TagHash, Tag>();
    tags.set(1 as unknown as TagHash, mkTag('work', 2));
    tags.set(2 as unknown as TagHash, mkTag('home', 0));
    tags.set(3 as unknown as TagHash, mkTag('ideas', 1));

    const result = tagRows(tags);
    expect(result).toEqual(['home', 'ideas', 'work']);
  });
});
