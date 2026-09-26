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

describe('Preview rendered markdown', () => {
  it('1: WHEN makeNote(\'h\', \'# Groceries\\n\\nBuy **milk** and eggs\', { markdown: true }) is rendered with width={80} height={24} rendered={true} THEN the frame contains \'Groceries\' and \'milk\' and does not contain \'<h1>\', \'<p>\', or \'<strong>\'.', async () => {
    const note = makeNote('h', '# Groceries\n\nBuy **milk** and eggs', { markdown: true });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('Groceries');
    expect(frameText).toContain('milk');
    expect(frameText).not.toContain('<h1>');
    expect(frameText).not.toContain('<p>');
    expect(frameText).not.toContain('<strong>');
  });

  it('2: WHEN makeNote(\'c\', \'Shopping list\\n- [ ] milk\\n- [x] bread\\n- [ ] coffee beans\', { markdown: true }) is rendered with width={80} height={24} rendered={true} THEN the frame contains \'Shopping list\' and \'milk\' and does not contain \'<ul>\', \'<li>\', or \'<input\'.', async () => {
    const note = makeNote('c', 'Shopping list\n- [ ] milk\n- [x] bread\n- [ ] coffee beans', { markdown: true });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('Shopping list');
    expect(frameText).toContain('milk');
    expect(frameText).not.toContain('<ul>');
    expect(frameText).not.toContain('<li>');
    expect(frameText).not.toContain('<input');
  });

  it('3: WHEN the note from line 1 is rendered with rendered={false} THEN the frame contains the raw \'# Groceries\' and \'**milk**\' unchanged.', async () => {
    const note = makeNote('h', '# Groceries\n\nBuy **milk** and eggs', { markdown: true });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={false} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('# Groceries');
    expect(frameText).toContain('**milk**');
  });

  it('4: WHEN the note from line 2 is rendered with rendered={false} THEN the frame contains the raw \'- [ ] milk\' and \'- [x] bread\' unchanged.', async () => {
    const note = makeNote('c', 'Shopping list\n- [ ] milk\n- [x] bread\n- [ ] coffee beans', { markdown: true });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={24} rendered={false} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('- [ ] milk');
    expect(frameText).toContain('- [x] bread');
  });
});
