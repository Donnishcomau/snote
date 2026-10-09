// T398: MdRowText colours a checklist glyph and the link/code spans of one
// preview row. Frames are measured with ink's bundled chalk forced to level 3
// (the preview-markdown-style recipe), except line 6 which runs unpinned.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import { Text } from 'ink';
import { MdRowText } from '../../src/tui/md-row';
import type { InlineSpan } from '../../src/core/md-inline';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Portable way to force ink's bundled chalk to emit ANSI (same recipe as
 * preview-markdown-style.test.tsx:19-34).
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

async function frameOf(text: string, spans: InlineSpan[]): Promise<string> {
  const { lastFrame } = render(<Text><MdRowText text={text} spans={spans} /></Text>);
  await delay(50);
  return lastFrame() ?? '';
}

const S: InlineSpan[] = [
  { start: 2, end: 6, kind: 'link' },
  { start: 11, end: 20, kind: 'code' },
];

describe('md-row (T398)', () => {
  it('1: WHEN text is \u2610 see docs now and spans is [{ start: 6, end: 10, kind: \'link\' }] THEN frame is exactly  \\u001b[2m\u2610\\u001b[22m see \\u001b[4m\\u001b[34mdocs\\u001b[39m\\u001b[24m now', async () => {
    const { restore } = await forceInkChalk();
    try {
      const frame = await frameOf('\u2610 see docs now', [
        { start: 6, end: 10, kind: 'link' },
      ]);
      expect(frame).toBe(' \u001b[2m\u2610\u001b[22m see \u001b[4m\u001b[34mdocs\u001b[39m\u001b[24m now');
    } finally {
      restore();
    }
  });

  it('2: WHEN text is \u2611 ok c and spans is [{ start: 5, end: 6, kind: \'code\' }] THEN frame is exactly  \\u001b[32m\u2611\\u001b[39m ok \\u001b[33mc\\u001b[39m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const frame = await frameOf('\u2611 ok c', [
        { start: 5, end: 6, kind: 'code' },
      ]);
      expect(frame).toBe(' \u001b[32m\u2611\u001b[39m ok \u001b[33mc\u001b[39m');
    } finally {
      restore();
    }
  });

  it('3: WHEN text is \u2610 milk and spans is [] THEN frame is exactly  \\u001b[2m\u2610\\u001b[22m milk', async () => {
    const { restore } = await forceInkChalk();
    try {
      const frame = await frameOf('\u2610 milk', []);
      expect(frame).toBe(' \u001b[2m\u2610\u001b[22m milk');
    } finally {
      restore();
    }
  });

  it('4: WHEN text is A link and code span inline and spans is S THEN frame is exactly A \\u001b[4m\\u001b[34mlink\\u001b[39m\\u001b[24m and \\u001b[33mcode span\\u001b[39m inline', async () => {
    const { restore } = await forceInkChalk();
    try {
      const frame = await frameOf('A link and code span inline', S);
      expect(frame).toBe(
        'A \u001b[4m\u001b[34mlink\u001b[39m\u001b[24m and \u001b[33mcode span\u001b[39m inline',
      );
    } finally {
      restore();
    }
  });

  it('5: WHEN text is \u2022 a tool here with a code span and separately text is hello with spans [] THEN the frames are exactly \u2022 a \\u001b[33mtool\\u001b[39m here and hello', async () => {
    const { restore } = await forceInkChalk();
    try {
      const bullet = await frameOf('\u2022 a tool here', [
        { start: 4, end: 8, kind: 'code' },
      ]);
      const plain = await frameOf('hello', []);
      expect(bullet).toBe('\u2022 a \u001b[33mtool\u001b[39m here');
      expect(plain).toBe('hello');
    } finally {
      restore();
    }
  });

  it('6: WHEN text is \u2610 milk with spans [] and chalk is NOT forced THEN frame is exactly  \u2610 milk and does not contain \\u001b[', async () => {
    const frame = await frameOf('\u2610 milk', []);
    expect(frame).toBe(' \u2610 milk');
    expect(frame).not.toContain('\u001b[');
  });
});
