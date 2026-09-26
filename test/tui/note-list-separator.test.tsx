import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { NoteList } from '../../src/tui/NoteList';
import { makeNote } from './fixtures';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function getLines(frame: string): string[] {
  return frame.split('\n');
}

function countBlanksBetween(
  stripped: string[],
  lastLineOfFirstNote: number,
  firstLineOfSecondNote: number,
): number {
  // Count blank (empty-after-strip) lines strictly between the two indices
  let count = 0;
  for (let i = lastLineOfFirstNote + 1; i < firstLineOfSecondNote; i++) {
    if (stripped[i].trim() === '') {
      count++;
    }
  }
  return count;
}

describe('Note list separator (T238)', () => {
  it('1: WHEN two notes each with a single-line preview are rendered THEN exactly 1 blank row separates the row containing line a and the row containing Title B.', async () => {
    const notes = [
      makeNote('a', 'Title A\nline a'),
      makeNote('b', 'Title B\nline b'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);

    const lineA = stripped.findIndex(l => l.includes('line a'));
    const titleB = stripped.findIndex(l => l.includes('Title B'));

    expect(lineA).toBeGreaterThanOrEqual(0);
    expect(titleB).toBeGreaterThanOrEqual(0);
    const blanks = countBlanksBetween(stripped, lineA, titleB);
    expect(blanks).toBe(1);
  });

  it('2: WHEN a note preview wraps to 2 lines THEN exactly 1 blank row separates the last preview row and Title D.', async () => {
    const notes = [
      makeNote('c', 'Title C\n' + 'word '.repeat(20).trim()),
      makeNote('d', 'Title D\nline d'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);

    const titleC = stripped.findIndex(l => l.includes('Title C'));
    const titleD = stripped.findIndex(l => l.includes('Title D'));

    expect(titleC).toBeGreaterThanOrEqual(0);
    expect(titleD).toBeGreaterThanOrEqual(0);

    // Title C has 2 preview lines: lines at titleC+1 and titleC+2 are previews
    // The last preview line is titleC+2
    const lastPreviewC = titleC + 2;
    const blanks = countBlanksBetween(stripped, lastPreviewC, titleD);
    expect(blanks).toBe(1);
  });

  it('3: WHEN a note with no body THEN exactly 1 blank row separates Title E and Title F.', async () => {
    const notes = [
      makeNote('e', 'Title E'),
      makeNote('f', 'Title F\nline f'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);

    const titleE = stripped.findIndex(l => l.includes('Title E'));
    const titleF = stripped.findIndex(l => l.includes('Title F'));

    expect(titleE).toBeGreaterThanOrEqual(0);
    expect(titleF).toBeGreaterThanOrEqual(0);
    const blanks = countBlanksBetween(stripped, titleE, titleF);
    expect(blanks).toBe(1);
  });

  it('4: WHEN a 4-note list mixes 0, 1, and 2 preview-line notes THEN the blank-row counts of all 3 gaps equal [1, 1, 1].', async () => {
    const notes = [
      makeNote('g', 'G'),
      makeNote('h', 'H\nh1'),
      makeNote('i', 'I\n' + 'word '.repeat(20).trim()),
      makeNote('j', 'J\nj1'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);

    const idxG = stripped.findIndex(l => l.includes('G') && !l.includes('Title'));
    const idxH = stripped.findIndex(l => l.includes('H') && !l.includes('Title'));
    const idxI = stripped.findIndex(l => l.includes('I') && !l.includes('Title'));
    const idxJ = stripped.findIndex(l => l.includes('J') && !l.includes('Title'));

    expect(idxG).toBeGreaterThanOrEqual(0);
    expect(idxH).toBeGreaterThanOrEqual(0);
    expect(idxI).toBeGreaterThanOrEqual(0);
    expect(idxJ).toBeGreaterThanOrEqual(0);

    // G has 0 previews -> last content = idxG, gap to H title
    const blankGH = countBlanksBetween(stripped, idxG, idxH);
    // H has 1 preview -> last content = idxH + 1, gap to I title
    const blankHI = countBlanksBetween(stripped, idxH + 1, idxI);
    // I has 2 previews -> last content = idxI + 2, gap to J title
    const blankIJ = countBlanksBetween(stripped, idxI + 2, idxJ);

    expect([blankGH, blankHI, blankIJ]).toEqual([1, 1, 1]);
  });
});
