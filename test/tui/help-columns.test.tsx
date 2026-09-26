/**
 * Help overlay: columns so every key fits on the screen (T88).
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help, helpColumns } from '../../src/tui/Help';
import { keymap } from '../../src/core/keymap';

const fake = Array.from({ length: 45 }, (_, i) => ({
  key: 'k' + i,
  action: 'a' + i,
  description: 'Desc ' + i,
}));

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('helpColumns', () => {
  it('1: WHEN helpColumns(fake, 20) is called THEN the lengths are [20, 20, 5], the first entry of the second array has the key k20, .flat() equals fake, and fake.length is still 45', () => {
    const result = helpColumns(fake, 20);
    expect(result.map((c) => c.length)).toEqual([20, 20, 5]);
    expect(result[1][0].key).toBe('k20');
    expect(result.flat()).toEqual(fake);
    expect(fake.length).toBe(45);
  });

  it('2: WHEN helpColumns(fake.slice(0, 5), 20) THEN returns 1 array of 5; WHEN helpColumns(fake, 0) THEN returns 45 arrays of 1; WHEN helpColumns([], 20) THEN returns an array of length 0', () => {
    expect(helpColumns(fake.slice(0, 5), 20).length).toBe(1);
    expect(helpColumns(fake.slice(0, 5), 20)[0].length).toBe(5);

    const r0 = helpColumns(fake, 0);
    expect(r0.length).toBe(45);
    expect(r0[0].length).toBe(1);

    const rEmpty = helpColumns([], 20);
    expect(rEmpty.length).toBe(0);
  });
});

describe('Help with columns', () => {
  async function renderHelp(props: { width: number; height: number; entries?: typeof fake }) {
    const { frames, unmount } = render(
      <Help width={props.width} height={props.height} entries={props.entries} />
    );
    await new Promise((r) => setTimeout(r, 50));
    return { frames, unmount };
  }

  it('3: WHEN <Help width={80} height={24} entries={fake} /> is rendered THEN the frame contains Desc 44, the line that contains Desc 20 also contains Desc 0 and Desc 40, there are at most 24 lines and none is longer than 80 characters', async () => {
    const { frames, unmount } = await renderHelp({ width: 80, height: 24, entries: fake });
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));

    const joined = lines.join('\n');
    expect(joined).toContain('Desc 44');

    const lineWith20 = lines.find((l) => l.includes('Desc 20'));
    expect(lineWith20).toBeDefined();
    expect(lineWith20!).toContain('Desc 0');
    expect(lineWith20!).toContain('Desc 40');

    expect(lines.length).toBeLessThanOrEqual(24);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(80));
    unmount();
  });

  it('4: WHEN <Help width={120} height={40} entries={fake} /> is rendered THEN the frame contains Desc 44, the line that contains Desc 36 also contains Desc 0, and there are at most 40 lines', async () => {
    const { frames, unmount } = await renderHelp({ width: 120, height: 40, entries: fake });
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));

    const joined = lines.join('\n');
    expect(joined).toContain('Desc 44');

    const lineWith36 = lines.find((l) => l.includes('Desc 36'));
    expect(lineWith36).toBeDefined();
    expect(lineWith36!).toContain('Desc 0');

    expect(lines.length).toBeLessThanOrEqual(40);
    unmount();
  });

  it('5: WHEN entry 0 description is 60 x chars and rendered at 80x24 THEN the frame contains 13 x chars and not 14 x chars, has at most 24 lines and none longer than 80 characters', async () => {
    const fakeLong = fake.map((e, i) =>
      i === 0 ? { ...e, description: 'x'.repeat(60) } : e
    );
    const { frames, unmount } = await renderHelp({ width: 80, height: 24, entries: fakeLong });
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));

    const joined = lines.join('\n');

    // 13 x's must appear (not 14)
    expect(joined).toContain('xxxxxxxxxxxxx');
    expect(joined).not.toContain('xxxxxxxxxxxxxx');

    expect(lines.length).toBeLessThanOrEqual(24);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(80));
    unmount();
  });

  it('6: WHEN <Help width={80} height={24} /> without entries THEN the frame contains "Help - Keyboard Shortcuts" and for every keymap entry it contains entry.description.slice(0, 12)', async () => {
    const { frames, unmount } = await renderHelp({ width: 80, height: 24 });
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain('Help - Keyboard Shortcuts');
    keymap.forEach((entry) => {
      expect(joined).toContain(entry.description.slice(0, 12));
    });
    unmount();
  });
});
