import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('bench gate (T287)', () => {
  it('1: WHEN Makefile is read THEN it contains the exact line `@if [ -f scripts/bench.mjs ]; then node scripts/bench.mjs; else echo "skip: bench gate (T17)"; fi` and does not contain `] && node scripts/bench.mjs ||`', () => {
    const makefile = read('Makefile');
    expect(makefile).toContain(
      '@if [ -f scripts/bench.mjs ]; then node scripts/bench.mjs; else echo "skip: bench gate (T17)"; fi'
    );
    expect(makefile).not.toContain('] && node scripts/bench.mjs ||');
  });

  it('2: WHEN the shape `if [ -f <path> ]; then node <path>; else echo "skip: bench gate (T17)"; fi` is run via `bash -c` with `<path>` a temp `.mjs` file whose only content is `process.exit(1)` THEN the command exits `1` and stdout does not contain `skip:`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-gate-'));
    try {
      const failing = path.join(dir, 'failing.mjs');
      fs.writeFileSync(failing, 'process.exit(1)');
      const run = spawnSync(
        'bash',
        ['-c', `if [ -f "${failing}" ]; then node "${failing}"; else echo "skip: bench gate (T17)"; fi`],
        { encoding: 'utf8' }
      );
      expect(run.status).toBe(1);
      expect(run.stdout).not.toContain('skip:');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3: WHEN the same shape is run with `<path>` a path that does not exist THEN the command exits `0` and stdout is exactly `skip: bench gate (T17)\\n`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-gate-'));
    try {
      const missing = path.join(dir, 'missing.mjs');
      const run = spawnSync(
        'bash',
        ['-c', `if [ -f "${missing}" ]; then node "${missing}"; else echo "skip: bench gate (T17)"; fi`],
        { encoding: 'utf8' }
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('skip: bench gate (T17)\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4: WHEN `src/tui/App.tsx` is read as text THEN it does not contain the substring `sortEntries(`, while `src/tui/useAppState.ts` still contains `sortEntries(` exactly once', () => {
    const app = read('src/tui/App.tsx');
    expect(app).not.toContain('sortEntries(');
    const useAppState = read('src/tui/useAppState.ts');
    const occurrences = useAppState.match(/sortEntries\(/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('5: WHEN `src/tui/app-model.ts` is read as text THEN it still contains `export function sortEntries` and `localeCompare`', () => {
    const appModel = read('src/tui/app-model.ts');
    expect(appModel).toContain('export function sortEntries');
    expect(appModel).toContain('localeCompare');
  });

  it('6: WHEN `scripts/bench.mjs` is read as text THEN it contains `const START_MS = 150;` and `const START_CEILING_MS = 200;` and contains `above PRD target`', () => {
    const bench = read('scripts/bench.mjs');
    expect(bench).toContain('const START_MS = 150;');
    expect(bench).toContain('const START_CEILING_MS = 200;');
    expect(bench).toContain('above PRD target');
  });
});
