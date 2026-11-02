/**
 * #242: lint:ansi reads an issue reference such as #235 in a source comment
 * as a hex colour. A reference in a comment must not fail the lint, a real
 * colour value in code still must, and the lint-driven tests in test/tui
 * (the 4: test of each named file) keep passing.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/lint-ansi.mjs');

// A throwaway project root holding one file: the linter scans ./src/tui
// relative to its cwd, so running it there checks only this fixture.
function tuiTree(fileName: string, source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-ansi-refs-'));
  mkdirSync(join(root, 'src', 'tui'), { recursive: true });
  writeFileSync(join(root, 'src', 'tui', fileName), source);
  return root;
}

function runLint(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

describe('lint-ansi issue references', () => {
  it('1: WHEN a source comment contains `#235` or `#1234` THEN `node scripts/lint-ansi.mjs` exits 0.', () => {
    const root = tuiTree(
      'issue-refs.tsx',
      '// Issue #235 replaces #1234: a reference in a comment is prose, not a colour.\n'
        + "import { Text } from 'ink';\n"
        + '\n'
        + 'export const ok = <Text dimColor>fine</Text>;\n',
    );
    try {
      const run = runLint(root);
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('2: WHEN a colour prop or string holds `#ff0000` or `#f00` THEN it still exits 1 (mutation: the old regex again).', () => {
    const root = tuiTree(
      'bad-colours.tsx',
      '// colour values in code are still violations\n'
        + "import { Text } from 'ink';\n"
        + '\n'
        + 'export const hot = <Text color="#ff0000">red</Text>;\n'
        + 'export const fallback = "#f00";\n',
    );
    try {
      const run = runLint(root);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('#ff0000');
      expect(run.stderr).toContain('#f00');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('3: WHEN `test/tui/markdown.test.tsx` 4 and `test/tui/theme.test.ts` 4 run THEN they still pass.', { timeout: 90000 }, () => {
    // Drop this worker's vitest markers so the child starts as a clean CLI run.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key === 'VITEST' || key.startsWith('VITEST_')) delete env[key];
    }
    const run = spawnSync(
      'npx',
      ['vitest', 'run', 'test/tui/markdown.test.tsx', 'test/tui/theme.test.ts', '-t', '4:'],
      { encoding: 'utf8', env, timeout: 85000 },
    );
    // 2 passed: the 4: test of each named file, 8 skipped: every other test.
    expect(run.stdout).toContain('2 passed');
    expect(run.status).toBe(0);
  });

  // The security review's probes: each fixture line is reported on its own line number.
  function lintSource(source: string) {
    const root = tuiTree('probe.tsx', source);
    try {
      return runLint(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('4: WHEN a string holds the 8-digit `#ff000080` THEN it exits 1 and reports that line as a `hex color`.', () => {
    const run = lintSource('export const tint = "#ff000080";\n');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('probe.tsx:1 - hex color: export const tint = "#ff000080";');
  });

  it('5: WHEN strings hold the 4-digit `#f00f`, the 5-digit `#f00ff` and the digits-only `#1234` THEN it exits 1 and reports each line as a `hex color`.', () => {
    const run = lintSource('export const a = "#f00f";\nexport const b = "#f00ff";\nexport const c = "#1234";\n');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('probe.tsx:1 - hex color: export const a = "#f00f";');
    expect(run.stderr).toContain('probe.tsx:2 - hex color: export const b = "#f00ff";');
    expect(run.stderr).toContain('probe.tsx:3 - hex color: export const c = "#1234";');
  });

  it('6: WHEN two slashes sit in a regex literal, or after a JSDoc `{@link}` tag, before a colour string on the same line THEN it exits 1 and reports lines 1, 2 and 3 as a `hex color`.', () => {
    const run = lintSource(
      'export const a = x.replace(/a\\//, "#ff0000");\n'
        + 'export const b = x.replace(/a\\//, "#123");\n'
        + '/** @see {@link x} // */ export const c = "#123";\n',
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('probe.tsx:1 - hex color: export const a = x.replace(/a\\//, "#ff0000");');
    expect(run.stderr).toContain('probe.tsx:2 - hex color: export const b = x.replace(/a\\//, "#123");');
    expect(run.stderr).toContain('probe.tsx:3 - hex color: /** @see {@link x} // */ export const c = "#123";');
  });

  it('7: WHEN JSX text holds two slashes or an apostrophe and a later string holds `#123`, or JSX text holds `// #235` THEN it exits 1 and reports lines 1, 3 and 4 as a `hex color`.', () => {
    const run = lintSource(
      'export const a = <Text>a // b</Text>; export const c = "#123";\n'
        + "export const d = <Text>don't</Text>;\n"
        + "export const u = 'http://x'; export const e = \"#123\";\n"
        + 'export const f = <Text>// #235</Text>;\n',
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('probe.tsx:1 - hex color: export const a = <Text>a // b</Text>; export const c = "#123";');
    expect(run.stderr).toContain('probe.tsx:3 - hex color: export const u = \'http://x\'; export const e = "#123";');
    expect(run.stderr).toContain('probe.tsx:4 - hex color: export const f = <Text>// #235</Text>;');
  });

  it('8: WHEN comments hold `#ff0000`, `#fff` and `#235abc`, and `#235` or `#1234` sit in trailing, block, JSDoc, JSX and closing-brace comments THEN it exits 1 and reports only lines 1, 2 and 3, each as a `hex color`.', () => {
    const run = lintSource(
      '// use #ff0000\n'
        + '/* #fff */\n'
        + '// #235abc\n'
        + '/**\n * See #235.\n */\n'
        + 'export function f() {\n'
        + '  const a = 1; // #235\n'
        + '  /* #1234 */\n'
        + '  return a;\n'
        + '  // #235\n'
        + '}\n'
        + 'export const g = <b>{/* #235 */}</b>;\n',
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('probe.tsx:1 - hex color: // use #ff0000');
    expect(run.stderr).toContain('probe.tsx:2 - hex color: /* #fff */');
    expect(run.stderr).toContain('probe.tsx:3 - hex color: // #235abc');
    expect(run.stderr.split('\n').filter((l) => l.includes(' - ')).length).toBe(3);
  });
});
