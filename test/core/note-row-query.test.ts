import { describe, it, expect } from 'vitest';

import type { Note } from '@vendor/types';
import { noteRow } from '../../src/core/note-row';

const fixture: Note = {
  content:
    'Grocery List\nmilk\nbread\neggs\ncheese\nneed to remember to buy quinoa for dinner tonight\nand also apples',
  systemTags: [],
  creationDate: 0,
  modificationDate: 0,
  deleted: false,
  tags: [],
};

describe('noteRow with search query', () => {
  it('1: WHEN noteRow is called with query "quinoa" THEN previewLines shows matching line', () => {
    const result = noteRow(fixture, 30, 'quinoa');
    expect(result.previewLines).toEqual([
      'need to remember to buy',
      'quinoa for dinner tonight',
    ]);
  });

  it('2: WHEN noteRow is called with no third argument THEN previewLines is unchanged fallback', () => {
    const result = noteRow(fixture, 30);
    expect(result.previewLines).toEqual(['milk', 'bread']);
  });

  it('3: WHEN noteRow is called with non-matching query THEN previewLines is same as no query', () => {
    const result = noteRow(fixture, 30, 'zzznomatch');
    expect(result.previewLines).toEqual(['milk', 'bread']);
  });

  it('4: WHEN noteRow is called with query "quinoa" THEN title and marker are unchanged', () => {
    const result = noteRow(fixture, 30, 'quinoa');
    expect(result.title).toBe('Grocery List');
    expect(result.marker).toBe('');
  });
});
