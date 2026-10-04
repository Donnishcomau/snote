import { describe, it, expect } from 'vitest';
import { noteRow } from '../../src/core/note-row';
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

describe('noteRow', () => {
  it('1: noteRow(note("Shopping list\\nmilk and bread\\nand coffee beans too"), 30) => title "Shopping list", marker "", previewLines length 2', () => {
    const n = note('Shopping list\nmilk and bread\nand coffee beans too');
    const row = noteRow(n, 30);
    expect(row.title).toBe('Shopping list');
    expect(row.marker).toBe('');
    expect(row.previewLines.length).toBe(2);
  });

  it('2: noteRow(note("A very long title that goes on"), 20) => title "A very long.."', () => {
    const n = note('A very long title that goes on');
    const row = noteRow(n, 20);
    expect(row.title).toBe('A very long..');
  });

  it('3: noteRow(note("Just a title"), 30) => previewLines [], title "Just a title"', () => {
    const n = note('Just a title');
    const row = noteRow(n, 30);
    expect(row.previewLines).toEqual([]);
    expect(row.title).toBe('Just a title');
  });

  it('4: noteRow(note("Pinned note\\nbody", ["pinned"]), 30) => marker "", title "Pinned note"', () => {
    const n = note('Pinned note\nbody', ['pinned']);
    const row = noteRow(n, 30);
    expect(row.marker).toBe('');
    expect(row.title).toBe('Pinned note');
  });

  it('5: noteRow(note("Wide note\\nalpha beta gamma delta epsilon zeta eta theta"), 12) => previewLines length 2, neither entry longer than 10', () => {
    const n = note('Wide note\nalpha beta gamma delta epsilon zeta eta theta');
    const row = noteRow(n, 12);
    expect(row.previewLines.length).toBe(2);
    for (const line of row.previewLines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });

  it('6: noteRow does not mutate the note', () => {
    const n = note('Some content\nmore lines');
    const copy = JSON.parse(JSON.stringify(n)) as Note;
    const originalTags = n.systemTags;
    noteRow(n, 30);
    expect(n).toEqual(copy);
    expect(n.systemTags).toBe(originalTags);
  });
});
