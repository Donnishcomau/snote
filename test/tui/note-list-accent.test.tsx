import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';

import { NoteList } from '../../src/tui/NoteList';
import { makeNote } from './fixtures';

const notes = [
  makeNote('1', 'Note one\nbody one line'),
  makeNote('2', 'Note two\nbody two'),
];

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function getLines(frame: string): string[] {
  return frame.split('\n');
}

/**
 * Force Ink's bundled chalk to emit ANSI codes, run a render, then restore.
 * Returns the lastFrame string captured while chalk level was 3.
 */
async function withInkChalkLevel3<T>(fn: () => T): Promise<T> {
  const inkPkgDir = dirname(
    createRequire(import.meta.url).resolve('ink'),
  );
  const inkChalkPath = pathToFileURL(
    join(inkPkgDir, '..', 'node_modules', 'chalk', 'source', 'index.js'),
  ).href;
  const inkChalk = (await import(inkChalkPath)).default;
  const saved = inkChalk.level;
  inkChalk.level = 3;
  try {
    return fn();
  } finally {
    inkChalk.level = saved;
  }
}

describe('Note list accent colour (T379)', () => {
  it('1: WHEN the 2 notes render with selectedIndex=0, width 60, height 26, chalk forced THEN the Note one title line is exactly \\u001b[7m\\u001b[1m\\u001b[34m>Note one\\u001b[39m\\u001b[22m\\u001b[27m.', async () => {
    const frame = await withInkChalkLevel3(() => {
      const { lastFrame } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
      );
      return lastFrame();
    });
    const lines = getLines(frame);
    const titleLine = lines.find(l => l.includes('Note one') && l.includes('>'));
    expect(titleLine).toBe(
      '\u001b[7m\u001b[1m\u001b[34m>Note one\u001b[39m\u001b[22m\u001b[27m',
    );
  });

  it('2: WHEN the same render happens THEN the preview lines are exactly "  \\u001b[2mbody one line\\u001b[22m" and "  \\u001b[2mbody two\\u001b[22m".', async () => {
    const frame = await withInkChalkLevel3(() => {
      const { lastFrame } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
      );
      return lastFrame();
    });
    const lines = getLines(frame);
    const previewOne = lines.find(l => stripAnsi(l).includes('body one line'));
    const previewTwo = lines.find(l => stripAnsi(l).includes('body two'));
    expect(previewOne).toBe('  \u001b[2mbody one line\u001b[22m');
    expect(previewTwo).toBe('  \u001b[2mbody two\u001b[22m');
  });

  it('3: WHEN the same render happens THEN the Note two title line is exactly " Note two".', async () => {
    const frame = await withInkChalkLevel3(() => {
      const { lastFrame } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
      );
      return lastFrame();
    });
    const lines = getLines(frame);
    const titleLine = lines.find(l => stripAnsi(l).match(/^(\s*)>?(?:\s*)Note two/));
    expect(titleLine).toBe(' Note two');
  });

  it('4: WHEN the notes render with selectedIndex=1 THEN the Note one line is exactly " Note one" and the Note two line is exactly \\u001b[7m\\u001b[1m\\u001b[34m>Note two\\u001b[39m\\u001b[22m\\u001b[27m.', async () => {
    const frame = await withInkChalkLevel3(() => {
      const { lastFrame } = render(
        <NoteList notes={notes} selectedIndex={1} width={60} height={26} />
      );
      return lastFrame();
    });
    const lines = getLines(frame);
    const lineNoteOne = lines.find(l => stripAnsi(l).match(/^(\s*)>?(?:\s*)Note one/));
    const lineNoteTwo = lines.find(l => stripAnsi(l).match(/^(\s*)>?(?:\s*)Note two/));
    expect(lineNoteOne).toBe(' Note one');
    expect(lineNoteTwo).toBe(
      '\u001b[7m\u001b[1m\u001b[34m>Note two\u001b[39m\u001b[22m\u001b[27m',
    );
  });

  it('5: WHEN the 2 notes render with selectedIndex=0 without forcing chalk THEN the frame does not contain \\u001b[ and contains ">Note one" and "  body one line".', () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    const frame = lastFrame();
    expect(frame).not.toContain('\u001b[');
    expect(frame).toContain('>Note one');
    expect(frame).toContain('  body one line');
  });
});
