// #310: temp-dir leak guard helpers. The prefixes are data: add a prefix here to cover a new kind of dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PREFIXES = ['snote-test-home-', 'snote-test-status-'];

export const RUN_ID_ENV = 'SNOTE_TEST_RUN_ID';

/** Names in `after` that were not in `before`, that this run created, and that start with a listed prefix. */
export function leakedDirs(
  before: string[],
  after: string[],
  created: string[],
  prefixes: string[],
): string[] {
  const had = new Set(before);
  const mine = new Set(created);
  return after.filter(
    (name) => !had.has(name) && mine.has(name) && prefixes.some((p) => name.startsWith(p)),
  );
}

/** Names in `listing` that this run created: the run id sits right after the prefix. */
export function createdByRun(listing: string[], runId: string, prefixes: string[]): string[] {
  return listing.filter((name) => prefixes.some((p) => name.startsWith(p + runId + '-')));
}

/** Remove one dir, only when it sits directly inside os.tmpdir() and starts with a listed prefix. */
export function removeIfOwned(dir: string, prefixes: string[] = PREFIXES): void {
  const resolved = path.resolve(dir);
  const base = path.basename(resolved);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())) return;
  if (!prefixes.some((p) => base.startsWith(p))) return;
  fs.rmSync(resolved, { recursive: true, force: true });
}

/** Remove the named leftovers (names inside os.tmpdir()). */
export function removeLeftovers(names: string[], prefixes: string[] = PREFIXES): void {
  for (const name of names) removeIfOwned(path.join(os.tmpdir(), name), prefixes);
}
