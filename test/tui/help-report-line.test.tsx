/**
 * Help overlay: report line added to footer (T248).
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { keymap } from '../../src/core/keymap';

const REPORT_LINE = 'Found a bug? Run snote --report to save a report bundle.';

const fake = Array.from({ length: 45 }, (_, i) => ({
  key: 'k' + i,
  action: 'a' + i,
  description: 'Desc ' + i,
}));

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Help report line (T248)', () => {
  it('1: WHEN <Help width={80} height={24} /> (real keymap) is rendered THEN lastFrame() contains Found a bug? Run snote --report to save a report bundle., has at most 24 lines, and still contains Move down and Search notes.', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={24} />
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain(REPORT_LINE);
    expect(lines.length).toBeLessThanOrEqual(24);
    expect(joined).toContain('Move down');
    expect(joined).toContain('Search notes');

    unmount();
  });

  it('2: WHEN <Help width={120} height={40} /> (real keymap) is rendered THEN lastFrame() contains Found a bug? Run snote --report to save a report bundle. and has at most 40 lines.', async () => {
    const { frames, unmount } = render(
      <Help width={120} height={40} />
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain(REPORT_LINE);
    expect(lines.length).toBeLessThanOrEqual(40);

    unmount();
  });

  it('3: (frame, boundary: columns full) WHEN <Help width={80} height={24} entries={fake} /> is rendered, fake being 45 entries { key: k+i, action: a+i, description: Desc +i } for i 0..44, THEN lastFrame() contains Found a bug? Run snote --report to save a report bundle., still contains Desc 44, and has at most 24 lines.', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={24} entries={fake} />
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain(REPORT_LINE);
    expect(joined).toContain('Desc 44');
    expect(lines.length).toBeLessThanOrEqual(24);

    unmount();
  });

  it('4: (source, negative space) WHEN src/core/keymap.ts is imported THEN keymap.length is 36 (T315.2 added edit_note_inline) and no entry.description equals Found a bug? Run snote --report to save a report bundle..', () => {
    expect(keymap.length).toBe(36);
    for (const entry of keymap) {
      expect(entry.description).not.toBe(REPORT_LINE);
    }
  });
});
