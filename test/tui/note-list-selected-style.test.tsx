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

describe('Note list selected style (T247)', () => {
  it('1: WHEN 2 notes (Note one/body one line, Note two/body two) are rendered with selectedIndex=0 THEN the frame line for Note one is exactly \\u001b[7m\\u001b[1m>Note one\\u001b[22m\\u001b[27m.', async () => {
    const frame = await withInkChalkLevel3(() => {
      const { lastFrame } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
      );
      return lastFrame();
    });
    const lines = getLines(frame);
    const titleLine = lines.find(l => l.includes('Note one') && l.includes('>'));
    expect(titleLine).toBe('\u001b[7m\u001b[1m\u001b[34m>Note one\u001b[39m\u001b[22m\u001b[27m');
  });

  it('2: WHEN the same 2 notes are rendered with selectedIndex=0 THEN the frame line for Note two is exactly " Note two".', async () => {
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

  it('3: WHEN the same 2 notes are rendered with selectedIndex=1 THEN the line for Note one is exactly " Note one" and the line for Note two is exactly \\u001b[7m\\u001b[1m>Note two\\u001b[22m\\u001b[27m.', async () => {
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
    expect(lineNoteTwo).toBe('\u001b[7m\u001b[1m\u001b[34m>Note two\u001b[39m\u001b[22m\u001b[27m');
  });

  it('4: WHEN the same 2 notes are rendered with selectedIndex=0 THEN lastFrame() is exactly "Notes\\n>Note one\\n  body one line\\n\\n Note two\\n  body two\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n".', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    const frame = lastFrame();
    const expected =
      'Notes\n' +
      '>Note one\n' +
      '  body one line\n' +
      '\n' +
      ' Note two\n' +
      '  body two\n' +
      '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n';
    expect(frame).toBe(expected);
  });
});
