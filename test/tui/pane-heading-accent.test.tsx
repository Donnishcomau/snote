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

const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

describe('T378 Pane headings use accent and bold, the focused heading stays inverse', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN <NoteList notes={[]} selectedIndex={0} width={40} height={10} /> renders with chalk forced THEN the frame contains \\u001b[1m\\u001b[34mNotes\\u001b[39m\\u001b[22m', async () => {
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[1m\u001b[34mNotes\u001b[39m\u001b[22m');
  });

  it('2: WHEN <TagPane tags={[\'home\']} selectedIndex={0} focused={false} width={20} height={5} /> renders with chalk forced THEN the frame contains \\u001b[1m\\u001b[34mTags\\u001b[39m\\u001b[22m', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={20} height={5} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[1m\u001b[34mTags\u001b[39m\u001b[22m');
  });

  it('3: WHEN Preview renders with note={null} (80x24, chalk forced) THEN the frame contains \\u001b[1m\\u001b[34mPreview\\u001b[39m\\u001b[22m', async () => {
    const { lastFrame } = render(
      <Preview note={null} width={80} height={24} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[1m\u001b[34mPreview\u001b[39m\u001b[22m');
  });

  it('4: WHEN Preview renders makeNote(\'g\', \'Groceries\\n\\nbody\', {}) (80x24, chalk forced) THEN the frame contains \\u001b[1m\\u001b[34mPreview: Groceries\\u001b[39m\\u001b[22m', async () => {
    const { lastFrame } = render(
      <Preview note={makeNote('g', 'Groceries\n\nbody', {})} width={80} height={24} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[1m\u001b[34mPreview: Groceries\u001b[39m\u001b[22m');
  });

  it('5: WHEN the empty NoteList of line 1 renders with focused and chalk forced THEN the frame contains \\u001b[7m\\u001b[1mNotes\\u001b[22m\\u001b[27m and does not contain \\u001b[34mNotes', async () => {
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} focused />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[7m\u001b[1mNotes\u001b[22m\u001b[27m');
    expect(frame).not.toContain('\u001b[34mNotes');
  });

  it('6: WHEN the empty NoteList of line 1 renders without forcing chalk THEN the frame starts with Notes and does not contain \\u001b', async () => {
    inkChalk.level = 0;
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame.startsWith('Notes')).toBe(true);
    expect(frame).not.toContain('\u001b');
  });
});
