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

describe('Preview markdown heading color', () => {
  it('1: WHEN the content is "Grocery Notes\\n\\n# Produce\\n## Dairy" (markdown, rendered, chalk forced) THEN the frame contains \\u001b[1m\\u001b[34mProduce\\u001b[39m\\u001b[22m and \\u001b[1m\\u001b[34mDairy\\u001b[39m\\u001b[22m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('g', 'Grocery Notes\n\n# Produce\n## Dairy', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText).toContain('\u001b[1m\u001b[34mProduce\u001b[39m\u001b[22m');
      expect(frameText).toContain('\u001b[1m\u001b[34mDairy\u001b[39m\u001b[22m');
    } finally {
      restore();
    }
  });

  it('2: WHEN the same content renders with chalk NOT forced THEN the frame contains Produce and Dairy, does not contain \\u001b[, and Grocery Notes occurs exactly 1 time', async () => {
    const note = makeNote('g', 'Grocery Notes\n\n# Produce\n## Dairy', {
      markdown: true,
    });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameText = lines(frame).join('\n');
    expect(frameText).toContain('Produce');
    expect(frameText).toContain('Dairy');
    expect(frame).not.toContain('\u001b[');
    expect(frameText.split('Grocery Notes').length - 1).toBe(1);
  });

  it('3: WHEN a plain (non-markdown) note "Wrap note\\nbody line" renders with chalk forced THEN the frame does not contain \\u001b[34mbody', async () => {
    const { restore } = await forceInkChalk();
    try {
      const note = makeNote('p', 'Wrap note\nbody line');
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frameText = lines(lastFrame()).join('\n');
      expect(frameText).not.toContain('\u001b[34mbody');
    } finally {
      restore();
    }
  });

  it('4: WHEN src/tui/Preview.tsx is read THEN split("\\n").length is less than 300', () => {
    const src = readFileSync('src/tui/Preview.tsx', 'utf8');
    expect(src.split('\n').length).toBeLessThan(300);
  });
});
