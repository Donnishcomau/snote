// #310: vitest globalSetup. Gives the run an id (workers put it in their temp dir names), and at the end
// fails the run and removes the dirs of workers that never reached their own cleanup (a crash, a kill).
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { PREFIXES, RUN_ID_ENV, createdByRun, leakedDirs, removeLeftovers } from './tmp-leak';

export default function setup(): () => void {
  const runId = crypto.randomBytes(4).toString('hex');
  process.env[RUN_ID_ENV] = runId;
  const before = fs.readdirSync(os.tmpdir());
  return () => {
    const after = fs.readdirSync(os.tmpdir());
    const created = createdByRun(after, runId, PREFIXES);
    const leaked = leakedDirs(before, after, created, PREFIXES);
    if (leaked.length === 0) return;
    removeLeftovers(leaked);
    // vitest only logs an error thrown in a teardown; the exit code must fail too.
    process.exitCode = 1;
    throw new Error(`temp dirs left behind by this run (now removed): ${leaked.join(', ')}`);
  };
}
