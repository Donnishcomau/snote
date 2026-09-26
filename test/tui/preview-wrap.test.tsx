import { readFileSync } from 'node:fs';
import { render } from 'ink-testing-library';
import React from 'react';

import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const fox = 'The quick brown fox jumps over the lazy dog and keeps running far away';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lines = (frame: string | string[][] | undefined): string[] => {
  if (!frame) return [];
  if (typeof frame === 'string') return frame.split('\n');
  return frame.map(row => stripAnsi(Array.isArray(row) ? row.join('') : row));
};

describe('Preview wrap', () => {
  it('1: WHEN the note "Wrap note\\n" + fox is rendered THEN the first 4 frame lines are exactly "│Preview: Wrap note", "│", "│The quick brown fox jumps over the lazy dog and", "│keeps running far away"', async () => {
    const note = makeNote('w', 'Wrap note\n' + fox);
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[0]).toBe('│Preview: Wrap note');
    expect(frameLines[1]).toBe('│g add tag');
    expect(frameLines[2]).toBe('│The quick brown fox jumps over the lazy dog and');
    expect(frameLines[3]).toBe('│keeps running far away');
  });

  it('2: WHEN a note with 30 lines row 01 to row 30 is rendered at height 12 THEN the frame contains "row 09" and not "row 10", and has at most 10 lines', async () => {
    const content = Array.from({ length: 30 }, (_, i) => `row ${(i + 1).toString().padStart(2, '0')}`).join('\n');
    const note = makeNote('w2', content);
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('row 09');
    expect(frameText).not.toContain('row 10');
    expect(frameLines.length).toBeLessThanOrEqual(10);
  });

  it('3: WHEN the note "Gap note\\n\\nafter the gap" is rendered THEN frame line 3 (1-based) is "│" and line 4 (1-based) is "│after the gap"', async () => {
    const note = makeNote('w3', 'Gap note\n\nafter the gap');
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[2]).toBe('│');
    expect(frameLines[3]).toBe('│after the gap');
  });

  it('4: WHEN note={null} is rendered THEN the frame contains "Select a note to preview" and "Preview"', async () => {
    const { lastFrame } = render(
      <Preview note={null} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('Select a note to preview');
    expect(frameText).toContain('Preview');
  });

  it('5: WHEN src/tui/Preview.tsx is read THEN it contains "wrapLines(" exactly 1 time', async () => {
    const source = readFileSync(
      new URL('../../src/tui/Preview.tsx', import.meta.url),
      'utf-8'
    );
    const matches = (source.match(/wrapLines\(/g) || []).length;
    expect(matches).toBe(1);
  });

  it('6: WHEN src/tui/Preview.tsx is read THEN it contains ".." 0 times and "wrap=\\"truncate\\"" exactly 1 time', async () => {
    const source = readFileSync(
      new URL('../../src/tui/Preview.tsx', import.meta.url),
      'utf-8'
    );
    const dotdotCount = (source.match(/'\.\.'/g) || []).length;
    const truncateCount = (source.match(/wrap="truncate"/g) || []).length;
    expect(dotdotCount).toBe(0);
    expect(truncateCount).toBe(1);
  });
});
