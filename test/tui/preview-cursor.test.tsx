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

const G = 'Groceries\n- [ ] milk\n- [x] bread\n' +
  Array.from({ length: 20 }, (_, i) => `filler ${(i + 1).toString().padStart(2, '0')}`).join('\n') +
  '\n- [ ] last task';

describe('Preview cursor', () => {
  it('1: WHEN G is rendered with height=12 and cursorLine=1 THEN the frame contains "│>- [ ] milk", "│ - [x] bread" and "│ Groceries", and exactly 1 frame line contains ">"', async () => {
    const note = makeNote('c1', G);
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} cursorLine={1} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('│>- [ ] milk');
    expect(frameText).toContain('│ - [x] bread');
    expect(frameText).toContain('│ Groceries');
    const greaterLines = frameLines.filter(l => l.includes('>'));
    expect(greaterLines.length).toBe(1);
  });

  it('2: WHEN G is rendered with height=12 and cursorLine=23 THEN the frame contains "│>- [ ] last task" and "filler 20", and does not contain "milk" (the pane scrolled)', async () => {
    const note = makeNote('c2', G);
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} cursorLine={23} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('│>- [ ] last task');
    expect(frameText).toContain('filler 20');
    expect(frameText).not.toContain('milk');
  });

  it('3: WHEN G is rendered with cursorLine=null and again without the prop THEN both frames are equal, contain "│- [ ] milk" and contain no ">"', async () => {
    const note = makeNote('c3', G);
    const { lastFrame: lastFrame1 } = render(
      <Preview note={note} width={80} height={12} cursorLine={null} />
    );
    await delay(50);
    const frame1 = lastFrame1() ?? '';

    const { lastFrame: lastFrame2 } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame2 = lastFrame2() ?? '';

    expect(frame1).toEqual(frame2);
    const frame1Str = lines(frame1).join('\n');
    expect(frame1Str).toContain('│- [ ] milk');
    expect(frame1Str).not.toContain('>');
  });

  it('4: WHEN a markdown note "# Title\\n- [ ] task" is rendered with rendered and cursorLine=1 THEN the frame contains "│>- [ ] task" and "# Title" (raw text while the cursor is shown)', async () => {
    const note = makeNote('c4', '# Title\n- [ ] task', { markdown: true });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} rendered cursorLine={1} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('│>- [ ] task');
    expect(frameText).toContain('# Title');
  });

  it('5: WHEN src/tui/Preview.tsx is read THEN it contains "inverse={focused}" exactly 1 time and "wrapLines(" at most 2 times', async () => {
    const source = readFileSync(
      new URL('../../src/tui/Preview.tsx', import.meta.url),
      'utf-8'
    );
    const inverseCount = (source.match(/inverse={focused}/g) || []).length;
    const wrapLinesCount = (source.match(/wrapLines\(/g) || []).length;
    expect(inverseCount).toBe(1);
    expect(wrapLinesCount).toBeLessThanOrEqual(2);
  });
});
