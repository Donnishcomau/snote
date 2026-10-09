import { describe, it, expect } from 'vitest';

import { inlineMarkdown, rowSpans } from '../../src/core/md-inline';
import { wrapLines } from '../../src/core/wrap';

describe('inlineMarkdown / rowSpans', () => {
  it('1: WHEN inlineMarkdown runs on "A [link](https://example.com) here" THEN it returns { text: \'A link here\', spans: [{ start: 2, end: 6, kind: \'link\' }] }', () => {
    expect(inlineMarkdown('A [link](https://example.com) here')).toEqual({
      text: 'A link here',
      spans: [{ start: 2, end: 6, kind: 'link' }],
    });
  });

  it('2: WHEN it runs on a line "x ", a backtick-quoted `code span`, then " y" THEN it returns { text: \'x code span y\', spans: [{ start: 2, end: 11, kind: \'code\' }] }', () => {
    expect(inlineMarkdown('x `code span` y')).toEqual({
      text: 'x code span y',
      spans: [{ start: 2, end: 11, kind: 'code' }],
    });
  });

  it('3: WHEN it runs on "**bold** and [a](u) then " plus a backtick-quoted `b` THEN text is "bold and a then b" and spans are [{ start: 9, end: 10, kind: \'link\' }, { start: 16, end: 17, kind: \'code\' }]', () => {
    const { text, spans } = inlineMarkdown('**bold** and [a](u) then `b`');
    expect(text).toBe('bold and a then b');
    expect(spans).toEqual([
      { start: 9, end: 10, kind: 'link' },
      { start: 16, end: 17, kind: 'code' },
    ]);
  });

  it('4: WHEN it runs on "plain **x** text" THEN it returns { text: \'plain x text\', spans: [] }', () => {
    expect(inlineMarkdown('plain **x** text')).toEqual({
      text: 'plain x text',
      spans: [],
    });
  });

  it('5: WHEN the line "aaaa bbbb [cc dd](u) eeee " plus a backtick-quoted `ff` goes through inlineMarkdown, wrapLines(text, 9) and rowSpans THEN the result is [[], [{ start: 0, end: 5, kind: \'link\' }], [{ start: 5, end: 7, kind: \'code\' }]]', () => {
    const { text, spans } = inlineMarkdown('aaaa bbbb [cc dd](u) eeee `ff`');
    const rows = wrapLines(text, 9).map((r) => r.text);
    expect(rowSpans(text, rows, spans)).toEqual([
      [],
      [{ start: 0, end: 5, kind: 'link' }],
      [{ start: 5, end: 7, kind: 'code' }],
    ]);
  });

  it('6: WHEN it runs on "ab [l](u)" THEN it returns { text: \'ab l\', spans: [{ start: 3, end: 4, kind: \'link\' }] }', () => {
    expect(inlineMarkdown('ab [l](u)')).toEqual({
      text: 'ab l',
      spans: [{ start: 3, end: 4, kind: 'link' }],
    });
  });
});
