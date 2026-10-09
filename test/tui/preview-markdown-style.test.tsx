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

describe('Preview markdown style', () => {
  it('1: WHEN makeNote("g", "Grocery Notes\\n\\n# Produce\\n## Dairy\\n### Bakery", { markdown: true }) is rendered with rendered={true} (chalk forced) THEN the frame contains Produce, Dairy, Bakery, contains the exact \\u001b[1m\\u001b[34mProduce\\u001b[39m\\u001b[22m, and does not contain # Produce, ## Dairy, or ### Bakery', async () => {
    const { restore, inkChalk } = await forceInkChalk();
    try {
      const note = makeNote('g', 'Grocery Notes\n\n# Produce\n## Dairy\n### Bakery', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      const frameLines = lines(frame);
      const frameText = frameLines.join('\n');
      expect(frameText).toContain('Produce');
      expect(frameText).toContain('Dairy');
      expect(frameText).toContain('Bakery');
       expect(frameText).toContain('\u001b[1m\u001b[34mProduce\u001b[39m\u001b[22m');
      expect(frameText).not.toContain('# Produce');
      expect(frameText).not.toContain('## Dairy');
      expect(frameText).not.toContain('### Bakery');
    } finally {
      restore();
    }
  });

  it('2: WHEN makeNote("s", "Shopping Trip\\n\\n- Apples\\n- Bananas", { markdown: true }) is rendered with rendered={true} THEN the frame contains • Apples and • Bananas, and does not contain - Apples or - Bananas', async () => {
    const note = makeNote('s', 'Shopping Trip\n\n- Apples\n- Bananas', {
      markdown: true,
    });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameText = lines(frame).join('\n');
    expect(frameText).toContain('• Apples');
    expect(frameText).toContain('• Bananas');
    expect(frameText).not.toContain('- Apples');
    expect(frameText).not.toContain('- Bananas');
  });

  it('3: WHEN makeNote("c", "Shopping List\\n\\n- [ ] milk\\n- [x] bread", { markdown: true }) is rendered with rendered={true} THEN the frame contains ☐ milk and ☑ bread, and does not contain [ ] milk or [x] bread', async () => {
    const note = makeNote('c', 'Shopping List\n\n- [ ] milk\n- [x] bread', {
      markdown: true,
    });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameText = lines(frame).join('\n');
    expect(frameText).toContain('☐ milk');
    expect(frameText).toContain('☑ bread');
    expect(frameText).not.toContain('[ ] milk');
    expect(frameText).not.toContain('[x] bread');
  });

  it('4: WHEN makeNote("e", "Notes Page\\n\\nSome **bold** and _italic_ words", { markdown: true }) is rendered with rendered={true} (chalk forced) THEN the frame contains Some bold and italic words, does not contain **bold** or _italic_, and does not contain \\u001b[1mbold\\u001b[22m (only heading lines are bold)', async () => {
    const { restore, inkChalk } = await forceInkChalk();
    try {
      const note = makeNote('e', 'Notes Page\n\nSome **bold** and _italic_ words', {
        markdown: true,
      });
      const { lastFrame } = render(
        <Preview note={note} width={80} height={24} rendered={true} />,
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      const frameText = lines(frame).join('\n');
      expect(frameText).toContain('Some bold and italic words');
      expect(frameText).not.toContain('**bold**');
      expect(frameText).not.toContain('_italic_');
      expect(frameText).not.toContain('\u001b[1mbold\u001b[22m');
    } finally {
      restore();
    }
  });

  it('5: WHEN makeNote("l", "Reference Page\\n\\nA [link](https://example.com) and `code span` inline", { markdown: true }) is rendered with rendered={true} THEN the frame contains A link and code span inline, and does not contain [link], (https://example.com), or a backtick', async () => {
    const note = makeNote(
      'l',
      'Reference Page\n\nA [link](https://example.com) and `code span` inline',
      {
        markdown: true,
      },
    );
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameText = lines(frame).join('\n');
    expect(frameText).toContain('A link and code span inline');
    expect(frameText).not.toContain('[link]');
    expect(frameText).not.toContain('(https://example.com)');
    expect(frameText).not.toContain('`');
  });

  it('6: WHEN makeNote("p", "Recipe Card\\n\\nPlain instructions with nothing special\\n# Ingredients", { markdown: true }) is rendered once with rendered={true} and once with rendered={false} THEN the rendered={true} frame contains Plain instructions with nothing special unchanged and Ingredients but not # Ingredients, and the rendered={false} frame contains the raw # Ingredients unchanged', async () => {
    const note = makeNote(
      'p',
      'Recipe Card\n\nPlain instructions with nothing special\n# Ingredients',
      {
        markdown: true,
      },
    );

    const { lastFrame: lastFrameRendered } = render(
      <Preview note={note} width={80} height={24} rendered={true} />,
    );
    await delay(50);
    const frameRendered = lastFrameRendered() ?? '';
    const frameRenderedText = lines(frameRendered).join('\n');

    const { lastFrame: lastFrameRaw } = render(
      <Preview note={note} width={80} height={24} rendered={false} />,
    );
    await delay(50);
    const frameRaw = lastFrameRaw() ?? '';
    const frameRawText = lines(frameRaw).join('\n');

    expect(frameRenderedText).toContain('Plain instructions with nothing special');
    expect(frameRenderedText).toContain('Ingredients');
    expect(frameRenderedText).not.toContain('# Ingredients');
    expect(frameRawText).toContain('# Ingredients');
  });
});
