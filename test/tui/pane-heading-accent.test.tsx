import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { NoteList } from '../../src/tui/NoteList';
import { TagPane } from '../../src/tui/TagPane';
import { Preview } from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const E = String.fromCharCode(27);
const UNFOCUSED = (label: string): string => E + '[1m' + E + '[34m' + label + E + '[39m' + E + '[22m';
// #73: the focused heading is an accent bar: inverse, bold and blue, padded with spaces
const BAR = E + '[7m' + E + '[1m' + E + '[34m';

const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

describe('Pane headings use accent and bold, the focused heading stays inverse', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN <NoteList notes={[]} selectedIndex={0} width={40} height={10} /> renders with chalk forced THEN the frame contains Notes bold and blue', async () => {
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(UNFOCUSED('Notes'));
  });

  it('2: WHEN <TagPane tags={[\'home\']} selectedIndex={0} focused={false} width={20} height={5} /> renders with chalk forced THEN the frame contains Tags bold and blue', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={20} height={5} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(UNFOCUSED('Tags'));
  });

  it('3: WHEN Preview renders with note={null} (80x24, chalk forced) THEN the frame contains Preview bold and blue', async () => {
    const { lastFrame } = render(
      <Preview note={null} width={80} height={24} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(UNFOCUSED('Preview'));
  });

  it('4: WHEN Preview renders makeNote(\'g\', \'Groceries\\n\\nbody\', {}) (80x24, chalk forced) THEN the frame contains Preview: Groceries bold and blue', async () => {
    const { lastFrame } = render(
      <Preview note={makeNote('g', 'Groceries\n\nbody', {})} width={80} height={24} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(UNFOCUSED('Preview: Groceries'));
  });

  it('5: WHEN the empty NoteList of line 1 renders with focused and chalk forced THEN the frame contains the Notes accent bar, inverse, bold and blue (#73; it was inverse without blue before)', async () => {
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} focused />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(BAR + 'Notes ');
    expect(frame).not.toContain(E + '[7m' + E + '[1mNotes');
  });

  it('6: WHEN the empty NoteList of line 1 renders without forcing chalk THEN the frame starts with Notes and does not contain the ESC character', async () => {
    inkChalk.level = 0;
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame.startsWith('Notes')).toBe(true);
    expect(frame).not.toContain(E);
  });
});
