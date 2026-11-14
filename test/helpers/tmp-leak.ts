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

/** Remove the named leftovers (names inside os.tmpdir()); returns the names it could not remove (each one is tried). */
export function removeLeftovers(names: string[], prefixes: string[] = PREFIXES): string[] {
  const failed: string[] = [];
  for (const name of names) {
    try {
      removeIfOwned(path.join(os.tmpdir(), name), prefixes);
    } catch {
      failed.push(name);
    }
  }
  return failed;
}

// #319 part 3: every temp dir a test process makes with the mkdtemp family (fs.mkdtempSync, fs.mkdtemp, fs.promises.mkdtemp,
// the node:fs/promises exports, and any later mkdtemp* function of fs or fs.promises) directly in os.tmpdir() is listed,
// one file per worker, in the run's list folder; the run's teardown fails when one of them still exists, also one a late
// writer made again after its test removed it. A spawned child process is not tracked (its dirs are its test's to remove).
// The list folder is made by the run's global setup with mkdtemp (a fresh, unpredictable name, mode 0700, never one that
// already existed) and is used only while it is a real dir (not a link) of this user with mode 0700, so another local
// user on a shared tmp dir can neither plant it nor steer what the teardown reads or removes.
// A made dir is never dropped: when listing it fails, the call removes that exact dir (the one it just made) and throws;
// a result whose path cannot be read, or that holds a newline (one record per line), throws; the teardown tries every step and every dir and names each failure.
// proof: test/structure/tmp-made-guard.test.ts
export const MADE_PREFIX = 'snote-test-made-';

/** The env var that names the run's list folder (set by test/helpers/global-leak-guard.ts). */
export const MADE_LIST_ENV = 'SNOTE_TEST_MADE_LIST';

/** Make a fresh list folder for one run: a new, uniquely named dir in os.tmpdir() with mode 0700. */
export function makeMadeList(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), MADE_PREFIX));
}

/** True only when `p` is a real dir (not a link) owned by this user with mode 0700. */
export function privateDir(p: string): boolean {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return false;
  }
  return st.isDirectory() && st.uid === process.getuid?.() && (st.mode & 0o777) === 0o700;
}

/** True only when `p` sits directly inside os.tmpdir(). */
function inTmp(p: string): boolean {
  return path.dirname(path.resolve(p)) === path.resolve(os.tmpdir());
}

/** The path a mkdtemp-family call returned: a string, a Buffer or a `{ path }` result (the Disposable forms). */
function madePath(made: unknown): string | undefined {
  if (typeof made === 'string') return made;
  if (Buffer.isBuffer(made)) return made.toString();
  if (made !== null && typeof made === 'object' && typeof (made as { path?: unknown }).path === 'string') return (made as { path: string }).path;
  return undefined;
}

/** Append a dir a test made to the run's list (only one directly inside os.tmpdir(), only into a private list folder). */
function listMade(made: unknown): void {
  const list = process.env[MADE_LIST_ENV];
  if (!list) return;
  const dir = madePath(made);
  if (dir === undefined) throw new Error(`the temp dir guard cannot read the path of this mkdtemp result: ${typeof made}`);
  if (!inTmp(dir)) return;
  if (dir.includes('\n')) throw new Error(`the temp dir guard cannot list a path that holds a newline: ${JSON.stringify(dir)}`);
  if (!privateDir(list)) throw new Error(`the temp dir list folder is not a private dir of this user (0700, not a link): ${list}`);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(path.join(list, `${process.pid}.txt`), flags, 0o600);
  try {
    fs.writeSync(fd, dir + '\n');
  } finally {
    fs.closeSync(fd);
  }
}

/** Remove the dir one mkdtemp call just made (only a real dir of this user directly in os.tmpdir()); true when it is gone. */
function removeJustMade(dir: string): boolean {
  try {
    const st = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (st === undefined) return true;
    if (!inTmp(dir) || !st.isDirectory() || st.uid !== process.getuid?.()) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return !fs.existsSync(dir);
  } catch {
    return false;
  }
}

/** List what one mkdtemp call made; when that fails, remove that dir and throw, so a made dir is listed or gone. */
function listOrRemove(made: unknown): void {
  try {
    listMade(made);
  } catch (e) {
    const dir = madePath(made);
    if (dir !== undefined && inTmp(dir) && !removeJustMade(dir)) {
      throw new Error(`${(e as Error).message}; the dir this call made is not removed: ${dir}`);
    }
    throw e;
  }
}

type AnyFn = (...args: unknown[]) => unknown;

/** Wrap one mkdtemp-family function (sync, callback or promise form) so it lists what it made. */
function tracked(real: AnyFn): AnyFn {
  return Object.assign(function (this: unknown, ...args: unknown[]): unknown {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      return real.call(this, ...args.slice(0, -1), (err: unknown, made: unknown) => {
        if (err) return (cb as AnyFn)(err, made);
        try {
          listOrRemove(made);
        } catch (e) {
          return (cb as AnyFn)(e);
        }
        return (cb as AnyFn)(null, made);
      });
    }
    const made = real.apply(this, args);
    if (made instanceof Promise) return made.then((m: unknown) => (listOrRemove(m), m));
    listOrRemove(made);
    return made;
  }, { snoteMadeTrack: true as const });
}

/** Make every mkdtemp* function of `mod` and `mod.promises` list each dir it makes directly in os.tmpdir(). */
export function trackMkdtemp(mod: typeof fs): void {
  for (const obj of [mod, mod.promises] as unknown as Record<string, unknown>[]) {
    for (const key of Object.keys(obj)) {
      const fn = obj[key];
      if (key.startsWith('mkdtemp') && typeof fn === 'function' && !('snoteMadeTrack' in fn)) obj[key] = tracked(fn as AnyFn);
    }
  }
}

/**
 * The listed dirs of the run that still exist directly inside os.tmpdir() (read only from a private list folder). Throws
 * on an entry of the list folder that is not a regular file, so no record is skipped unread.
 */
export function leftMade(list: string): string[] {
  if (!privateDir(list)) return [];
  const all = fs.readdirSync(list).flatMap((f) => {
    if (!fs.lstatSync(path.join(list, f)).isFile()) throw new Error(`an entry of the temp dir list folder is not a regular file: ${path.join(list, f)}`);
    return fs.readFileSync(path.join(list, f), 'utf8').split('\n');
  });
  return [...new Set(all.filter((d) => d !== '' && inTmp(d) && fs.lstatSync(d, { throwIfNoEntry: false }) !== undefined))].sort();
}

/**
 * Remove each listed dir that is a real dir (not a link) of this user directly inside os.tmpdir(), then the list folder
 * itself. Every dir is tried. `kept`: the listed paths it did not remove (a link, another owner's entry), which the
 * teardown names apart; `failed`: the paths whose removal failed (the list folder included), named on their own line.
 */
export function removeMade(list: string, left: string[]): { kept: string[]; failed: string[] } {
  if (!privateDir(list)) return { kept: left, failed: [] };
  const kept: string[] = [];
  const failed: string[] = [];
  for (const d of left) {
    try {
      const st = fs.lstatSync(d, { throwIfNoEntry: false });
      if (inTmp(d) && st?.isDirectory() && st.uid === process.getuid?.()) fs.rmSync(d, { recursive: true, force: true });
      else kept.push(d);
    } catch {
      failed.push(d);
    }
  }
  try {
    fs.rmSync(list, { recursive: true, force: true });
  } catch {
    failed.push(list);
  }
  return { kept, failed };
}
