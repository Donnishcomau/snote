/**
 * T182: the persistence debounce tests must not depend on the scheduler
 * being on time. This test reads test/core/persistence-debounce.test.ts as
 * text and pins the shapes that make cases 1-3 timing-independent.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const file = 'test/core/persistence-debounce.test.ts';

const content = () => fs.readFileSync(file, 'utf8');

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('stable-debounce', () => {
  it('1: WHEN the file is read THEN it contains neither `setInterval` nor `setTimeout(r, 25)` nor `seen.size`.', () => {
    const src = content();
    expect(src.includes('setInterval')).toBe(false);
    expect(src.includes('setTimeout(r, 25)')).toBe(false);
    expect(src.includes('seen.size')).toBe(false);
  });

  it('2: WHEN the file is read THEN it contains `persistOnChange(store, tmpDir, 300)` at least 3 times and `persistOnChange(store, tmpDir, 50)` exactly 1 time (case 4).', () => {
    const src = content();
    expect(countOf(src, 'persistOnChange(store, tmpDir, 300)') >= 3).toBe(true);
    expect(countOf(src, 'persistOnChange(store, tmpDir, 50)')).toBe(1);
  });

  it('3: WHEN the file is read THEN it contains `expect(ino()).toBe(first)`, `expect(ino()).not.toBe(first)` and `const waitFor = async`.', () => {
    const src = content();
    expect(src.includes('expect(ino()).toBe(first)')).toBe(true);
    expect(src.includes('expect(ino()).not.toBe(first)')).toBe(true);
    expect(src.includes('const waitFor = async')).toBe(true);
  });

  it("4: WHEN the `it(` cases are counted THEN there are exactly `4`, and the lines containing `expect(` are at least `8`.", () => {
    const src = content();
    expect(countOf(src, 'it(')).toBe(4);
    const expectLines = src.split('\n').filter((l) => l.includes('expect('));
    expect(expectLines.length >= 8).toBe(true);
  });

  it('5: WHEN the file is read THEN it still contains `Edit 3`, `Edit 4` and `state.json does not exist` and does not contain `useFakeTimers`.', () => {
    const src = content();
    expect(src.includes('Edit 3')).toBe(true);
    expect(src.includes('Edit 4')).toBe(true);
    expect(src.includes('state.json does not exist')).toBe(true);
    expect(src.includes('useFakeTimers')).toBe(false);
  });
});
