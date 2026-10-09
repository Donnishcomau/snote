import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { markdownBodyLine, bodyRowSpans } from '../../src/core/md-inline';
import { wrapLines } from '../../src/core/wrap';

const W = markdownBodyLine('aaaa bbbb cccc [dddd eeee ffff](https://x.io) gggg');

describe('bodyRowSpans', () => {
  it('1: WHEN lines is [markdownBodyLine("x"), W] and rows is wrapLines("x\\n" + W.text, 20) THEN the result is [[], [{ start: 15, end: 19, kind: \'link\' }], [{ start: 0, end: 9, kind: \'link\' }]]', () => {
    const lines = [markdownBodyLine('x'), W];
    const rows = wrapLines('x\n' + W.text, 20);
    expect(bodyRowSpans(lines, rows)).toEqual([
      [],
      [{ start: 15, end: 19, kind: 'link' }],
      [{ start: 0, end: 9, kind: 'link' }],
    ]);
  });

  it('2: WHEN lines is [markdownBodyLine("- [ ] see [docs](https://d.io) now")] and rows is wrapLines(lines[0].text, 80) THEN the result is [[{ start: 6, end: 10, kind: \'link\' }]]', () => {
    const lines = [markdownBodyLine('- [ ] see [docs](https://d.io) now')];
    const rows = wrapLines(lines[0].text, 80);
    expect(bodyRowSpans(lines, rows)).toEqual([[{ start: 6, end: 10, kind: 'link' }]]);
  });

  it('3: WHEN lines is ["a", "", "b"].map(markdownBodyLine) and rows is wrapLines("a\\n\\nb", 80) THEN the result is [[], [], []]', () => {
    const lines = ['a', '', 'b'].map(markdownBodyLine);
    const rows = wrapLines('a\n\nb', 80);
    expect(bodyRowSpans(lines, rows)).toEqual([[], [], []]);
  });

  it('4: WHEN lines is [] and rows is [] THEN the result is []', () => {
    expect(bodyRowSpans([], [])).toEqual([]);
  });

  it('5: WHEN src/core/md-inline.ts is read THEN it contains "rowSpans(" at least 2 times and has fewer than 300 lines', () => {
    const source = readFileSync(new URL('../../src/core/md-inline.ts', import.meta.url), 'utf8');
    expect(source.split('rowSpans(').length - 1).toBeGreaterThanOrEqual(2);
    expect(source.split('\n').length).toBeLessThan(300);
  });
});
