/**
 * Help cuts a long description with an ellipsis instead of a hard cut,
 * and never cuts a key name (T517).
 * The brief lists four Acceptance lines; one `it()` per line.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { keymap } from '../../src/core/keymap';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

function frameAt(w: number, h: number): string {
  const { lastFrame, unmount } = render(<Help width={w} height={h} editor="nvim" />);
  const f = stripAnsi(lastFrame() ?? '');
  unmount();
  expect(f).not.toBe('');
  const lines = f.split('\n');
  expect(lines.length).toBeLessThanOrEqual(h);
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(w);
  return f;
}

describe('help cut', () => {
  it('1: WHEN Help renders at 70x35 THEN the frame contains `Toggle rendered mark…`, `Move tag down (tags …` and `Show this help`, and not `Toggle rendered markd`', () => {
    const frame = frameAt(70, 35);
    expect(frame).toContain('Toggle rendered mark…');
    expect(frame).toContain('Move tag down (tags …');
    expect(frame).toContain('Show this help');
    expect(frame).not.toContain('Toggle rendered markd');
  });

  it('2: WHEN Help renders at 80x24 THEN the frame contains `Toggle rendered markdown pr…` and `Edit inline (built-in edito…` and not `markdown pre /`', () => {
    const frame = frameAt(80, 24);
    expect(frame).toContain('Toggle rendered markdown pr…');
    expect(frame).toContain('Edit inline (built-in edito…');
    expect(frame).not.toContain('markdown pre /');
  });

  it('3: WHEN Help renders at 60x40 THEN the frame contains `Toggle rendered…` and `Close overlay /…` and each of the 36 keymap entries shows its key padded to 8 followed by two spaces', () => {
    const frame = frameAt(60, 40);
    expect(frame).toContain('Toggle rendered…');
    expect(frame).toContain('Close overlay /…');
    expect(keymap.length).toBe(36);
    for (const e of keymap) {
      expect(frame, e.action).toContain(e.key.padEnd(8) + '  ');
    }
  });

  it('4: WHEN Help renders at 99x40 and at 100x40 THEN each frame contains all 36 entries whole (key padded to 8, two spaces, full description) and does not contain `…`', () => {
    for (const [w, h] of [[99, 40], [100, 40]] as const) {
      const frame = frameAt(w, h);
      expect(frame).not.toContain('…');
      for (const e of keymap) {
        expect(frame, e.action).toContain(e.key.padEnd(8) + '  ' + e.description);
      }
    }
  });
});
