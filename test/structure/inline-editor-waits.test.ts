/**
 * T472: cases 8, 10 and 16 of test/tui/inline-editor.test.tsx must wait for
 * each screen with `vi.waitFor` instead of sleeping 50 ms, with every value
 * asserted inside the final wait. The two `regression:` cases type instantly
 * on purpose and keep their `setTimeout(`. This test reads the file as text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const filePath = 'test/tui/inline-editor.test.tsx';

const read = (p: string) => fs.readFileSync(p, 'utf8');

// Decisions (task T472): CASEn = the text from the line starting `  it('n:`
// up to the next line starting `  it(`.
const caseBlock = (src: string, n: number): string => {
  const lines = src.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`  it('${n}:`));
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

const lastIndexOfLineContaining = (block: string, needle: string): number => {
  const lines = block.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
};

describe('inline-editor-waits', () => {
  it('1: WHEN CASE8, CASE10 and CASE16 are read THEN none contains `setTimeout(` and each contains `vi.waitFor(`.', () => {
    const src = read(filePath);
    for (const n of [8, 10, 16]) {
      const block = caseBlock(src, n);
      expect(block.includes('setTimeout(')).toBe(false);
      expect(block.includes('vi.waitFor(')).toBe(true);
    }
  });

  it('2: WHEN CASE16 is read THEN it contains `discard changes?` and `hello worldZ`, and its last line containing `expect(` comes before its last line containing `}, { timeout:` or the closing of a `vi.waitFor(` call.', () => {
    const block = caseBlock(read(filePath), 16);
    expect(block.includes('discard changes?')).toBe(true);
    expect(block.includes('hello worldZ')).toBe(true);
    const lastExpect = lastIndexOfLineContaining(block, 'expect(');
    const lastWaitClose = Math.max(
      lastIndexOfLineContaining(block, '}, { timeout:'),
      lastIndexOfLineContaining(block, '});'),
    );
    expect(lastExpect >= 0).toBe(true);
    expect(lastWaitClose >= 0).toBe(true);
    expect(lastExpect < lastWaitClose).toBe(true);
  });

  it('3: WHEN inline-editor.test.tsx is read THEN it has the same number of lines starting `  it(` as before (`21`) and both `regression:` cases still contain `setTimeout(`.', () => {
    const src = read(filePath);
    const lines = src.split('\n');
    const itLines = lines.filter((line) => line.startsWith('  it('));
    expect(itLines.length).toBe(21);
    const starts = lines
      .map((line, i) => [line, i] as const)
      .filter(([line]) => line.startsWith("  it('regression:"));
    expect(starts.length).toBe(2);
    for (const [, start] of starts) {
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].startsWith('  it(')) {
          end = i;
          break;
        }
      }
      const block = lines.slice(start, end).join('\n');
      expect(block.includes('setTimeout(')).toBe(true);
    }
  });
});
