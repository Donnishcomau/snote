// T285: make it obvious how to add a tag to a note. The list key hint relabels
// `g` as "Add tag", and Preview's spacer slot always shows a `g add tag` hint
// (except in trash view).
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import KeyHints from '../../src/tui/KeyHints';
import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lines = (frame: string | undefined): string[] => {
  if (!frame) return [];
  return frame.split('\n').map(stripAnsi);
};

/**
 * Portable way to force ink's bundled chalk to emit ANSI (the T244 recipe,
 * same as content-not-muted.test.tsx:18-30).
 */
async function forceInkChalk(): Promise<{ restore: () => void }> {
  const inkResolved = createRequire(import.meta.url).resolve('ink');
  const inkPkgDir = dirname(dirname(inkResolved));
  const chalkPath = join(inkPkgDir, 'node_modules/chalk/source/index.js');
  const inkChalk = (await import(pathToFileURL(chalkPath).href)).default;
  const savedLevel = inkChalk.level;
  inkChalk.level = 3;
  return {
    restore: () => {
      inkChalk.level = savedLevel;
    },
  };
}

describe('Tag hint (T285)', () => {
  it('1: WHEN <KeyHints context="list" width={80} /> is rendered THEN the frame contains the exact ? Help  n New  e Edit  g Add tag  / Search  q Quit', async () => {
    const { lastFrame, unmount } = render(<KeyHints context="list" width={80} />);
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(stripAnsi(frame)).toContain('? Help  n New  e Edit  g Add tag  / Search  q Quit');
    unmount();
  });

  it('2: WHEN <Preview note={makeNote(\'t1\',\'Tagged note\\nbody\',{tags:[\'work\',\'ideas\']})} width={80} height={12} /> is rendered THEN frame line 1 is exactly │#work #ideas and line 2 is exactly │g add tag', async () => {
    const note = makeNote('t1', 'Tagged note\nbody', { tags: ['work', 'ideas'] });
    const { lastFrame, unmount } = render(
      <Preview note={note} width={80} height={12} />,
    );
    await delay(50);
    const frameLines = lines(lastFrame());
    expect(frameLines[1]).toBe('│#work #ideas');
    expect(frameLines[2]).toBe('│g add tag');
    unmount();
  });

  it('3: WHEN <Preview note={makeNote(\'t2\',\'No tags note\\nbody\',{tags:[]})} width={80} height={12} /> is rendered THEN frame line 1 is exactly │g add tag', async () => {
    const note = makeNote('t2', 'No tags note\nbody', { tags: [] });
    const { lastFrame, unmount } = render(
      <Preview note={note} width={80} height={12} />,
    );
    await delay(50);
    const frameLines = lines(lastFrame());
    expect(frameLines[1]).toBe('│g add tag');
    unmount();
  });

  it('4: WHEN <Preview note={makeNote(\'t3\',\'Tagged note\\nbody\',{tags:[\'work\']})} width={80} height={12} inTrash={true} /> is rendered THEN frame line 1 is exactly │#work, line 2 is exactly │, and the frame does not contain add tag', async () => {
    const note = makeNote('t3', 'Tagged note\nbody', { tags: ['work'] });
    const { lastFrame, unmount } = render(
      <Preview note={note} width={80} height={12} inTrash={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    // The trash spacer is an empty row: divider glyph and nothing else.
    expect(frameLines[1]).toBe('│#work');
    expect(frameLines[2]).toBe('│');
    expect(frameLines[2]).not.toBe('│g add tag');
    // The hint never appears in the frame (the spacer row keeps its original
    // single-space content, so no "add tag" text follows the divider).
    expect(frameLines[2]).not.toContain('add tag');
    const withoutDivider = frame.replace(/\u001b\[90m│\u001b\[3[19]m/g, '');
    expect(withoutDivider).not.toContain('add tag');
    unmount();
  });

  it('5: WHEN <Preview note={makeNote(\'t4\',\'No tags note\\nbody\',{tags:[]})} width={80} height={12} /> is rendered with chalk forced to level 3 THEN the frame contains the exact \\u001b[36mg\\u001b[39m add tag and does not contain \\u001b[90m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('t4', 'No tags note\nbody', { tags: [] });
      const { lastFrame, unmount } = render(
        <Preview note={note} width={80} height={12} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[36mg\u001b[39m add tag');
      // \u001b[90m (gray) never precedes content; it only ever wraps the chrome
      // divider glyph, so drop that run (content-not-muted's mutedBefore idiom)
      // and check no gray remains anywhere else in the frame.
      const noDivider = frame.replace(/\u001b\[90m│(?:\u001b\[[0-9;]*m)?/g, '');
      expect(noDivider).not.toContain('\u001b[90m');
      unmount();
    } finally {
      restore();
    }
  });
});
