/**
 * Help falls back to the scrolling list when columns would be too narrow (T522).
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

function frameAt(w: number, h: number): string {
  const { lastFrame, unmount } = render(<Help width={w} height={h} editor="nvim" />);
  const f = stripAnsi(lastFrame() ?? '');
  unmount();
  return f;
}

function fits(frame: string, w: number, h: number): void {
  const lines = frame.split('\n');
  expect(lines.length).toBeLessThanOrEqual(h);
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(w);
}

describe('help fallback', () => {
  it('1: WHEN Help renders at 50x30 and at 60x30 THEN each frame contains `1-27/45 j/k scroll` and `v         Toggle rendered markdown preview`', () => {
    for (const [w, h] of [[50, 30], [60, 30]] as const) {
      const frame = frameAt(w, h);
      fits(frame, w, h);
      expect(frame).toContain('1-27/45 j/k scroll');
      expect(frame).toContain('v         Toggle rendered markdown preview');
    }
  });

  it('2: WHEN Help renders at 50x34 THEN the frame contains `1-31/45 j/k scroll` and `Escape    Close overlay / back`', () => {
    const frame = frameAt(50, 34);
    fits(frame, 50, 34);
    expect(frame).toContain('1-31/45 j/k scroll');
    expect(frame).toContain('Escape    Close overlay / back');
  });

  it('3: WHEN Help renders at 55x31, 65x32, 75x30, 79x30 and 60x40 THEN each frame contains `Sync & Sort` and `Found a bug?` and not `j/k scroll`', () => {
    for (const [w, h] of [[55, 31], [65, 32], [75, 30], [79, 30], [60, 40]] as const) {
      const frame = frameAt(w, h);
      fits(frame, w, h);
      expect(frame).toContain('Sync & Sort');
      expect(frame).toContain('Found a bug?');
      expect(frame).not.toContain('j/k scroll');
    }
  });

  it('4: WHEN Help renders at 50x50 THEN the frame contains `D         Delete forever (trash view)` and `Found a bug?` and not `j/k scroll`', () => {
    const frame = frameAt(50, 50);
    fits(frame, 50, 50);
    expect(frame).toContain('D         Delete forever (trash view)');
    expect(frame).toContain('Found a bug?');
    expect(frame).not.toContain('j/k scroll');
  });
});
