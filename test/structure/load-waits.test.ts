/**
 * #383: seven cases in five files failed under host load in local check-fast (four runs at once on one Linux host).
 * At origin/main 1ecf0d93 none fails in 6 runs on the MacBook runner with one CPU burner per core: they wait on the
 * state they assert, every suite run goes through kit/test-slot.sh, and the bench test runs the bench in its own TMPDIR.
 * This pins that. CASE n = the text from the line starting `  it(` and a quote or backtick then `n:` up to the next
 * line starting `  it(`, or the end of the file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CASES: Array<[string, number[]]> = [
  ['test/tui/editor-stand-ins.test.tsx', [3, 4, 6]],
  ['test/packaging/omarchy-setup-mv-symlink.test.ts', [4]],
  ['test/packaging/omarchy-setup-swap.test.ts', [6]],
  ['test/cli/bench-script.test.ts', [3]],
  ['test/structure/lint-ansi-issue-refs.test.ts', [3]],
];
const FIXED = /setTimeout\(|setInterval\(|\bsleep\(/;

function caseBlock(src: string, n: number): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => ["'", '"', '`'].some((q) => l.startsWith(`  it(${q}${n}:`)));
  if (start === -1) return '';
  const next = lines.findIndex((l, i) => i > start && l.startsWith('  it('));
  return lines.slice(start, next === -1 ? lines.length : next).join('\n');
}

describe('#383 the load-sensitive cases wait on what they assert', () => {
  it('1: WHEN the 7 named cases of the 5 files are read THEN each is found and none holds `setTimeout(`, `setInterval(` or `sleep(`', () => {
    const found = CASES.flatMap(([f, ns]) => ns.map((n) => [`${f} ${n}`, caseBlock(readFileSync(f, 'utf8'), n)] as const));
    expect(found.filter(([, b]) => b === '').map(([k]) => k)).toEqual([]);
    expect(found.filter(([, b]) => FIXED.test(b)).map(([k]) => k)).toEqual([]);
  });

  it('2: WHEN test/cli/bench-script.test.ts is read THEN its small bench run passes `TMPDIR: benchTmp`', () => {
    expect(readFileSync('test/cli/bench-script.test.ts', 'utf8')).toContain('TMPDIR: benchTmp');
  });
});
