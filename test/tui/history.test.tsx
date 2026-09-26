/**
 * History list component tests (T56).
 * Verifies the History component renders correctly.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { History } from '../../src/tui/History';

describe('History component', () => {
  it('1: WHEN rows is [v3 Third, v2 Second, v1 First] and selectedIndex is 1 THEN the first 4 frame lines are History, v3 Third, >v2 Second, v1 First in that order and exactly 1 line starts with >', async () => {
    const { lastFrame, unmount } = render(
      <History rows={['v3 Third', 'v2 Second', 'v1 First']} selectedIndex={1} loading={false} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const lines = lastFrame();
    const trimmedLines = lines.split('\n').map(l => l.trimEnd());

    expect(trimmedLines[0]).toBe('History');
    expect(trimmedLines[1]).toBe(' v3 Third');
    expect(trimmedLines[2]).toBe('>v2 Second');
    expect(trimmedLines[3]).toBe(' v1 First');

    const linesStartingWithGreater = trimmedLines.filter(l => l.startsWith('>'));
    expect(linesStartingWithGreater.length).toBe(1);

    unmount();
  });

  it('2a: WHEN rows is [] and loading is true THEN the frame contains History and loading... and not no earlier versions', async () => {
    const { lastFrame, unmount } = render(
      <History rows={[]} selectedIndex={0} loading={true} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('History');
    expect(frame).toContain('loading...');
    expect(frame).not.toContain('no earlier versions');

    unmount();
  });

  it('2b: WHEN rows is [] and loading is false THEN it contains no earlier versions and not loading...', async () => {
    const { lastFrame, unmount } = render(
      <History rows={[]} selectedIndex={0} loading={false} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('no earlier versions');
    expect(frame).not.toContain('loading...');

    unmount();
  });

  it('3: WHEN the only row is 60 times the letter a and selectedIndex is 0 THEN that row line is 31 characters long, starts with >aaaa and ends with aa.., and no frame line is longer than 32 characters', async () => {
    const onlyRow = 'a'.repeat(60);
    const { lastFrame, unmount } = render(
      <History rows={[onlyRow]} selectedIndex={0} loading={false} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    const trimmedLines = frame.split('\n').map(l => l.trimEnd());

    // Find the line that starts with >
    const markerLine = trimmedLines.find(l => l.startsWith('>'));
    expect(markerLine).toBeDefined();
    expect(markerLine!.length).toBe(31);
    expect(markerLine!.startsWith('>aaaa')).toBe(true);
    expect(markerLine!.endsWith('aa..')).toBe(true);

    // No frame line longer than 32 characters
    for (const line of trimmedLines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }

    unmount();
  });

  it('4: WHEN the only row is 30 times the letter b THEN its line is 31 characters long, ends with bbbb, and the frame does not contain ..', async () => {
    const onlyRow = 'b'.repeat(30);
    const { lastFrame, unmount } = render(
      <History rows={[onlyRow]} selectedIndex={0} loading={false} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    const trimmedLines = frame.split('\n').map(l => l.trimEnd());

    const markerLine = trimmedLines.find(l => l.startsWith('>'));
    expect(markerLine).toBeDefined();
    expect(markerLine!.length).toBe(31);
    expect(markerLine!.endsWith('bbbb')).toBe(true);

    // No truncation marker
    expect(frame).not.toContain('..');

    unmount();
  });

  it('5: WHEN rows is fifty, height is 12 and selectedIndex is 40 THEN the frame contains >row40, row36 and row44, does not contain row35, row45 or a line equal to  row0, and has at most 10 lines', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => `row${i}`);
    const { lastFrame, unmount } = render(
      <History rows={rows} selectedIndex={40} loading={false} width={80} height={12} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    const trimmedLines = frame.split('\n').map(l => l.trimEnd());

    // Has visible rows
    expect(trimmedLines.some(l => l === '>row40')).toBe(true);
    expect(trimmedLines.some(l => l === ' row36')).toBe(true);
    expect(trimmedLines.some(l => l === ' row44')).toBe(true);

    // Does not contain rows outside visible range
    expect(trimmedLines.some(l => l === ' row35')).toBe(false);
    expect(trimmedLines.some(l => l === ' row45')).toBe(false);

    // Does not contain the first row
    expect(trimmedLines.some(l => l === ' row0')).toBe(false);

    // At most 10 lines (listHeight = 12 - 3 = 9, but we check at most 10)
    expect(trimmedLines.length).toBeLessThanOrEqual(10);

    unmount();
  });

  it('6: WHEN rows is fifty, height is 12 and selectedIndex is 49 (last row) THEN the frame contains  row45 and >row49, does not contain row44, and has at most 10 lines', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => `row${i}`);
    const { lastFrame, unmount } = render(
      <History rows={rows} selectedIndex={49} loading={false} width={80} height={12} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    const trimmedLines = frame.split('\n').map(l => l.trimEnd());

    expect(trimmedLines.some(l => l === ' row45')).toBe(true);
    expect(trimmedLines.some(l => l === '>row49')).toBe(true);
    expect(trimmedLines.some(l => l === ' row44')).toBe(false);
    expect(trimmedLines.length).toBeLessThanOrEqual(10);

    unmount();
  });
});
