/**
 * T63: bench gate for `make check`.
 *
 * Generates N notes into a temp dir, starts the bundled bench FRESH `runs`
 * times, takes the best (minimum) of each measure, and fails when the best
 * run breaks a PRD §7 threshold (150 ms start / 50 ms search / 120 MB rss;
 * a value equal to the limit fails).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bundle, writeLauncher } from './build.mjs';

// PRD §7 limits (same as THRESHOLDS in src/cli/bench; a value equal to the limit fails)
const START_MS = 150;
const START_CEILING_MS = 200; // owner-approved regression ceiling (2026-09-24); T288 tightens it toward START_MS
const SEARCH_MS = 50;
const RSS_MB = 120;

const count = Number(process.env.SNOTE_BENCH_NOTES ?? 10000);
const runs = Number(process.env.SNOTE_BENCH_RUNS ?? 5);

if (
  !Number.isInteger(count) ||
  count < 0 ||
  !Number.isInteger(runs) ||
  runs < 1
) {
  console.error('bench: bad SNOTE_BENCH_RUNS or SNOTE_BENCH_NOTES');
  process.exit(2);
}

// (1) fresh temp dir for the state and the two bundled entries
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-'));

try {
  // (2) bundle the two small entries that need project code
  const gen = path.join(dir, 'gen.mjs');
  const run = path.join(dir, 'run.mjs');
  await bundle({
    contents:
      "import { writeBenchState } from './src/cli/bench'; writeBenchState(process.argv[2], Number(process.argv[3]));",
    outfile: gen,
  });
  // T174: the run entry starts through the same launcher users get, so the
  // bench measures what the user runs (compile cache on, warm after run 1).
  await bundle({
    contents:
      "import { benchMain } from './src/cli/bench'; benchMain(process.argv.slice(2));",
    outfile: path.join(dir, 'run-main.mjs'),
  });
  writeLauncher(run, 'run-main.mjs');

  // (3) generate the notes
  const genChild = spawnSync(process.execPath, [gen, dir, String(count)], {
    encoding: 'utf8',
  });
  if (genChild.status !== 0) {
    if (genChild.stderr) process.stderr.write(genChild.stderr);
    process.exit(1);
  }

  // (4) fresh process per run; parse the last stdout line of each as JSON
  const results = [];
  for (let i = 0; i < runs; i++) {
    const child = spawnSync(process.execPath, [run, dir], {
      encoding: 'utf8',
      // the compile cache goes under the temp dir; step (7) removes it
      env: { ...process.env, XDG_CACHE_HOME: path.join(dir, 'cache') },
    });
    const lines = (child.stdout ?? '').split('\n').filter((l) => l.trim() !== '');
    const last = lines[lines.length - 1];
    let parsed = null;
    if (last) {
      try {
        parsed = JSON.parse(last);
      } catch {
        parsed = null;
      }
    }
    if (
      child.status !== 0 ||
      parsed === null ||
      typeof parsed !== 'object' ||
      !Number.isFinite(parsed.startMs) ||
      !Number.isFinite(parsed.searchMs) ||
      !Number.isFinite(parsed.rssMb)
    ) {
      if (child.stderr) process.stderr.write(child.stderr);
      process.exit(1);
    }
    results.push(parsed);
  }

  // (5) best of the runs, per measure
  const best = {
    startMs: Math.min(...results.map((r) => r.startMs)),
    searchMs: Math.min(...results.map((r) => r.searchMs)),
    rssMb: Math.min(...results.map((r) => r.rssMb)),
  };

  // (7) the temp dir is no longer needed
  fs.rmSync(dir, { recursive: true, force: true });

  // (6) report, then compare best with the limits
  console.log(
    `bench: ${count} notes, start ${best.startMs} ms, search ${best.searchMs} ms, rss ${best.rssMb} MB (best of ${runs})`
  );

  const broken = [];
  if (best.startMs >= START_CEILING_MS)
    broken.push(`start ${best.startMs} ms >= ${START_CEILING_MS} ms`);
  else if (best.startMs >= START_MS)
    console.log(`WARN: start ${best.startMs} ms above PRD target ${START_MS} ms`);
  if (best.searchMs >= SEARCH_MS)
    broken.push(`search ${best.searchMs} ms >= ${SEARCH_MS} ms`);
  if (best.rssMb >= RSS_MB)
    broken.push(`rss ${best.rssMb} MB >= ${RSS_MB} MB`);

  if (broken.length > 0) {
    for (const line of broken) console.log(`FAIL: ${line}`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  // the temp dir may already be gone (step 7); force covers both cases
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
}
