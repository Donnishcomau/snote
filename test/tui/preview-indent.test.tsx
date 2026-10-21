/**
 * Issue #75: previews are indented clearly under the title.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { NoteList, listColWidth } from '../../src/tui/NoteList';
import { makeNote } from './fixtures';

const LONG = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega';

function frameLines(notes: ReturnType<typeof makeNote>[], width: number, height: number): string[] {
  const r = render(<NoteList notes={notes} selectedIndex={0} width={width} height={height} />);
  const f = r.lastFrame() ?? '';
  r.unmount();
  return f.split('\n');
}

describe('issue #75 previews are indented under the title', () => {
  it('1: WHEN a note with a title and two preview lines is listed THEN each preview line starts with 4 spaces (3 cells right of the title text) and the title with 1', () => {
    const lines = frameLines([makeNote('a', 'Top note\nfirst line\nsecond line'), makeNote('b', 'Shopping\nmilk\nbread')], 80, 24);
    const at = lines.findIndex((l) => l.includes('Shopping'));
    expect(lines[at]).toBe(' Shopping');
    expect(lines[at + 1]).toBe('    milk');
    expect(lines[at + 2]).toBe('    bread');
    expect(lines[at + 1].indexOf('milk') - lines[at].indexOf('Shopping')).toBe(3);
  });

  it('2: WHEN a preview line is longer than the column THEN it is cut to the column width minus the new indent, as before', () => {
    for (const width of [80, 120]) {
      const col = listColWidth(width);
      const lines = frameLines([makeNote('a', 'Top note\nx'), makeNote('w', 'Wide note\n' + LONG)], width, 24);
      const at = lines.findIndex((l) => l.includes('Wide note'));
      for (const p of [lines[at + 1], lines[at + 2]]) {
        expect(p.startsWith('    ')).toBe(true);
        expect(p.slice(4).length).toBeGreaterThan(0);
        expect(p.slice(4).trimEnd().length).toBeLessThanOrEqual(col - 4);
        expect(p.slice(4, 5)).not.toBe(' ');
      }
      expect(lines[at + 1].startsWith('    alpha beta')).toBe(true);
      expect(lines[at + 3].trim()).toBe('');
    }
  });

  it('3: WHEN the frame is rendered at 80x24 and 120x40 THEN no list line is wider than the column', () => {
    const notes = Array.from({ length: 12 }, (_, i) => makeNote(`n${i}`, `Note number ${i} with a fairly long title text\n${LONG}`));
    for (const [width, height] of [[80, 24], [120, 40]]) {
      const col = listColWidth(width);
      const lines = frameLines(notes, width, height);
      expect(lines.some((l) => l.startsWith('    alpha'))).toBe(true);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(col);
      const previews = lines.filter((l) => l.startsWith('    '));
      expect(previews.length).toBeGreaterThan(0);
      for (const l of previews) expect(l.length).toBeLessThanOrEqual(col);
    }
  });
});
