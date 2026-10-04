// T352: key names take the blue accent role and muted chrome takes the dim
// role. Cyan (\u001b[36m) and bright-black gray (\u001b[90m) are gone from these
// components; keys render \u001b[34m...\u001b[39m and dim chrome \u001b[2m...\u001b[22m.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import KeyHints from '../../src/tui/KeyHints';
import { Help } from '../../src/tui/Help';
import Preview from '../../src/tui/Preview';
import { Divider } from '../../src/tui/Divider';
import { StatusBar } from '../../src/tui/StatusBar';
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

describe('theme adoption (T352)', () => {
  it('1: WHEN <KeyHints context="list" width={80} /> is rendered THEN the frame contains \\u001b[34m?\\u001b[39m Help and does not contain \\u001b[36m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(<KeyHints context="list" width={80} />);
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[34m?\u001b[39m Help');
      expect(frame).not.toContain('\u001b[36m');
      unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN <Divider height={2} /> is rendered THEN the frame is exactly \\u001b[2m│\\u001b[22m\\n\\u001b[2m│\\u001b[22m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(<Divider height={2} />);
      await delay(50);
      expect(lastFrame()).toBe('\u001b[2m│\u001b[22m\n\u001b[2m│\u001b[22m');
      unmount();
    } finally {
      restore();
    }
  });

  it('3: WHEN <StatusBar connected={true} count={3} width={40} /> is rendered THEN the frame is exactly \\u001b[2m[\\u001b[22m\\u001b[32mconnected\\u001b[39m\\u001b[2m]\\u001b[22m 3 notes', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <StatusBar connected={true} count={3} width={40} />,
      );
      await delay(50);
      expect(lastFrame()).toBe(
        '\u001b[2m[\u001b[22m\u001b[32mconnected\u001b[39m\u001b[2m]\u001b[22m 3 notes',
      );
      unmount();
    } finally {
      restore();
    }
  });

  it('4: WHEN <Help width={80} height={24} entries={[{ key: \'j\', action: \'move_down\', description: \'Move down\' }]} /> is rendered THEN the frame contains \\u001b[34mj       \\u001b[39m  Move down', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { lastFrame, unmount } = render(
        <Help
          width={80}
          height={24}
          entries={[{ key: 'j', action: 'move_down', description: 'Move down' }]}
        />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[34mj       \u001b[39m  Move down');
      unmount();
    } finally {
      restore();
    }
  });

  it('5: WHEN a markdown note with `- [ ] milk` and `- [x] bread` and a tagless note are rendered in Preview THEN frames contain \\u001b[2m☐\\u001b[22m milk, \\u001b[32m☑\\u001b[39m bread and \\u001b[34mg\\u001b[39m add tag', async () => {
    const { restore } = await forceInkChalk();
    try {
      const checklist = makeNote('c', 'Shopping List\n\n- [ ] milk\n- [x] bread', {
        markdown: true,
      });
      const { lastFrame: checklistFrame, unmount } = render(
        <Preview note={checklist} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = checklistFrame() ?? '';
      expect(frame).toContain('\u001b[2m☐\u001b[22m milk');
      expect(frame).toContain('\u001b[32m☑\u001b[39m bread');
      unmount();

      const tagless = makeNote('t', 'No tags note\nbody', { tags: [] });
      const { lastFrame: taglessFrame, unmount: unmount2 } = render(
        <Preview note={tagless} width={80} height={12} />,
      );
      await delay(50);
      expect(taglessFrame() ?? '').toContain('\u001b[34mg\u001b[39m add tag');
      unmount2();
    } finally {
      restore();
    }
  });

  it('6: WHEN KeyHints, Help, Preview, Divider, StatusBar and TagEditor sources are read THEN none contains color="gray" or color="cyan" and each contains theme.', async () => {
    const fs = await import('fs');
    const files = [
      'src/tui/KeyHints.tsx',
      'src/tui/Help.tsx',
      'src/tui/Preview.tsx',
      'src/tui/Divider.tsx',
      'src/tui/StatusBar.tsx',
      'src/tui/TagEditor.tsx',
    ];
    for (const f of files) {
      const source = await fs.promises.readFile(f, 'utf8');
      expect(source).not.toContain('color="gray"');
      expect(source).not.toContain('color="cyan"');
      expect(source).toContain('theme.');
    }
  });
});
