/**
 * Help never overlaps at small sizes: a one-column scrolling list (T465).
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { keymap } from '../../src/core/keymap';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

function fits(frame: string, w: number, h: number): void {
  const lines = frame.split('\n');
  expect(lines.length).toBeLessThanOrEqual(h);
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(w);
}

function frameAt(w: number, h: number): string {
  const { lastFrame, unmount } = render(<Help width={w} height={h} editor="nvim" />);
  const f = stripAnsi(lastFrame() ?? '');
  unmount();
  return f;
}

describe('help small', () => {
  it('1: WHEN `<Help width={20} height={7} editor="nvim" />` renders THEN the frame has at most `7` lines, none over `20` characters, and contains `1-4/45 j/k scroll`', () => {
    const frame = frameAt(20, 7);
    fits(frame, 20, 7);
    expect(frame).toContain('1-4/45 j/k scroll');
  });

  it('2: WHEN Help renders at 100x24 THEN the frame has at most `24` lines, none over `100`, and does not contain `j/k scroll` (the narrow list fits)', () => {
    const frame = frameAt(100, 24);
    fits(frame, 100, 24);
    expect(frame.length).toBeGreaterThan(0);
    expect(frame).not.toContain('j/k scroll');
  });

  it('3: WHEN Help renders at 40x30 THEN the frame has at most `30` lines, none over `40`, and contains `j         Move down`', () => {
    const frame = frameAt(40, 30);
    fits(frame, 40, 30);
    expect(frame).toContain('j         Move down');
  });

  it('4: WHEN `j` is written 50 times to Help at 20x7 THEN, collecting every frame, every keymap entry\'s key starts some line', async () => {
    const { stdin, frames, lastFrame, unmount } = render(<Help width={20} height={7} editor="nvim" />);
    await waitForInput(stdin);
    for (let i = 1; i <= 50; i++) {
      stdin.write('j');
      const top = Math.min(i, 41);
      await waitForFrame(lastFrame, `${top + 1}-${top + 4}/45`);
    }
    const lines = frames.map(stripAnsi).flatMap((f) => f.split('\n')).map((l) => l.replace(/[│┌┐└┘─]/g, '').trim());
    expect(keymap.length).toBeGreaterThan(0);
    for (const e of keymap) {
      expect(lines.some((l) => l.startsWith(e.key.trim()))).toBe(true);
    }
    unmount();
  });

  it('5: WHEN App at 30x12 opens Help with `?` and `j` is written 60 times THEN within 1 s the frame contains `Editing:` and `/45 j/k`; after 60 `k` it contains `Help - Keyboard`; Escape closes it', async () => {
    const store = makeStore({ stubClient: {} });
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={30} height={12} />,
    );
    await waitForInput(stdin);
    stdin.write('?');
    await waitForFrame(lastFrame, 'j/k scroll');
    for (let i = 0; i < 60; i++) stdin.write('j');
    await waitForFrame(lastFrame, (f) => f.includes('Editing:') && f.includes('/45 j/k'), 1000);
    for (let i = 0; i < 60; i++) stdin.write('k');
    await waitForFrame(lastFrame, (f) => f.includes('Help - Keyboard') && f.includes('1-'), 1000);
    stdin.write('\u001b');
    await waitForFrame(lastFrame, (f) => !f.includes('Help - Keyboard'));
    expect(lastFrame()).not.toContain('j/k scroll');
    unmount();
  });

  it('6: WHEN Help renders at 120x30 THEN the frame contains `Navigate` and `Trash` and not `j/k scroll`', () => {
    const frame = frameAt(120, 30);
    expect(frame).toContain('Navigate');
    expect(frame).toContain('Trash');
    expect(frame).not.toContain('j/k scroll');
  });
});
