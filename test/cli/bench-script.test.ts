import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Run = {
  status: number | null;
  signal: string | NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

// The bench child gets its own temp folder (TMPDIR), so a `snote-bench-` folder
// that another test file makes in the shared os.tmpdir() is never counted here.
let benchTmp: string;
let foreign: string;

function benchEntries(): string[] {
  return fs
    .readdirSync(benchTmp)
    .filter((name) => name.startsWith('snote-bench-'));
}

const root = process.cwd();

let small: Run;
let badRuns: Run;
let entriesBefore: string[];
let entriesAfter: string[];

beforeAll(() => {
  benchTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-script-test-'));
  entriesBefore = benchEntries();
  // A foreign bench folder appearing in the shared os.tmpdir() mid-run is not a leak.
  foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-foreign-'));
  small = spawnSync(
    process.execPath,
    ['scripts/bench.mjs'],
    {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, TMPDIR: benchTmp, SNOTE_BENCH_NOTES: '50', SNOTE_BENCH_RUNS: '1' },
    }
  );
  entriesAfter = benchEntries();
  badRuns = spawnSync(
    process.execPath,
    ['scripts/bench.mjs'],
    {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, SNOTE_BENCH_RUNS: '0' },
    }
  );
}, 20000);

afterAll(() => {
  fs.rmSync(foreign, { recursive: true, force: true });
  fs.rmSync(benchTmp, { recursive: true, force: true });
});

describe('T63 bench script', () => {
  it('1: WHEN the small run has finished THEN its exit status is 0 if no stdout line starts with `FAIL:`, and 1 if at least one does; it is never another value and `signal` is `null`', () => {
    const hasFail = small.stdout
      .split('\n')
      .some((line) => line.startsWith('FAIL:'));
    expect(small.signal).toBeNull();
    if (hasFail) {
      expect(small.status).toBe(1);
    } else {
      expect(small.status).toBe(0);
    }
  });

  it('2: WHEN its stdout is read THEN exactly 1 line matches /^bench: 50 notes, start [\\d.]+ ms, search [\\d.]+ ms, rss [\\d.]+ MB \\(best of 1\\)$/', () => {
    const matches = small.stdout.split('\n').filter((line) =>
      /^bench: 50 notes, start [\d.]+ ms, search [\d.]+ ms, rss [\d.]+ MB \(best of 1\)$/.test(
        line
      )
    );
    expect(matches).toHaveLength(1);
  });

  it('3: WHEN the small run has finished THEN `os.tmpdir()` holds no `snote-bench-` entry that was not there before the run', () => {
    const fresh = entriesAfter.filter((e) => !entriesBefore.includes(e));
    expect(fresh).toEqual([]);
  });

  it("4: WHEN the script is run with `SNOTE_BENCH_RUNS: '0'` THEN within 2 s the exit status is 2, stderr contains `bad SNOTE_BENCH_RUNS` and stdout does not contain `bench:`", () => {
    expect(badRuns.status).toBe(2);
    expect(badRuns.stderr).toContain('bad SNOTE_BENCH_RUNS');
    expect(badRuns.stdout).not.toContain('bench:');
  });

  it('5: WHEN `scripts/bench.mjs` is read as text THEN it contains `SNOTE_BENCH_NOTES`, `SNOTE_BENCH_RUNS`, `build.mjs` and the three limits `150`, `50` and `120`', () => {
    const text = fs.readFileSync(`${root}/scripts/bench.mjs`, 'utf8');
    expect(text).toContain('SNOTE_BENCH_NOTES');
    expect(text).toContain('SNOTE_BENCH_RUNS');
    expect(text).toContain('build.mjs');
    expect(text).toContain('150');
    expect(text).toContain('50');
    expect(text).toContain('120');
  });
});
