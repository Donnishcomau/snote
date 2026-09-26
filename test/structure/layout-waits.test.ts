/**
 * T294: the layout and frame-width tests must not assert after a fixed
 * 50 ms wait. This test reads test/tui/layout.test.tsx and
 * test/tui/frame-width.test.tsx as text and pins that every assertion
 * runs inside `vi.waitFor` and that the cases are all still there.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const layout = 'test/tui/layout.test.tsx';
const frameWidth = 'test/tui/frame-width.test.tsx';

const read = (p: string) => fs.readFileSync(p, 'utf8');

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const countItCases = (src: string): number =>
  src.split('\n').filter((line) => line.trimStart().startsWith("it('")).length;

const delayFollowedByExpect = (src: string): boolean => {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('await delay(')) {
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        if (lines[j].includes('expect(')) return true;
      }
    }
  }
  return false;
};

describe('layout-waits', () => {
  it("1: WHEN `test/tui/layout.test.tsx` is read as text THEN no `await delay(` line is followed within the next 3 lines by `expect(`, and it contains `vi.waitFor(` at least `5` times.", () => {
    const src = read(layout);
    expect(delayFollowedByExpect(src)).toBe(false);
    expect(countOf(src, 'vi.waitFor(') >= 5).toBe(true);
  });

  it("2: WHEN `test/tui/frame-width.test.tsx` is read as text THEN no `await delay(` line is followed within the next 3 lines by `expect(`, and it contains `vi.waitFor(`.", () => {
    const src = read(frameWidth);
    expect(delayFollowedByExpect(src)).toBe(false);
    expect(src.includes('vi.waitFor(')).toBe(true);
  });

  it("3: WHEN `test/tui/layout.test.tsx` is read as text THEN it still contains `'All notes'`, `'Alpha note'`, `'Preview'` and `toHaveBeenCalledTimes(1)`, and contains exactly `6` occurrences of `it('`.", () => {
    const src = read(layout);
    expect(src.includes("'All notes'")).toBe(true);
    expect(src.includes("'Alpha note'")).toBe(true);
    expect(src.includes("'Preview'")).toBe(true);
    expect(src.includes('toHaveBeenCalledTimes(1)')).toBe(true);
    expect(countItCases(src)).toBe(6);
  });

  it("4: WHEN `test/tui/frame-width.test.tsx` is read as text THEN it still contains `'Tags'` and contains exactly `4` occurrences of `it('`.", () => {
    const src = read(frameWidth);
    expect(src.includes("'Tags'")).toBe(true);
    expect(countItCases(src)).toBe(4);
  });
});
