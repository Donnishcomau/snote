import { describe, it, expect } from 'vitest';

import removeMarkdown from 'remove-markdown';

import { markdownBodyLine } from '../../src/core/md-inline';

const L = 'A [link](https://example.com) and `code span` inline';

describe('markdownBodyLine', () => {
  it("1: WHEN markdownBodyLine('# Produce') is called THEN it returns { text: 'Produce', isHeading: true, spans: [] }", () => {
    expect(markdownBodyLine('# Produce')).toEqual({
      text: 'Produce',
      isHeading: true,
      spans: [],
    });
  });

  it("2: WHEN markdownBodyLine('- [ ] see [docs](https://d.io) now') is called THEN it returns { text: '☐ see docs now', isHeading: false, spans: [{ start: 6, end: 10, kind: 'link' }] }", () => {
    expect(markdownBodyLine('- [ ] see [docs](https://d.io) now')).toEqual({
      text: '☐ see docs now',
      isHeading: false,
      spans: [{ start: 6, end: 10, kind: 'link' }],
    });
  });

  it("3: WHEN markdownBodyLine('- [x] ok ' + '`c`') is called THEN it returns { text: '☑ ok c', isHeading: false, spans: [{ start: 5, end: 6, kind: 'code' }] }", () => {
    expect(markdownBodyLine('- [x] ok ' + '`c`')).toEqual({
      text: '☑ ok c',
      isHeading: false,
      spans: [{ start: 5, end: 6, kind: 'code' }],
    });
  });

  it("4: WHEN markdownBodyLine('- a ' + '`tool`' + ' here') is called THEN it returns { text: '• a tool here', isHeading: false, spans: [{ start: 4, end: 8, kind: 'code' }] }", () => {
    expect(markdownBodyLine('- a ' + '`tool`' + ' here')).toEqual({
      text: '• a tool here',
      isHeading: false,
      spans: [{ start: 4, end: 8, kind: 'code' }],
    });
  });

  it("5: WHEN markdownBodyLine(L) is called THEN text is 'A link and code span inline' and spans equals [{ start: 2, end: 6, kind: 'link' }, { start: 11, end: 20, kind: 'code' }]", () => {
    const { text, spans } = markdownBodyLine(L);
    expect(text).toBe('A link and code span inline');
    expect(spans).toEqual([
      { start: 2, end: 6, kind: 'link' },
      { start: 11, end: 20, kind: 'code' },
    ]);
  });

  it("6: WHEN each of '> quote', 'see ![img](x.png) here' and the empty string is passed THEN text equals removeMarkdown(raw) ('see img here' for the image line), isHeading is false and spans is []", () => {
    for (const raw of ['> quote', 'see ![img](x.png) here', '']) {
      const { text, isHeading, spans } = markdownBodyLine(raw);
      expect(text).toEqual(removeMarkdown(raw));
      expect(isHeading).toBe(false);
      expect(spans).toEqual([]);
    }
    expect(markdownBodyLine('see ![img](x.png) here').text).toBe('see img here');
  });
});
