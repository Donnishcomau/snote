import { describe, it, expect } from 'vitest';
import { wrapLines } from '../../src/core/wrap';

const fox = 'The quick brown fox jumps over the lazy dog and keeps running far away';

describe('wrapLines', () => {
  it('1: wrapLines("Wrap note\\n" + fox, 47) returns expected text and line values', () => {
    const result = wrapLines('Wrap note\n' + fox, 47);
    expect(result.map(r => r.text)).toEqual([
      'Wrap note',
      'The quick brown fox jumps over the lazy dog and',
      'keeps running far away',
    ]);
    expect(result.map(r => r.line)).toEqual([0, 1, 1]);
  });

  it('2: wrapLines("Title\\n\\nbody", 20) returns rows for empty line', () => {
    const result = wrapLines('Title\n\nbody', 20);
    expect(result).toEqual([
      { text: 'Title', line: 0 },
      { text: '', line: 1 },
      { text: 'body', line: 2 },
    ]);
  });

  it('3: long word is cut at width boundary; short line fits in one row', () => {
    const a = wrapLines('abcdefghijklmnopqrstuvwxyz', 16);
    expect(a.map(r => r.text)).toEqual(['abcdefghijklmnop', 'qrstuvwxyz']);

    const b = wrapLines('exactly sixteen!', 16);
    expect(b).toHaveLength(1);
  });

  it('4: leading spaces preserved, no text longer than 14', () => {
    const result = wrapLines('  - [ ] buy a very long list of things', 14);
    expect(result[0].text).toBe('  - [ ] buy a');
    for (const row of result) {
      expect(row.text.length).toBeLessThanOrEqual(14);
    }
  });

  it('5: empty content returns one row; zero or negative width does not loop forever', () => {
    const a = wrapLines('', 10);
    expect(a).toEqual([{ text: '', line: 0 }]);

    // width 0 should not infinite-loop; every text should have at most 1 character
    const b = wrapLines('ab cd', 0);
    for (const row of b) {
      expect(row.text.length).toBeLessThanOrEqual(1);
    }

    // negative width also clamped to width 1
    const c = wrapLines('ab cd', -5);
    for (const row of c) {
      expect(row.text.length).toBeLessThanOrEqual(1);
    }
  });
});
