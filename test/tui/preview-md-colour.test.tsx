import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'node:fs';
import { render } from 'ink-testing-library';
import React from 'react';

import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lines = (frame: string | string[][] | undefined): string[] => {
  if (!frame) return [];
  if (typeof frame === 'string') return frame.split('\n');
  return frame.map(row => stripAnsi(Array.isArray(row) ? row.join('') : row));
};

/**
 * Portable way to force ink's bundled chalk to emit ANSI.
 */
async function forceInkChalk(): Promise<{ inkChalk: typeof import('chalk'); restore: () => void }> {
  const inkResolved = createRequire(import.meta.url).resolve('ink');
  const inkPkgDir = dirname(dirname(inkResolved));
  const chalkPath = join(inkPkgDir, 'node_modules/chalk/source/index.js');
  const inkChalk = (await import(pathToFileURL(chalkPath).href)).default;
  const savedLevel = inkChalk.level;
  inkChalk.level = 3;
  return {
    inkChalk,
    restore: () => {
      inkChalk.level = savedLevel;
    },
  };
}

const fixtureR = 'Reference Page\n\n# Links\nA [link](https://example.com) and `code span` inline';
const fixtureC = 'Title\n\n- [ ] see [docs](https://d.io) now\n- [x] ok `c`';
const fixtureW = 'Title\n\naaaa bbbb cccc [dddd eeee ffff](https://x.io) gggg';

describe('Preview markdown inline colour', () => {
  it('1: WHEN fixture R "Reference Page\\n\\n# Links\\nA [link](https://example.com) and `code span` inline" (markdown, rendered, chalk forced) renders THEN the frame contains \\u001b[1m\\u001b[34mLinks\\u001b[39m\\u001b[22m and A \\u001b[4m\\u001b[34mlink\\u001b[39m\\u001b[24m and \\u001b[33mcode span\\u001b[39m inline', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('r', fixtureR, { markdown: true });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText).toContain('\u001b[1m\u001b[34mLinks\u001b[39m\u001b[22m');
      expect(frameText).toContain(
        'A \u001b[4m\u001b[34mlink\u001b[39m\u001b[24m and \u001b[33mcode span\u001b[39m inline',
      );
    } finally {
      restore();
    }
  });

  it('2: WHEN fixture C "Title\\n\\n- [ ] see [docs](https://d.io) now\\n- [x] ok `c`" (markdown, rendered, chalk forced) renders THEN the frame contains \\u001b[2m☐\\u001b[22m see \\u001b[4m\\u001b[34mdocs\\u001b[39m\\u001b[24m now and \\u001b[32m☑\\u001b[39m ok \\u001b[33mc\\u001b[39m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('c', fixtureC, { markdown: true });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText).toContain(
        '\u001b[2m☐\u001b[22m see \u001b[4m\u001b[34mdocs\u001b[39m\u001b[24m now',
      );
      expect(frameText).toContain(
        '\u001b[32m☑\u001b[39m ok \u001b[33mc\u001b[39m',
      );
    } finally {
      restore();
    }
  });

  it('3: WHEN fixture W "Title\\n\\naaaa bbbb cccc [dddd eeee ffff](https://x.io) gggg" (markdown, rendered, chalk forced) renders at width 40 height 10 THEN the frame contains cccc \\u001b[4m\\u001b[34mdddd\\u001b[39m\\u001b[24m and \\u001b[4m\\u001b[34meeee ffff\\u001b[39m\\u001b[24m gggg', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('w', fixtureW, { markdown: true });
      const { lastFrame } = render(
        <Preview note={note} width={40} height={10} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText).toContain('cccc \u001b[4m\u001b[34mdddd\u001b[39m\u001b[24m');
      expect(frameText).toContain('\u001b[4m\u001b[34meeee ffff\u001b[39m\u001b[24m gggg');
    } finally {
      restore();
    }
  });

  it('4: WHEN fixture R renders with chalk NOT forced, rendered and with rendered={false} THEN the frames contain A link and code span inline and [link](https://example.com) respectively, with no \\u001b[', async () => {
    const note = makeNote('r', fixtureR, { markdown: true });
    const { lastFrame: lastFrameRendered } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frameRendered = lastFrameRendered() ?? '';
    expect(lines(frameRendered).join('\n')).toContain('A link and code span inline');
    expect(frameRendered).not.toContain('\u001b[');

    const { lastFrame: lastFrameRaw } = render(
      <Preview note={note} width={80} height={24} rendered={false} />,
    );
    await delay(50);
    const frameRaw = lastFrameRaw() ?? '';
    expect(lines(frameRaw).join('\n')).toContain('[link](https://example.com)');
    expect(frameRaw).not.toContain('\u001b[');
  });

  it('5: WHEN the plain (non-markdown) note "Pinned note\\nThis is pinned content" renders with chalk forced (rendered) THEN Pinned note occurs exactly 1 time and the frame contains This is pinned content', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('p', 'Pinned note\nThis is pinned content');
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText.split('Pinned note').length - 1).toBe(1);
      expect(frameText).toContain('This is pinned content');
    } finally {
      restore();
    }
  });

  it('6: WHEN src/tui/Preview.tsx is read THEN it has under 300 lines, contains md-row, has wrapLines( exactly 1 time, wrap="truncate" exactly 1 time, <PaneHeading exactly 2 times and no remove-markdown', () => {
    const source = readFileSync(
      new URL('../../src/tui/Preview.tsx', import.meta.url),
      'utf-8'
    );
    expect(source.split('\n').length).toBeLessThan(300);
    expect(source).toContain('md-row');
    expect((source.match(/wrapLines\(/g) || []).length).toBe(1);
    expect((source.match(/wrap="truncate"/g) || []).length).toBe(1);
    expect((source.match(/<PaneHeading/g) || []).length).toBe(2);
    expect(source).not.toContain('remove-markdown');
  });
});
