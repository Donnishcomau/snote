/**
 * Issue #70: note titles in the list are bold.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';

import { NoteList } from '../../src/tui/NoteList';
import { makeNote } from './fixtures';

const ESC = String.fromCharCode(27);
const BOLD = ESC + '[1m';
const DIM = ESC + '[2m';
const INVERSE = ESC + '[7m';

const notes = [
  makeNote('1', 'Alpha title\nalpha body'),
  makeNote('2', 'Beta title\nbeta body'),
  makeNote('3', 'Gamma title\ngamma body'),
];

async function withChalk<T>(fn: () => T): Promise<T> {
  const inkPkgDir = dirname(createRequire(import.meta.url).resolve('ink'));
  const inkChalkPath = pathToFileURL(join(inkPkgDir, '..', 'node_modules', 'chalk', 'source', 'index.js')).href;
  const inkChalk = (await import(inkChalkPath)).default;
  const saved = inkChalk.level;
  inkChalk.level = 3;
  try {
    return fn();
  } finally {
    inkChalk.level = saved;
  }
}

async function colourFrame(): Promise<string[]> {
  const frame = await withChalk(() => {
    const r = render(<NoteList notes={notes} selectedIndex={1} width={60} height={26} />);
    const f = r.lastFrame() ?? '';
    r.unmount();
    return f;
  });
  return frame.split('\n');
}

const lineWith = (lines: string[], text: string): string => lines.find((l) => l.includes(text)) ?? '';

describe('issue #70 note titles in the list are bold', () => {
  it('1: WHEN the list renders 3 notes with the second selected, chalk forced THEN the first and third title lines contain `[1m` before the title text and no `[7m`', async () => {
    const lines = await colourFrame();
    for (const title of ['Alpha title', 'Gamma title']) {
      const line = lineWith(lines, title);
      expect(line).toBe(' ' + BOLD + title + ESC + '[22m');
      expect(line.indexOf(BOLD)).toBeLessThan(line.indexOf(title));
      expect(line).not.toContain(INVERSE);
      expect(line).toContain('[1m');
      expect(line).not.toContain('[7m');
    }
  });

  it('2: WHEN the same render happens THEN the preview lines still start with the dim code `[2m` after their indent and contain no `[1m`', async () => {
    const lines = await colourFrame();
    for (const body of ['alpha body', 'beta body', 'gamma body']) {
      const line = lineWith(lines, body);
      expect(line.trimStart().startsWith(DIM)).toBe(true);
      expect(line).toContain('[2m');
      expect(line).not.toContain('[1m');
    }
  });

  it('3: WHEN the second note is selected THEN its title line is exactly the selected style as before', async () => {
    const lines = await colourFrame();
    expect(lineWith(lines, 'Beta title')).toBe(INVERSE + BOLD + ESC + '[34m>Beta title' + ESC + '[39m' + ESC + '[22m' + ESC + '[27m');
  });

  it('4: WHEN chalk is off THEN the frame is unchanged from the current goldens', () => {
    const r = render(<NoteList notes={notes} selectedIndex={1} width={60} height={26} />);
    const frame = r.lastFrame() ?? '';
    r.unmount();
    expect(frame).not.toContain(ESC);
    const lines = frame.split('\n');
    expect(lines.slice(0, 2)).toEqual(['Notes', ' Alpha title']);
    expect([lines[4], lines[7]]).toEqual(['>Beta title', ' Gamma title']);
    expect([lines[2].trim(), lines[5].trim(), lines[8].trim()]).toEqual(['alpha body', 'beta body', 'gamma body']);
    expect([lines[3], lines[6], lines[9]]).toEqual(['', '', '']);
  });
});
