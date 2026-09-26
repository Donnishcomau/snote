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

describe('noteRow truncate title at word boundary', () => {
  it('1: WHEN noteRow(note("A very long title that goes on"), 20) is called THEN row.title is "A very long.." (cut before "title", not mid-word).', () => {
    const n = note('A very long title that goes on');
    const row = noteRow(n, 20);
    expect(row.title).toBe('A very long..');
  });

  it('2: WHEN noteRow(note("Supercalifragilisticexpialidocious word"), 20) is called (the first word alone exceeds the budget) THEN row.title is "Supercalifragili.." (hard character cut, same as the old behaviour for this case).', () => {
    const n = note('Supercalifragilisticexpialidocious word');
    const row = noteRow(n, 20);
    expect(row.title).toBe('Supercalifragili..');
  });

  it('3: WHEN noteRow(note("Hello world here"), 16) is called THEN row.title is "Hello world.." with no space before the dots (not "Hello world ..").', () => {
    const n = note('Hello world here');
    const row = noteRow(n, 16);
    expect(row.title).toBe('Hello world..');
  });

  it('4: WHEN noteRow(note("Short title"), 30) is called (title shorter than the truncation threshold) THEN row.title is "Short title" unchanged and does not contain "..".', () => {
    const n = note('Short title');
    const row = noteRow(n, 30);
    expect(row.title).toBe('Short title');
    expect(row.title).not.toContain('..');
  });
});
