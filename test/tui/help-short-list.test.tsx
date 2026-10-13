/**
 * Help at 50-79 wide and under 30 high shows the scrolling list again,
 * with j/k scrolling it (T524, correcting T522).
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import { Help } from '../../src/tui/Help';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('help short list', () => {
  it('1: WHEN Help renders at 60x20 THEN the frame contains `1-17/45 j/k scroll`, and after `j` is written it contains `2-18/45 j/k scroll`', async () => {
    const { lastFrame, stdin, unmount } = render(<Help width={60} height={20} editor="nvim" />);
    try {
      await waitForInput(stdin);
      const first = await waitForFrame(() => stripAnsi(lastFrame() ?? ''), '1-17/45 j/k scroll');
      expect(first).toContain('1-17/45 j/k scroll');
      stdin.write('j');
      const after = await waitForFrame(() => stripAnsi(lastFrame() ?? ''), '2-18/45 j/k scroll');
      expect(after).toContain('2-18/45 j/k scroll');
    } finally {
      unmount();
    }
  });

  it('2: WHEN Help renders at 79x29 THEN the frame contains `1-26/45 j/k scroll`, and after `j` is written it contains `2-27/45 j/k scroll`', async () => {
    const { lastFrame, stdin, unmount } = render(<Help width={79} height={29} editor="nvim" />);
    try {
      await waitForInput(stdin);
      const first = await waitForFrame(() => stripAnsi(lastFrame() ?? ''), '1-26/45 j/k scroll');
      expect(first).toContain('1-26/45 j/k scroll');
      stdin.write('j');
      const after = await waitForFrame(() => stripAnsi(lastFrame() ?? ''), '2-27/45 j/k scroll');
      expect(after).toContain('2-27/45 j/k scroll');
    } finally {
      unmount();
    }
  });

  it('3: WHEN Help renders at 60x40 THEN the frame contains `Sync & Sort` and `Found a bug?` and not `j/k scroll`', async () => {
    const { lastFrame, unmount } = render(<Help width={60} height={40} editor="nvim" />);
    try {
      const frame = await waitForFrame(
        () => stripAnsi(lastFrame() ?? ''),
        (f) => f.includes('Sync & Sort') && f.includes('Found a bug?'),
      );
      expect(frame).toContain('Sync & Sort');
      expect(frame).toContain('Found a bug?');
      expect(frame).not.toContain('j/k scroll');
    } finally {
      unmount();
    }
  });
});
