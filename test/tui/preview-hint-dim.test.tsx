// T383: colour pass step 7. In Preview the tag hint's ` add tag` text is dim
// (theme.muted) while the `g` key letter keeps the accent (the T352
// key-name convention). Checklist boxes stay dim/green.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';

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

describe('preview hint dim (T383)', () => {
  it("1: WHEN <Preview note={makeNote('t', 'No tags note\\nbody', { tags: [] })} width={80} height={12} /> renders with chalk forced THEN the frame contains \\u001b[34mg\\u001b[39m\\u001b[2m add tag\\u001b[22m", async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('t', 'No tags note\nbody', { tags: [] });
      const { lastFrame, unmount } = render(
        <Preview note={note} width={80} height={12} />,
      );
      await delay(50);
      expect(lastFrame() ?? '').toContain(
        '\u001b[34mg\u001b[39m\u001b[2m add tag\u001b[22m',
      );
      unmount();
    } finally {
      restore();
    }
  });

  it("2: WHEN <Preview note={makeNote('t3', 'Tagged\\nbody', { tags: ['work'] })} width={80} height={8} inTrash /> renders with chalk forced THEN the frame contains #work and does not contain add tag", async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('t3', 'Tagged\nbody', { tags: ['work'] });
      const { lastFrame, unmount } = render(
        <Preview note={note} width={80} height={8} inTrash />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('#work');
      expect(frame).not.toContain('add tag');
      unmount();
    } finally {
      restore();
    }
  });

  it("3: WHEN a markdown note 'Shopping List\\n\\n- [ ] milk\\n- [x] bread' renders with `rendered` and chalk forced THEN the frame contains \\u001b[2m☐\\u001b[22m milk and \\u001b[32m☑\\u001b[39m bread", async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('m', 'Shopping List\n\n- [ ] milk\n- [x] bread', {
        markdown: true,
      });
      const { lastFrame, unmount } = render(
        <Preview note={note} width={80} height={12} rendered />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[2m☐\u001b[22m milk');
      expect(frame).toContain('\u001b[32m☑\u001b[39m bread');
      unmount();
    } finally {
      restore();
    }
  });

  it("4: WHEN the tagless note of line 1 renders without forcing chalk THEN the frame contains 'g add tag' and does not contain \\u001b[", async () => {
    const note = makeNote('t', 'No tags note\nbody', { tags: [] });
    const { lastFrame, unmount } = render(
      <Preview note={note} width={80} height={12} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('g add tag');
    expect(frame).not.toContain('\u001b[');
    unmount();
  });
});
