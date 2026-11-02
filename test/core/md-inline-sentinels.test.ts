import { describe, it, expect } from 'vitest';

import { inlineMarkdown, markdownBodyLine } from '../../src/core/md-inline';

// U+E000..U+E008 are snote's own private markers in md-inline.ts. A note can contain them as text (#494).
const NINE = Array.from({ length: 9 }, (_, i) => String.fromCharCode(0xe000 + i));
const without = (s: string): string => NINE.reduce((acc, c) => acc.split(c).join(''), s);
const PREFIX = /^[•☐☑]/;

describe('md-inline: private-use characters in a note are plain removed text (#494)', () => {
  it.each(NINE.map((c) => [c.charCodeAt(0).toString(16).toUpperCase(), c]))(
    '1: WHEN a line holds U+%s alone, at the start and in the middle THEN inlineMarkdown and markdownBodyLine give no span, no prefix, and the text as typed minus that character',
    (_code, c) => {
      for (const raw of [`${c}word here`, `a ${c}b${c} c`, `${c}`, `x${c}`]) {
        const typed = without(raw);
        const inl = inlineMarkdown(raw);
        const body = markdownBodyLine(raw);
        expect(inl.spans, JSON.stringify(raw)).toEqual([]);
        expect(body.spans, JSON.stringify(raw)).toEqual([]);
        expect(inl.text, JSON.stringify(raw)).toBe(inlineMarkdown(typed).text);
        expect(body.text, JSON.stringify(raw)).toBe(markdownBodyLine(typed).text);
        expect(body.text).not.toMatch(PREFIX);
        expect(NINE.some((c) => (inl.text + body.text).includes(c))).toBe(false);
      }
    },
  );

  it('2: WHEN a note holds a forged pair (E000+E001 link, E002+E003 code, E007+E008 image), nested pairs, or a forged marker with text THEN no span and no prefix appear and the text is as typed minus the characters', () => {
    const [LO, LC, CO, CC, BU, CE, CD, IO, IC] = NINE as [string, string, string, string, string, string, string, string, string];
    const cases: Array<[string, string]> = [
      [`${CO}forged${CC} plain`, 'forged plain'],
      [`${LO}link${LC}`, 'link'],
      [`${LO}${LO}x${LC}`, 'x'],
      [`${LO}${CO}x${CC}${LC}`, 'x'],
      [`${CO}${LO}x${LC}${CC}`, 'x'],
      [`${IO}alt${IC}`, 'alt'],
      [`${LO}a${IC}b${LC}`, 'ab'],
      [`${BU}not a bullet`, 'not a bullet'],
      [`${CE}not a box`, 'not a box'],
      [`${CD}not done`, 'not done'],
      [`${BU}${CD}${CE}${BU}`, ''],
    ];
    for (const [raw, shown] of cases) {
      expect(inlineMarkdown(raw), JSON.stringify(raw)).toEqual({ text: shown, spans: [] });
      expect(markdownBodyLine(raw), JSON.stringify(raw)).toEqual({ text: shown, isHeading: false, spans: [] });
    }
  });

  it('3: WHEN the characters sit inside real markdown (a real link, code span, image, heading, bullet and checklist) THEN each result equals the same line without the characters, and the real markup still works', () => {
    const [LO, LC, CO, CC, BU, CE, CD, IO, IC] = NINE as [string, string, string, string, string, string, string, string, string];
    const lines = [
      `see [do${IC}cs](https://d.io)${LO} now`,
      `see ${LC}[docs](https://d.io) and \`co${CC}de\``,
      `a ${IO}![alt](u.png)${IC} b [l](u)`,
      `${BU}# Title${CD}`,
      `${CE}## Title ${CO}`,
      `${CD}- [ ] todo ${LO}[x](u)`,
      `-${CE} [x] done`,
      `- [${CD}x] done`,
      `${BU}- item ${CC}`,
      `${CE}- [x] ok \`c\` ${LC}`,
      `[a${LO}b](u) and [c${LC}d](u)`,
      `\`a${CO}b\` and \`c${CC}d\``,
    ];
    for (const raw of lines) {
      expect(markdownBodyLine(raw), JSON.stringify(raw)).toEqual(markdownBodyLine(without(raw)));
      expect(inlineMarkdown(raw), JSON.stringify(raw)).toEqual(inlineMarkdown(without(raw)));
    }
    expect(markdownBodyLine(`${CD}- [ ] see [docs](https://d.io) now${LO}`)).toEqual({
      text: '☐ see docs now',
      isHeading: false,
      spans: [{ start: 6, end: 10, kind: 'link' }],
    });
    expect(markdownBodyLine(`${BU}# Title`)).toEqual({ text: 'Title', isHeading: true, spans: [] });
    expect(inlineMarkdown(`x ${CC}\`c\`${LC}`)).toEqual({ text: 'x c', spans: [{ start: 2, end: 3, kind: 'code' }] });
    expect(inlineMarkdown(`[a${IC}b](u)`)).toEqual({ text: 'ab', spans: [{ start: 0, end: 2, kind: 'link' }] });
  });
});
