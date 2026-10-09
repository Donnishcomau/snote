/**
 * Help sectioned layout fits its frame at widths 50-99, heights 30 and up (T460).
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { SECTIONS } from '../../src/core/help-sections';
import { keymap } from '../../src/core/keymap';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

function frameAt(w: number, h: number): string {
  const { lastFrame, unmount } = render(<Help width={w} height={h} editor="nvim" />);
  const f = stripAnsi(lastFrame() ?? '');
  unmount();
  return f;
}

function expectFit(w: number, h: number): string {
  const frame = frameAt(w, h);
  const lines = frame.split('\n');
  expect(lines.length).toBeLessThanOrEqual(h);
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(w);
  const trimmed = lines.map((l) => l.replace(/│/g, '').trim());
  for (const sec of SECTIONS) expect(trimmed).toContain(sec.name);
  for (const e of keymap) {
    expect(frame).toContain(e.key.padEnd(8) + '  ' + e.description.slice(0, 4));
  }
  return frame;
}

describe('help fit', () => {
  it('1: WHEN Help renders at 60x30 THEN FIT(60, 30) holds and no line contains `JTrash`', () => {
    const frame = expectFit(60, 30);
    expect(frame.split('\n').some((l) => l.includes('JTrash'))).toBe(false);
  });

  it('2: WHEN Help renders at 80x30 THEN FIT(80, 30) holds and the frame contains `Editing: Esc then :wq to save and return`', () => {
    const frame = expectFit(80, 30);
    expect(frame).toContain('Editing: Esc then :wq to save and return');
  });

  it('3: WHEN Help renders at 50x34 THEN FIT(50, 34) holds', () => {
    expect(expectFit(50, 34)).not.toBe('');
  });

  it('4: WHEN Help renders at 90x40 THEN FIT(90, 40) holds', () => {
    expect(expectFit(90, 40)).not.toBe('');
  });

  it('5: WHEN Help renders at 70x44 THEN FIT(70, 44) holds', () => {
    expect(expectFit(70, 44)).not.toBe('');
  });

  it('6: WHEN Help renders at 99x30 THEN FIT(99, 30) holds and the frame contains `Found a bug?`', () => {
    const frame = expectFit(99, 30);
    expect(frame).toContain('Found a bug?');
  });
});
