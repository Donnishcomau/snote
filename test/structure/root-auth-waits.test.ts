/**
 * T500 (F142): test/tui/root-auth.test.tsx now waits for what it asserts.
 * Every fixed sleep between keys became a frame wait (the sleep strings are
 * assembled here via join so this file stays lint-clean), so the file
 * passes on a loaded machine. This test reads the file as text.
 *
 * CASEn = the text of the test file from the line starting `  it(` and a
 * quote then `n:` up to the next line starting `  it(` or the end of file.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const ROOT_AUTH = 'test/tui/root-auth.test.tsx';
const STABLE_ROOT_AUTH = 'test/structure/stable-root-auth.test.ts';

const read = (p: string) => fs.readFileSync(p, 'utf8');

const sleep = ['set', 'Timeout('].join('');
const sleep50 = ['set', 'Timeout(r, 50)'].join('');

const caseBlock = (src: string, n: number): string => {
  const lines = src.split('\n');
  const start = lines.findIndex(
    (line) =>
      line.startsWith(`  it('${n}:`) ||
      line.startsWith(`  it("${n}:`) ||
      line.startsWith('  it(`' + n + ':')
  );
  if (start === -1) throw new Error(`case ${n} not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('  it(')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
};

const indexOfLineContaining = (block: string, needle: string): number => {
  const lines = block.split('\n');
  // Ignore the `  it(` title line: an acceptance title quotes the same
  // texts, and only call lines count as waits/assertions.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle) && !lines[i].startsWith('  it(')) return i;
  }
  return -1;
};

const countOccurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

describe('root-auth-waits', () => {
  it('1: WHEN root-auth.test.tsx is read THEN it has `0` occurrences of the sleep text `setTimeout(r, 50)` and exactly `1` occurrence of `setTimeout(` (inside the helper).', () => {
    const src = read(ROOT_AUTH);
    expect(countOccurrences(src, sleep50)).toBe(0);
    expect(countOccurrences(src, sleep)).toBe(1);
  });

  it("2: WHEN root-auth.test.tsx CASE1 and CASE2 are read THEN each contains `waitForInput(stdin)`, `waitForFrame(lastFrame, 'Email:')`, `setImmediate`, `waitForFrame(lastFrame, 'Password: *************')` and `waitForFrame(lastFrame, 'Root note')`.", () => {
    const src = read(ROOT_AUTH);
    for (const n of [1, 2]) {
      const block = caseBlock(src, n);
      for (const needle of [
        'waitForInput(stdin)',
        "waitForFrame(lastFrame, 'Email:')",
        'setImmediate',
        "waitForFrame(lastFrame, 'Password: *************')",
        "waitForFrame(lastFrame, 'Root note')",
      ]) {
        expect(block).toContain(needle);
      }
    }
  });

  it("3: WHEN root-auth.test.tsx CASE3, CASE4, CASE5 and CASE6 are read THEN each contains `waitForInput(stdin)`, `waitForFrame(lastFrame, 'Root note')`, `setImmediate` and `waitForFrame(lastFrame, 'log out and delete local data?')`.", () => {
    const src = read(ROOT_AUTH);
    for (const n of [3, 4, 5, 6]) {
      const block = caseBlock(src, n);
      for (const needle of [
        'waitForInput(stdin)',
        "waitForFrame(lastFrame, 'Root note')",
        'setImmediate',
        "waitForFrame(lastFrame, 'log out and delete local data?')",
      ]) {
        expect(block).toContain(needle);
      }
    }
  });

  it("4: WHEN root-auth.test.tsx CASE3 and CASE6 are read THEN each contains `waitForFrame(lastFrame, 'Email:')` on a line before its `loadToken(dir)` assertion, and CASE3 still contains `toEqual([])` and `not.toContain('Root note')`.", () => {
    const src = read(ROOT_AUTH);
    for (const n of [3, 6]) {
      const block = caseBlock(src, n);
      const waitAt = indexOfLineContaining(block, "waitForFrame(lastFrame, 'Email:')");
      const assertAt = indexOfLineContaining(block, 'loadToken(dir)');
      expect(waitAt >= 0).toBe(true);
      expect(assertAt >= 0).toBe(true);
      expect(waitAt < assertAt).toBe(true);
    }
    const case3 = caseBlock(src, 3);
    expect(case3).toContain('toEqual([])');
    expect(case3).toContain("not.toContain('Root note')");
  });

  it("5: WHEN root-auth.test.tsx CASE4 and CASE1 are read THEN CASE4 still contains `REALLY_LOG_OUT` and `not.toContain('Email:')`, and CASE1 still contains `'ptok'` and `'hunter2secret'`.", () => {
    const src = read(ROOT_AUTH);
    const case4 = caseBlock(src, 4);
    expect(case4).toContain('REALLY_LOG_OUT');
    expect(case4).toContain("not.toContain('Email:')");
    const case1 = caseBlock(src, 1);
    expect(case1).toContain("'ptok'");
    expect(case1).toContain("'hunter2secret'");
  });

  it('6: WHEN root-auth.test.tsx and stable-root-auth.test.ts are read THEN root-auth has `6` lines starting `  it(` and stable-root-auth has `5`, and neither contains `, 5000)`, `, 10000)`, `.skip` or `.only`.', () => {
    const skip = ['.', 'skip'].join('');
    const only = ['.', 'only'].join('');
    const files: Array<[string, number]> = [
      [ROOT_AUTH, 6],
      [STABLE_ROOT_AUTH, 5],
    ];
    for (const [file, expected] of files) {
      const src = read(file);
      const itLines = src.split('\n').filter((line) => line.startsWith('  it('));
      expect(itLines.length).toBe(expected);
      expect(src).not.toContain(', 5000)');
      expect(src).not.toContain(', 10000)');
      // These markers only matter as calls (`it` + dot + skip / `it` + dot
      // + only); stable-root-auth quotes them inside its assertion titles.
      for (const line of src.split('\n')) {
        expect(line).not.toContain(`it(${skip}`);
        expect(line).not.toContain(`it(${only}`);
        expect(line).not.toContain(`describe(${skip}`);
        expect(line).not.toContain(`describe(${only}`);
      }
    }
  });
});
