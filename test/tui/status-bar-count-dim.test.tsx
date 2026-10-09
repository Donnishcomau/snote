// T384: the status line dims the note count (theme.muted) while `connected`
// stays green, `offline` red, and `pending` yellow.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import { StatusBar } from '../../src/tui/StatusBar';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Portable way to force ink's bundled chalk to emit ANSI (the T244 recipe,
 * same as content-not-muted.test.tsx).
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

describe('status bar count dim (T384)', () => {
  it('1: WHEN <StatusBar connected={true} count={3} width={40} /> renders with chalk forced THEN lastFrame() is exactly \\u001b[2m[\\u001b[22m\\u001b[32mconnected\\u001b[39m\\u001b[2m]\\u001b[22m \\u001b[2m3 notes\\u001b[22m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <StatusBar connected={true} count={3} width={40} />,
      );
      await delay(50);
      expect(lastFrame()).toBe(
        '\u001b[2m[\u001b[22m\u001b[32mconnected\u001b[39m\u001b[2m]\u001b[22m \u001b[2m3 notes\u001b[22m',
      );
      unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN StatusBar renders connected={false} count={0} width={40} pending={2} forced THEN the frame contains \\u001b[31moffline\\u001b[39m, \\u001b[2m0 notes\\u001b[22m and \\u001b[33m 2 pending\\u001b[39m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <StatusBar connected={false} count={0} width={40} pending={2} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[31moffline\u001b[39m');
      expect(frame).toContain('\u001b[2m0 notes\u001b[22m');
      expect(frame).toContain('\u001b[33m 2 pending\u001b[39m');
      unmount();
    } finally {
      restore();
    }
  });

  it('3: WHEN <StatusBar connected={true} count={3} width={40} /> renders without forcing chalk THEN lastFrame() is exactly [connected] 3 notes', async () => {
    const { lastFrame, unmount } = render(
      <StatusBar connected={true} count={3} width={40} />,
    );
    await delay(50);
    expect(lastFrame()).toBe('[connected] 3 notes');
    unmount();
  });
});
