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

describe('Preview title dedupe', () => {
  it('1: WHEN makeNote(\'a\', \'Duplicate title note\\nActual body line\') is rendered THEN the first 3 frame lines are exactly \'│Preview: Duplicate title note\', \'│g add tag\', \'│Actual body line\'', async () => {
    const note = makeNote('a', 'Duplicate title note\nActual body line');
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[0]).toBe('│Preview: Duplicate title note');
    expect(frameLines[1]).toBe('│g add tag');
    expect(frameLines[2]).toBe('│Actual body line');
  });

  it('2: WHEN makeNote(\'b\', \'Title only note\') is rendered THEN the first 3 frame lines are exactly \'│Preview: Title only note\', \'│g add tag\', \'│\'', async () => {
    const note = makeNote('b', 'Title only note');
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[0]).toBe('│Preview: Title only note');
    expect(frameLines[1]).toBe('│g add tag');
    expect(frameLines[2]).toBe('│');
  });

  it('3: WHEN makeNote(\'c\', \'Tagged dup note\\nbody text\', { tags: [\'home\'] }) is rendered THEN the first 4 frame lines are exactly \'│Preview: Tagged dup note\', \'│#home\', \'│g add tag\', \'│body text\'', async () => {
    const note = makeNote('c', 'Tagged dup note\nbody text', { tags: ['home'] });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[0]).toBe('│Preview: Tagged dup note');
    expect(frameLines[1]).toBe('│#home');
    expect(frameLines[2]).toBe('│g add tag');
    expect(frameLines[3]).toBe('│body text');
  });

  it('4: WHEN makeNote(\'d\', \'Cursor note\\n- [ ] first\\n- [x] second\') is rendered with cursorLine={1} focused={true} THEN the frame contains \'│ Cursor note\' and \'│>- [ ] first\' (the title line is not skipped while a checklist cursor is shown)', async () => {
    const note = makeNote('d', 'Cursor note\n- [ ] first\n- [x] second');
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} cursorLine={1} focused={true} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('│ Cursor note');
    expect(frameText).toContain('│>- [ ] first');
  });
});
