// T275: content text must not render in the theme's `muted` slot (bright0 /
// ANSI 90), which is reserved for chrome. Content uses the default text colour.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import { NoteList } from '../../src/tui/NoteList';
import Preview from '../../src/tui/Preview';
import { History } from '../../src/tui/History';
import { Login } from '../../src/tui/Login';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Portable way to force ink's bundled chalk to emit ANSI (the T244 recipe).
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

describe('T275 content not muted', () => {
  // A content string is "muted" when the ANSI escape immediately before it
  // is bright-black (the theme's muted slot, \u001b[90m). The divider glyph │
  // legitimately renders muted, so strip the divider run ("│" plus whatever
  // escape follows it) before checking what precedes the content.
  const mutedBefore = (frame: string, content: string): boolean => {
    const clean = frame.replace(/\u001b\[90m│(?:\u001b\[[0-9;]*m)?/g, '');
    const at = clean.indexOf(content);
    if (at < 0) return false;
    if (at === 0) return false;
    return clean.slice(Math.max(0, at - 6), at) === '\u001b[90m';
  };

  it('1: WHEN NoteList renders 1 note Title\\nneed to type something with chalk forced THEN the frame contains need to type something and does not contain \\u001b[90mneed to type something', async () => {
    const { restore } = await forceInkChalk();
    try {
      const notes = [makeNote('1', 'Title\nneed to type something')];
      const { lastFrame, unmount } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('need to type something');
      expect(frame).not.toContain('\u001b[90mneed to type something');
      expect(mutedBefore(frame, 'need to type something')).toBe(false);
      unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN Preview renders note={null} with chalk forced THEN the frame contains Select a note to preview and does not contain \\u001b[90mSelect a note to preview', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <Preview note={null} width={80} height={24} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Select a note to preview');
      expect(frame).not.toContain('\u001b[90mSelect a note to preview');
      expect(mutedBefore(frame, 'Select a note to preview')).toBe(false);
      unmount();
    } finally {
      restore();
    }
  });

  it('3: WHEN Preview renders a note tagged work with chalk forced THEN the frame contains #work and does not contain \\u001b[90m#work', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('t', 'Title\nsome content', { tags: ['work'] });
      const { lastFrame, unmount } = render(
        <Preview note={note} width={80} height={24} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('#work');
      expect(frame).not.toContain('\u001b[90m#work');
      expect(mutedBefore(frame, '#work')).toBe(false);
      unmount();
    } finally {
      restore();
    }
  });

  it('4: WHEN History renders with no earlier versions and chalk forced THEN the frame contains no earlier versions and does not contain \\u001b[90mno earlier versions', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <History rows={[]} selectedIndex={0} loading={false} width={80} height={24} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('no earlier versions');
      expect(frame).not.toContain('\u001b[90mno earlier versions');
      expect(mutedBefore(frame, 'no earlier versions')).toBe(false);
      unmount();
    } finally {
      restore();
    }
  });

  it('5: WHEN Login renders its first screen with chalk forced THEN the frame contains Tab: log in with a password and does not contain \\u001b[90mTab: log in with a password', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <Login
          width={80}
          height={24}
          requestCode={async () => undefined}
          completeLogin={async () => ''}
          onLoggedIn={() => undefined}
          passwordLogin={async () => ''}
        />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Tab: log in with a password');
      expect(frame).not.toContain('\u001b[90mTab: log in with a password');
      expect(mutedBefore(frame, 'Tab: log in with a password')).toBe(false);
      unmount();
    } finally {
      restore();
    }
  });

  it('6: WHEN src/tui/Divider.tsx, src/tui/StatusBar.tsx and src/tui/TagEditor.tsx are read as text THEN together they still contain color="gray" exactly 4 times', async () => {
    const fs = await import('fs');
    const files = [
      'src/tui/Divider.tsx',
      'src/tui/StatusBar.tsx',
      'src/tui/TagEditor.tsx',
    ];
    const source = (
      await Promise.all(files.map((f) => fs.promises.readFile(f, 'utf8')))
    ).join('\n');
    expect(source.split('color="gray"').length - 1).toBe(4);
  });
});
