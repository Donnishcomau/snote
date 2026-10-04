import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
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

describe('Preview checklist color', () => {
  it('1: WHEN makeNote("c", "Shopping List\\n\\n- [ ] milk\\n- [x] bread", { markdown: true }) renders rendered={true}, chalk forced to level 3, THEN the frame contains the exact \\u001b[2m☐\\u001b[22m milk and the exact \\u001b[32m☑\\u001b[39m bread', async () => {
    const { restore, inkChalk } = await forceInkChalk();
    try {
      const note = makeNote('c', 'Shopping List\n\n- [ ] milk\n- [x] bread', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      console.log('RAW FRAME:', JSON.stringify(frame));
      expect(frame).toContain('\u001b[2m☐\u001b[22m milk');
      expect(frame).toContain('\u001b[32m☑\u001b[39m bread');
    } finally {
      restore();
    }
  });

  it('2: WHEN the same renders WITHOUT forcing chalk THEN the frame contains ☐ milk and ☑ bread unchanged, and no \\u001b[ escape appears in the frame', async () => {
    const note = makeNote('c', 'Shopping List\n\n- [ ] milk\n- [x] bread', {
      markdown: true,
    });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameText = stripAnsi(frame);
    expect(frameText).toContain('☐ milk');
    expect(frameText).toContain('☑ bread');
    expect(frame).not.toContain('\u001b[');
  });

  it('3: WHEN makeNote("s", "Shopping Trip\\n\\n- Apples", { markdown: true }) renders rendered={true}, chalk forced, THEN the frame contains • Apples and does not contain \\u001b[90m• or \\u001b[32m•', async () => {
    const { restore, inkChalk } = await forceInkChalk();
    try {
      const note = makeNote('s', 'Shopping Trip\n\n- Apples', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('• Apples');
      expect(frame).not.toContain('\u001b[90m•');
      expect(frame).not.toContain('\u001b[32m•');
    } finally {
      restore();
    }
  });

  it('4: WHEN makeNote("g", "Grocery Notes\\n\\n# Produce", { markdown: true }) renders rendered={true}, chalk forced, THEN the frame contains the exact \\u001b[1mProduce\\u001b[22m and the heading content does not contain \\u001b[90m or \\u001b[32m', async () => {
    const { restore, inkChalk } = await forceInkChalk();
    try {
      const note = makeNote('g', 'Grocery Notes\n\n# Produce', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('\u001b[1mProduce\u001b[22m');
      const frameLines = frame.split('\n');
      const headingLine = frameLines.find(l => l.includes('Produce'));
      expect(headingLine).toBeDefined();
      // Strip the divider (│) and its ANSI codes, then check the content
      const contentPart = (headingLine ?? '').replace(/\u001b\[[0-9;]*m/g, '').replace('│', '');
      // Restore only the bold code on the content part for checking
      const boldedContent = `\u001b[1m${contentPart}\u001b[22m`;
      expect(headingLine).toContain('\u001b[1mProduce\u001b[22m');
      // Ensure the heading text itself isn't gray or green — check that
      // the bold text contains "Produce" without being wrapped in gray/green
      const headingAnsiMatch = headingLine?.match(/\u001b\[1m(.+?)\u001b\[22m/);
      const headingContent = headingAnsiMatch?.[1] ?? '';
      expect(headingContent).toContain('Produce');
      expect(headingContent).not.toContain('\u001b[90m');
      expect(headingContent).not.toContain('\u001b[32m');
    } finally {
      restore();
    }
  });
});
