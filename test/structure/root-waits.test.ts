/**
 * T495 (F138): the four load-fragile cases now wait for what they assert.
 * Case 3 and 4 of test/tui/root.test.tsx, case 4 of
 * test/tui/root-server.test.tsx and case 1 of test/core/status-quit.test.ts
 * keep their titles and asserted values while every fixed sleep between
 * keys becomes a frame wait and the quit test waits for `count` before the
 * final status flush. This test reads the three files as text.
 *
 * CASEn = the text of a test file from the line starting `  it(` and a
 * quote or backtick then `n:` up to the next line starting `  it(` or the
 * end of the file.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const ROOT = 'test/tui/root.test.tsx';
const ROOT_SERVER = 'test/tui/root-server.test.tsx';
const STATUS_QUIT = 'test/core/status-quit.test.ts';

const read = (p: string) => fs.readFileSync(p, 'utf8');

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
  return lines.findIndex((line) => line.includes(needle));
};

const countOccurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

describe('root-waits', () => {
  it("1: WHEN root.test.tsx CASE3 and CASE4 are read THEN each contains `waitForInput(stdin)`, `waitForFrame(lastFrame, 'Email:')`, `setImmediate`, `waitForFrame(lastFrame, 'Code: ABC123')` and does not contain `setTimeout(`.", () => {
    const src = read(ROOT);
    for (const n of [3, 4]) {
      const block = caseBlock(src, n);
      for (const needle of [
        'waitForInput(stdin)',
        "waitForFrame(lastFrame, 'Email:')",
        'setImmediate',
        "waitForFrame(lastFrame, 'Code: ABC123')",
      ]) {
        expect(block).toContain(needle);
      }
      expect(block).not.toContain('setTimeout(');
    }
  });

  it("2: WHEN root.test.tsx CASE3 is read THEN it contains `waitForFrame(lastFrame, 'Root note')` on a line before `expect(frame).toContain('Root note')`, and still contains `'tok2'` and `makeStoreFor`; CASE4 contains `waitForFrame(lastFrame, 'Error: 401 bad code')` and still contains `not.toContain('Root note')`.", () => {
    const src = read(ROOT);
    const case3 = caseBlock(src, 3);
    const waitAt = indexOfLineContaining(case3, "waitForFrame(lastFrame, 'Root note')");
    const assertAt = indexOfLineContaining(case3, "expect(frame).toContain('Root note')");
    expect(waitAt >= 0).toBe(true);
    expect(assertAt >= 0).toBe(true);
    expect(waitAt < assertAt).toBe(true);
    expect(case3).toContain("'tok2'");
    expect(case3).toContain('makeStoreFor');
    const case4 = caseBlock(src, 4);
    expect(case4).toContain("waitForFrame(lastFrame, 'Error: 401 bad code')");
    expect(case4).toContain("not.toContain('Root note')");
  });

  it("3: WHEN root-server.test.tsx CASE4 is read THEN it contains `waitForInput(stdin)`, `waitForFrame(lastFrame, 'Password: *************')`, `setImmediate`, and still contains `'tok9'` and `ws://new.example`, and has `0` occurrences of `setTimeout(` before the line containing `stdin.write('\\r')`.", () => {
    const block = caseBlock(read(ROOT_SERVER), 4);
    expect(block).toContain('waitForInput(stdin)');
    expect(block).toContain("waitForFrame(lastFrame, 'Password: *************')");
    expect(block).toContain('setImmediate');
    expect(block).toContain("'tok9'");
    expect(block).toContain('ws://new.example');
    const writeAt = indexOfLineContaining(block, "stdin.write('\\r')");
    expect(writeAt >= 0).toBe(true);
    const before = block.split('\n').slice(0, writeAt).join('\n');
    expect(countOccurrences(before, 'setTimeout(')).toBe(0);
  });

  it("4: WHEN status-quit.test.ts CASE1 is read THEN its first `waitFor(` call contains both `'available'` and `count === 2` and comes before the line containing `stop()`, and it still contains `toBe(2)`.", () => {
    const block = caseBlock(read(STATUS_QUIT), 1);
    const lines = block.split('\n');
    const firstWaitAt = lines.findIndex((line) => line.includes('waitFor('));
    expect(firstWaitAt >= 0).toBe(true);
    let waitEnd = firstWaitAt;
    for (let i = firstWaitAt; i < lines.length; i++) {
      waitEnd = i;
      if (lines[i].includes(');')) break;
    }
    const firstWait = lines.slice(firstWaitAt, waitEnd + 1).join('\n');
    expect(firstWait).toContain("'available'");
    expect(firstWait).toContain('count === 2');
    const stopAt = lines.findIndex((line) => line.includes('stop()'));
    expect(stopAt >= 0).toBe(true);
    expect(waitEnd < stopAt).toBe(true);
    expect(block).toContain('toBe(2)');
  });

  it('5: WHEN the three files are read THEN root.test.tsx has `6` lines starting `  it(`, root-server.test.tsx `4`, status-quit.test.ts `3`, and none contains `, 5000)`, `, 10000)` or `timeout:`.', () => {
    const files: Array<[string, number]> = [
      [ROOT, 6],
      [ROOT_SERVER, 4],
      [STATUS_QUIT, 3],
    ];
    for (const [file, expected] of files) {
      const src = read(file);
      const itLines = src.split('\n').filter((line) => line.startsWith('  it('));
      expect(itLines.length).toBe(expected);
      expect(src).not.toContain(', 5000)');
      expect(src).not.toContain(', 10000)');
      expect(src).not.toContain('timeout:');
    }
  });
});
