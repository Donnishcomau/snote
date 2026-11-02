import { describe, it, expect } from 'vitest';
import { noteRow } from '../../src/core/note-row';
import { cellWidth } from '../../src/core/cells';
import type { Note } from '@vendor/types';

function note(content: string, systemTags: Note['systemTags'] = []): Note {
  return {
    content,
    systemTags,
    creationDate: 0,
    modificationDate: 0,
    deleted: false,
    tags: [],
  };
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Terminal cells `noteRow`'s row title will occupy: cellWidth per grapheme. */
function displayCells(text: string): number {
  let cells = 0;
  for (const { segment } of segmenter.segment(text)) cells += cellWidth(segment);
  return cells;
}

describe('noteRow cuts titles by display width (#139)', () => {
  it('1: WHEN a note title holds wide (2-cell) characters, such as `漢字漢字漢字漢字漢字`, and `noteRow` is called with width `10` THEN the row title is cut by display width and never exceeds `10` cells', () => {
    const row = noteRow(note('漢字漢字漢字漢字漢字'), 10);
    expect(displayCells(row.title)).toBeLessThanOrEqual(10);
    // display-width budget: a title whose character count fits but whose
    // cells do not must still be cut (CJK titles run long otherwise)
    const shortButWide = noteRow(note('漢字漢字漢字漢字'), 10);
    expect(displayCells(shortButWide.title)).toBeLessThanOrEqual(10);
  });

  it('2: WHEN a title is cut THEN no wide character is split in half', () => {
    const title = '漢字漢字漢字漢字漢字';
    const row = noteRow(note(title), 10);
    expect(row.title).toContain('..');
    const kept = row.title.slice(0, row.title.length - 2);
    // every grapheme kept is a whole grapheme of the original title, in order:
    // the cut lands on a character boundary, never inside a wide character
    const segments = [...segmenter.segment(kept)].map(s => s.segment);
    expect(segments.join('')).toBe(kept);
    expect(title.startsWith(kept)).toBe(true);
    // no half of a surrogate pair survived the cut
    let split = false;
    for (let i = 0; i < kept.length; i++) {
      const c = kept.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = kept.charCodeAt(i + 1);
        split ||= !(next >= 0xdc00 && next <= 0xdfff);
        i++;
      } else {
        split ||= c >= 0xdc00 && c <= 0xdfff;
      }
    }
    expect(split).toBe(false);
  });

  it('3: WHEN a title is ASCII only THEN the row is unchanged from today (the existing `test/core/note-row-truncate.test.ts` still passes)', () => {
    expect(noteRow(note('A very long title that goes on'), 20).title).toBe('A very long..');
    expect(noteRow(note('Supercalifragilisticexpialidocious word'), 20).title).toBe(
      'Supercalifragili..'
    );
    expect(noteRow(note('Hello world here'), 16).title).toBe('Hello world..');
    expect(noteRow(note('Short title'), 30).title).toBe('Short title');
  });
});
