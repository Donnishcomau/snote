import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sortEntries } from '../../src/tui/app-model';
import { testNotes } from '../tui/fixtures';

const entries = testNotes.map((note, i) => ({ id: ('note-' + (i + 1)) as never, note }));

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const tuiFiles = readdirSync('src/tui').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

describe('split-model', () => {
  it('1: WHEN sortEntries(entries, modificationDate, false, false) THEN ids are [note-1, note-5, note-4, note-3] and original entries ids start with note-1, note-2', () => {
    const result = sortEntries(entries, 'modificationDate', false, false);
    const ids = result.map((e) => e.id);
    expect(ids).toEqual(['note-1', 'note-5', 'note-4', 'note-3']);
    const originalIds = entries.map((e) => e.id);
    expect(originalIds[0]).toContain('note-1');
    expect(originalIds[1]).toContain('note-2');
  });

  it('2: WHEN sortEntries(entries, alphabetical, false, false) THEN ids are [note-1, note-3, note-4, note-5]; WHEN sortReversed true THEN [note-1, note-5, note-4, note-3]', () => {
    const resultAsc = sortEntries(entries, 'alphabetical', false, false);
    expect(resultAsc.map((e) => e.id)).toEqual(['note-1', 'note-3', 'note-4', 'note-5']);
    const resultRev = sortEntries(entries, 'alphabetical', true, false);
    expect(resultRev.map((e) => e.id)).toEqual(['note-1', 'note-5', 'note-4', 'note-3']);
  });

  it('3: WHEN sortEntries(entries, modificationDate, false, true) THEN ids are [note-2]; WHEN sortEntries([], modificationDate, false, false) THEN result length 0', () => {
    const resultTrash = sortEntries(entries, 'modificationDate', false, true);
    expect(resultTrash.map((e) => e.id)).toEqual(['note-2']);
    const emptyResult = sortEntries([], 'modificationDate', false, false);
    expect(emptyResult.length).toBe(0);
  });

  it('4: WHEN every tui file is read THEN exactly 1 contains function sortEntries, that file is app-model.ts, and it contains export function sortEntries', () => {
    const matching: string[] = [];
    for (const f of tuiFiles) {
      const content = read('src/tui/' + f);
      if (content.includes('function sortEntries')) {
        matching.push(f);
      }
    }
    expect(matching).toHaveLength(1);
    expect(matching[0]).toBe('app-model.ts');
    const appModelContent = read('src/tui/app-model.ts');
    expect(appModelContent).toContain('export function sortEntries');
  });

  it('5: WHEN src/tui/App.tsx is read THEN it contains neither function sortEntries nor localeCompare, and at least 1 tui file other than app-model.ts contains both sortEntries( and ./app-model', () => {
    const appContent = read('src/tui/App.tsx');
    expect(appContent).not.toContain('function sortEntries');
    expect(appContent).not.toContain('localeCompare');
    const consumers: string[] = [];
    for (const f of tuiFiles) {
      if (f === 'app-model.ts') continue;
      const content = read('src/tui/' + f);
      if (content.includes('sortEntries(') && content.includes('./app-model')) {
        consumers.push(f);
      }
    }
    expect(consumers.length).toBeGreaterThanOrEqual(1);
  });

  it('6: WHEN the lines of src/tui/App.tsx are counted THEN there are fewer than 700', () => {
    const lines = read('src/tui/App.tsx').split('\n').length;
    expect(lines).toBeLessThan(700);
  });
});
