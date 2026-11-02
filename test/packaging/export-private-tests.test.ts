/**
 * #407: four exported tests read a private file the export removes (a private workflow, the private AGENTS.md lane
 * rules, a private test and the private task list). Each stays out of the public export through an exclude entry, and a
 * test file that skips as a whole leaves no temp home behind, so the public tree's test run is green and exits 0.
 * The public tree has no export script, so this file skips there.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const EXPORT_SCRIPT = 'scripts/publish-export.sh';
const NESTED_TIMEOUT = 60_000;
const root = path.resolve('.');
const vitestBin = path.resolve('node_modules/.bin/vitest');
const skippedFixture = path.resolve('test/fixtures/tmp-leak/skipped.ts');

const cleanups: string[] = [];
afterAll(() => {
  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
});

function scratch(name: string): string {
  const d = mkdtempSync(path.join(os.tmpdir(), name));
  cleanups.push(d);
  return d;
}

function listLines(): { status: number | null; lines: string[] } {
  const res = spawnSync('bash', [EXPORT_SCRIPT, '--list'], { cwd: root, encoding: 'utf8' });
  return { status: res.status, lines: (res.stdout ?? '').split('\n').filter(Boolean) };
}

describe.skipIf(!existsSync(EXPORT_SCRIPT))('#407 tests that read a private file stay out of the public export', () => {
  it('1: WHEN `scripts/publish-export.sh --list` runs on this tree THEN it exits `0` and prints the lines `exclude test/packaging/ci-lean.test.ts`, `exclude test/structure/agents-md-lanes.test.ts`, `exclude test/structure/no-personal-data.test.ts` and `exclude test/structure/tasks-md-trim.test.ts`', () => {
    const r = listLines();
    expect(r.status).toBe(0);
    expect(r.lines).toContain('exclude test/packaging/ci-lean.test.ts');
    expect(r.lines).toContain('exclude test/structure/agents-md-lanes.test.ts');
    expect(r.lines).toContain('exclude test/structure/no-personal-data.test.ts');
    expect(r.lines).toContain('exclude test/structure/tasks-md-trim.test.ts');
  });

  it('2: WHEN the list of line 1 is read THEN every `exclude` line whose path ends in `.test.ts` or `.test.tsx` names a file that exists in this tree, so no entry points at a renamed or missing test', () => {
    const r = listLines();
    expect(r.status).toBe(0);
    const tests = r.lines
      .filter((l) => l.startsWith('exclude '))
      .map((l) => l.slice('exclude '.length))
      .filter((p) => /\.test\.tsx?$/.test(p));
    expect(tests.length).toBeGreaterThan(4);
    const missing = tests.filter((p) => !existsSync(p));
    expect(missing).toEqual([]);
  });

  it('3: WHEN a nested vitest run (TMPDIR a fresh empty directory, the repo\'s vitest config, only test/fixtures/tmp-leak/skipped.ts collected) runs a file whose every test is skipped THEN the run exits `0` and the fresh directory holds `0` entries starting `snote-test-home-`', () => {
    const tmp = scratch('skipped-run-');
    const cfgDir = scratch('skipped-cfg-');
    const cfg = path.join(cfgDir, 'vitest.skipped.config.ts');
    writeFileSync(
      cfg,
      `import base from ${JSON.stringify(path.join(root, 'vitest.config.ts'))};\n` +
        `export default { ...base, root: ${JSON.stringify(root)}, test: { ...base.test, include: [${JSON.stringify(skippedFixture)}] } };\n`,
    );
    const res = spawnSync(vitestBin, ['run', '--config', cfg], {
      cwd: root,
      encoding: 'utf8',
      timeout: 50_000,
      env: { ...process.env, TMPDIR: tmp },
    });
    expect(res.status, (res.stdout ?? '') + (res.stderr ?? '')).toBe(0);
    expect(readdirSync(tmp).filter((n) => n.startsWith('snote-test-home-'))).toHaveLength(0);
  }, NESTED_TIMEOUT);
});
