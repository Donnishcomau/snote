import { describe, it, expect } from 'vitest';
import type { Note } from '@vendor/types';
import { makeNote } from '../tui/fixtures';
import { parseQuery, matchParsed, matchNote, filterNotes } from '../../src/core/search';

describe('search', () => {
  it('1: WHEN filterNotes gets notes a (Buy Milk today) and b (milk only) with query MILK buy THEN result length 1 with content Buy Milk today; with zzz length 0', () => {
    const a = makeNote('a', 'Buy Milk today');
    const b = makeNote('b', 'milk only');
    const result = filterNotes([a, b], 'MILK buy');
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Buy Milk today');

    const result2 = filterNotes([a, b], 'zzz');
    expect(result2.length).toBe(0);
  });

  it('2: WHEN parseQuery(\'tag:Work "Fresh Milk" BUY\') THEN terms equals fresh milk and buy, tags is a Set of size 1 that has work', () => {
    const parsed = parseQuery('tag:Work "Fresh Milk" BUY');
    expect(parsed.terms).toEqual(['fresh milk', 'buy']);
    expect(parsed.tags instanceof Set).toBe(true);
    expect(parsed.tags.size).toBe(1);
    expect(parsed.tags.has('work' as import('@vendor/types').TagHash)).toBe(true);
  });

  it('3: WHEN note has content buy fresh milk THEN matchNote(note, "fresh milk") is true, matchNote(note, "buy milk") is false, and matchParsed(note, parseQuery("fresh milk")) is true', () => {
    const note = makeNote('a', 'buy fresh milk');
    expect(matchNote(note, '"fresh milk"')).toBe(true);
    expect(matchNote(note, '"buy milk"')).toBe(false);
    const parsed = parseQuery('"fresh milk"');
    expect(matchParsed(note, parsed)).toBe(true);
  });

  it('4: WHEN query is tag:work tag:home budget and notes are a (tags Work,home; Budget 2026), b (same tags; holiday), c (tag Work; budget), d (no tags; budget) THEN filterNotes returns only a', () => {
    const a = makeNote('a', 'Budget 2026', { tags: ['Work', 'home'] });
    const b = makeNote('b', 'holiday', { tags: ['Work', 'home'] });
    const c = makeNote('c', 'budget', { tags: ['Work'] });
    const d = makeNote('d', 'budget');
    const result = filterNotes([a, b, c, d], 'tag:work tag:home budget');
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Budget 2026');
  });

  it('5: WHEN query is tag:untagged and notes are a (no tags, plain) and b (tag work) THEN filterNotes returns only a; with tag:untagged zzz length 0', () => {
    const a = makeNote('a', 'plain');
    const b = makeNote('b', 'content', { tags: ['work'] });
    const result = filterNotes([a, b], 'tag:untagged');
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('plain');

    const result2 = filterNotes([a, b], 'tag:untagged zzz');
    expect(result2.length).toBe(0);
  });

  it('6: WHEN query is empty or whitespace and input is 3 notes a, b, c THEN filterNotes returns them in input order (toEqual), result is not input array (not.toBe), and input still has length 3', () => {
    const a = makeNote('a', 'content a');
    const b = makeNote('b', 'content b');
    const c = makeNote('c', 'content c');
    const input: Note[] = [a, b, c];

    const result1 = filterNotes(input, '');
    expect(result1).toEqual(input);
    expect(result1).not.toBe(input);
    expect(input.length).toBe(3);

    const result2 = filterNotes(input, '   ');
    expect(result2).toEqual(input);
    expect(result2).not.toBe(input);
  });
});
