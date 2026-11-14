// #310: vitest globalSetup. Gives the run an id (workers put it in their temp dir names), and at the end
// fails the run and removes the dirs of workers that never reached their own cleanup (a crash, a kill).
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  MADE_LIST_ENV, PREFIXES, RUN_ID_ENV, createdByRun, leakedDirs, leftMade, makeMadeList, privateDir, removeLeftovers, removeMade,
} from './tmp-leak';

export default function setup(): () => void {
  const runId = crypto.randomBytes(4).toString('hex');
  // #319 part 3: the run's own fresh, private list of the temp dirs its tests make (never a predictable name)
  const list = makeMadeList();
  let before: string[];
  try {
    before = fs.readdirSync(os.tmpdir());
  } catch (e) {
    fs.rmSync(list, { recursive: true, force: true }); // only the list folder this setup just made
    throw e;
  }
  // both env vars are set only once the setup can no longer fail
  process.env[RUN_ID_ENV] = runId;
  process.env[MADE_LIST_ENV] = list;
  return () => {
    const problems: string[] = [];
    // Every step is tried: a step that throws is named in the one error, and the steps after it still run.
    function step<T>(what: string, fallback: T, fn: () => T): T {
      try {
        return fn();
      } catch (e) {
        problems.push(`${what}: ${(e as Error).message}`);
        return fallback;
      }
    }
    // #319 part 3: a dir a test made and that still exists (left, or made again by a late writer) fails the run.
    // A list folder that is no longer a private dir of this user, or that cannot be read, is not removed, and fails the run.
    let made: string[] = [];
    let kept: string[] = [];
    let failed: string[] = [];
    if (privateDir(list)) {
      const read = step(`the temp dir list folder cannot be read (not removed): ${list}`, undefined, () => leftMade(list));
      if (read !== undefined) {
        ({ kept, failed } = removeMade(list, read));
        made = read.filter((d) => !kept.includes(d) && !failed.includes(d));
      }
    } else {
      problems.push(`the temp dir list folder is not a private dir of this user (not read, not removed): ${list}`);
    }
    const after = step('the temp dir guard cannot list os.tmpdir()', [] as string[], () => fs.readdirSync(os.tmpdir()));
    const created = createdByRun(after, runId, PREFIXES);
    const leaked = leakedDirs(before, after, created, PREFIXES);
    const stuck = removeLeftovers(leaked); // both kinds are removed before the run fails, and the one error names every leak
    const gone = leaked.filter((d) => !stuck.includes(d));
    if (made.length > 0) problems.push(`temp dirs made by tests and left behind by this run (now removed): ${made.join(', ')}`);
    if (kept.length > 0) problems.push(`temp dirs made by tests and left behind by this run (not removed: not a real dir of this user): ${kept.join(', ')}`);
    if (failed.length > 0) problems.push(`temp dirs made by tests and left behind by this run (not removed: the removal failed): ${failed.join(', ')}`);
    if (gone.length > 0) problems.push(`temp dirs left behind by this run (now removed): ${gone.join(', ')}`);
    if (stuck.length > 0) problems.push(`temp dirs left behind by this run (not removed: the removal failed): ${stuck.join(', ')}`);
    if (problems.length === 0) return;
    // vitest only logs an error thrown in a teardown; the exit code must fail too.
    process.exitCode = 1;
    throw new Error(problems.join('\n'));
  };
}
