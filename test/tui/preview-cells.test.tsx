/**
 * Issue #126: preview wrapping counts terminal cells, not UTF-16 length.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { NoteList, listColWidth } from '../../src/tui/NoteList';
import { wrapLines } from '../../src/core/wrap';
import { makeNote } from './fixtures';

// independent of the code under test: CJK and kana take two cells, emoji two, the rest one
const cells = (s: string): number =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return n + ((cp >= 0x3000 && cp <= 0x9fff) || cp >= 0x1f300 ? 2 : 1);
  }, 0);

const CJK = '漢字かなカナ'.repeat(12);
const EMOJI = '🙂 smile '.repeat(12);

function frameLines(notes: ReturnType<typeof makeNote>[], width: number): string[] {
  const r = render(<NoteList notes={notes} selectedIndex={0} width={width} height={30} />);
  const f = r.lastFrame() ?? '';
  r.unmount();
  return f.split('\n');
}

describe('issue #126 preview wrapping counts terminal cells', () => {
  it('1: WHEN a note preview contains CJK or emoji characters THEN every preview line fits the list column width measured in terminal cells', () => {
    for (const width of [80, 120]) {
      const col = listColWidth(width);
      const lines = frameLines([makeNote('c', 'CJK note\n' + CJK), makeNote('e', 'Emoji note\n' + EMOJI)], width);
      for (const title of ['CJK note', 'Emoji note']) {
        const at = lines.findIndex((l) => l.includes(title));
        expect(at).toBeGreaterThan(-1);
        for (const p of [lines[at + 1], lines[at + 2]]) {
          expect(p.startsWith('    ')).toBe(true);
          expect(p.trim().length).toBeGreaterThan(0);
          expect(cells(p.trimEnd())).toBeLessThanOrEqual(col);
        }
        // a note still takes title, two preview lines and one blank row
        expect(lines[at + 3].trim()).toBe('');
      }
      // a grapheme wider than the row still makes a row of its own (no endless loop)
      expect(wrapLines('漢字', 1).map((r) => r.text)).toEqual(['漢', '字']);
      for (const text of [CJK, EMOJI]) {
        const rows = wrapLines(text, col - 4);
        for (const row of rows) expect(cells(row.text)).toBeLessThanOrEqual(col - 4);
        expect(rows.map((r) => r.text).join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
      }
    }
  });

  it('2: WHEN a preview contains only ASCII THEN wrapping is unchanged', () => {
    const A = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda';
    const B = 'averyveryverylongwordwithoutanyspacesatall and then some words';
    expect(wrapLines(A, 12).map((r) => r.text)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta', 'iota kappa', 'lambda']);
    expect(wrapLines(B, 10).map((r) => r.text)).toEqual(['averyveryv', 'erylongwor', 'dwithoutan', 'yspacesata', 'll and', 'then some', 'words']);
    expect(wrapLines('one\n\ntwo three four', 5).map((r) => [r.text, r.line])).toEqual([['one', 0], ['', 1], ['two', 2], ['three', 2], ['four', 2]]);
    const lines = frameLines([makeNote('a', 'Plain note\n' + A)], 80);
    const at = lines.findIndex((l) => l.includes('Plain note'));
    expect([lines[at + 1].trimEnd(), lines[at + 2].trimEnd()]).toEqual(['    alpha beta gamma delta', '    epsilon zeta eta theta iota']);
  });
});
