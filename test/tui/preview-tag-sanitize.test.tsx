import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';

import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Preview tag sanitize', () => {
  it('1: WHEN <Preview> renders a note whose tags are [\'a\\u001b]8;;http://evil\\u0007x\\u001b]8;;\\u0007\'] THEN the frame contains #ax and contains no \\u001b', async () => {
    const note = makeNote('s1', 'Dirty note\ncontent', {
      tags: ['a\u001b]8;;http://evil\u0007x\u001b]8;;\u0007'],
    });
    const { lastFrame } = render(<Preview note={note} width={80} height={12} />);
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('#ax');
    expect(frame).not.toContain('\u001b');
  });

  it('2: WHEN <Preview> renders a note whose tags are [\'work\', \'ideas\'] THEN the frame contains #work #ideas', async () => {
    const note = makeNote('s2', 'Clean note\ncontent', {
      tags: ['work', 'ideas'],
    });
    const { lastFrame } = render(<Preview note={note} width={80} height={12} />);
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('#work #ideas');
  });

  it('3: WHEN src/tui/Preview.tsx is read as text THEN the line that defines shownTags contains sanitizeForTerminal', () => {
    const src = readFileSync(resolve(__dirname, '../../src/tui/Preview.tsx'), 'utf8');
    const shownTagsLine = src.split('\n').find((l) => l.includes('const shownTags'));
    expect(shownTagsLine).toBeDefined();
    expect(shownTagsLine).toContain('sanitizeForTerminal');
  });
});
