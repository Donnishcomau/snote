/**
 * T489: case 3 of test/tui/session-expired.test.tsx must let the event loop
 * run once (one `setImmediate` between the EXPIRED frame and the first typed
 * key) so the fresh login screen has attached its key handler before `a@b.co`
 * is written. Cases 1 and 2 keep no such wait, and no test raises its timeout.
 * This test reads the file as text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const filePath = 'test/tui/session-expired.test.tsx';

const read = (p: string) => fs.readFileSync(p, 'utf8');

// CASEn = the text from the line starting `  it(<backtick>n:` up to the next
// line starting `  it(` or the end of the file (the file's cases are titled
// with a backtick template).
const caseBlock = (src: string, n: number): string => {
  const lines = src.split('\n');
  const start = lines.findIndex((line) => line.startsWith('  it(`' + n + ':'));
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

describe('session-expired-waits', () => {
  it('1: WHEN CASE3 is read THEN it contains `setImmediate`, on a line after the line containing `waitForFrame(lastFrame, EXPIRED)` and before the line containing `stdin.write(\'a@b.co\')`.', () => {
    const block = caseBlock(read(filePath), 3);
    const waitAt = indexOfLineContaining(block, 'waitForFrame(lastFrame, EXPIRED)');
    const immAt = indexOfLineContaining(block, 'setImmediate');
    const writeAt = indexOfLineContaining(block, "stdin.write('a@b.co')");
    expect(waitAt >= 0).toBe(true);
    expect(immAt > waitAt).toBe(true);
    expect(writeAt > immAt).toBe(true);
  });

  it('2: WHEN CASE3 is read THEN it still contains \'Root note\', \'session has expired\', \'ABC123\', tok2 and expect(frame), and does not contain setTimeout(`).', () => {
    const block = caseBlock(read(filePath), 3);
    for (const needle of [
      "'Root note'",
      "'session has expired'",
      "'ABC123'",
      'tok2',
      'expect(frame)',
    ]) {
      expect(block).toContain(needle);
    }
    expect(block).not.toContain('setTimeout(');
  });

  it('3: WHEN session-expired.test.tsx is read THEN it has 3 lines starting `  it(`, CASE1 and CASE2 do not contain setImmediate, and the file contains no `, 5000)` or timeout: raise.', () => {
    const src = read(filePath);
    const itLines = src.split('\n').filter((line) => line.startsWith('  it('));
    expect(itLines.length).toBe(3);
    for (const n of [1, 2]) {
      expect(caseBlock(src, n)).not.toContain('setImmediate');
    }
    expect(src).not.toContain(', 5000)');
    expect(src).not.toContain('timeout:');
  });
});
