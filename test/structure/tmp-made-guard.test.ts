/**
 * #319 part 3: the run's teardown fails on any temp dir a test made with the mkdtemp family directly in os.tmpdir()
 * that still exists at the end of the run (left behind, or made again by a writer that outlived its test), names every
 * leak in one error, and uses its list folder only while it is a private dir of this user.
 * A made dir is never dropped: a mkdtemp call whose listing fails removes that dir and throws, and the teardown tries
 * every step and every dir. Every test removes what it made in a finally, also when an expect fails.
 */
import fs from 'node:fs';
import { mkdtemp as mkdtempNamed } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import setup from '../helpers/global-leak-guard';
import { MADE_LIST_ENV, MADE_PREFIX, RUN_ID_ENV, leftMade, makeMadeList, removeMade, trackMkdtemp } from '../helpers/tmp-leak';

function rmAll(paths: (string | undefined)[]): void {
  for (const p of paths) if (p) fs.rmSync(p, { recursive: true, force: true });
}

/** The entries directly in os.tmpdir() whose name starts with `prefix`. */
function entries(prefix: string): string[] {
  return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(prefix)).map((n) => path.join(os.tmpdir(), n));
}

/** Put an env var back as it was: deleted when it was unset (assigning undefined would store the string `undefined`). */
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** A thrown fs error with this code, as the kernel would give it (forced, so the test does not depend on mode bits or uid 0). */
function fsError(code: string, what: string): Error {
  return Object.assign(new Error(`${code}: ${what} (forced by the test)`), { code });
}

function runTeardown(teardown: () => void): string {
  try {
    teardown();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

describe('#319 the run fails on a made temp dir left behind', () => {
  const runId = process.env[RUN_ID_ENV];
  const listEnv = process.env[MADE_LIST_ENV];
  const exitCode = process.exitCode;

  afterEach(() => {
    setEnv(RUN_ID_ENV, runId);
    setEnv(MADE_LIST_ENV, listEnv);
    process.exitCode = exitCode;
  });

  it('1: WHEN a test makes a dir with fs.mkdtempSync in os.tmpdir() and keeps it THEN leftMade lists exactly that dir, and once the dir is removed it lists nothing', () => {
    const list = makeMadeList();
    let kept: string | undefined;
    try {
      process.env[MADE_LIST_ENV] = list;
      kept = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard1-'));
      expect(leftMade(list)).toEqual([kept]);
      fs.rmSync(kept, { recursive: true, force: true });
      expect(leftMade(list)).toEqual([]);
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([kept, list]);
    }
  });

  it('2: WHEN the run teardown runs while a dir a test made with fs.mkdtempSync after the run started still exists THEN it throws `temp dirs made by tests and left behind by this run` naming that dir, the dir and the list folder are gone and the exit code is 1', () => {
    let list: string | undefined;
    let kept: string | undefined;
    try {
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      kept = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard2-'));
      const message = runTeardown(teardown);
      const code = process.exitCode;
      expect(message).toContain('temp dirs made by tests and left behind by this run');
      expect(message).toContain(kept);
      expect(fs.existsSync(kept)).toBe(false);
      expect(fs.existsSync(list)).toBe(false);
      expect(code).toBe(1);
    } finally {
      rmAll([kept, list]);
    }
  });

  it('3: WHEN a test makes one dir each with fs.mkdtemp (callback), fs.promises.mkdtemp and the named mkdtemp of node:fs/promises in os.tmpdir() THEN leftMade lists all `3`, and every mkdtemp* function of fs and fs.promises is tracked', async () => {
    const list = makeMadeList();
    const made: string[] = [];
    try {
      process.env[MADE_LIST_ENV] = list;
      made.push(await new Promise<string>((resolve, reject) => {
        fs.mkdtemp(path.join(os.tmpdir(), 'snote-guard3cb-'), (err, dir) => (err ? reject(err) : resolve(dir)));
      }));
      made.push(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'snote-guard3p-')));
      made.push(await mkdtempNamed(path.join(os.tmpdir(), 'snote-guard3n-')));
      expect(leftMade(list)).toEqual([...made].sort());
      const fns = [fs, fs.promises].flatMap((o) => Object.entries(o).filter(([k, v]) => k.startsWith('mkdtemp') && typeof v === 'function'));
      expect(fns.length).toBeGreaterThanOrEqual(3);
      expect(fns.filter(([, v]) => !('snoteMadeTrack' in v)).map(([k]) => k)).toEqual([]);
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([...made, list]);
    }
  });

  it('4: WHEN the list folder is no longer a private dir of this user (mode `0755`, or a link to a private dir) THEN mkdtempSync throws naming it and leaves no dir behind, and the teardown fails the run naming it, reads and removes nothing (a dir listed in it survives)', () => {
    let list: string | undefined;
    let list2: string | undefined;
    let victim: string | undefined;
    let target: string | undefined;
    try {
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      victim = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard4v-'));
      fs.chmodSync(list, 0o755);
      expect(() => fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard4x-'))).toThrow(`not a private dir of this user (0700, not a link): ${list}`);
      expect(entries('snote-guard4x-')).toEqual([]);
      const message = runTeardown(teardown);
      expect(message).toContain(`the temp dir list folder is not a private dir of this user (not read, not removed): ${list}`);
      expect(process.exitCode).toBe(1);
      expect(fs.existsSync(victim)).toBe(true);
      expect(fs.existsSync(list)).toBe(true);
      // the same through a link: a private dir of this user put where the list folder was
      process.exitCode = exitCode;
      setEnv(MADE_LIST_ENV, listEnv);
      const teardown2 = setup();
      list2 = process.env[MADE_LIST_ENV]!;
      target = list2 + '-target';
      fs.renameSync(list2, target);
      fs.symlinkSync(target, list2);
      fs.appendFileSync(path.join(target, 'planted.txt'), victim + '\n');
      const message2 = runTeardown(teardown2);
      expect(message2).toContain(`not a private dir of this user (not read, not removed): ${list2}`);
      expect(fs.existsSync(victim)).toBe(true);
      expect(fs.existsSync(target)).toBe(true);
    } finally {
      rmAll([victim, list, list2, target, ...entries('snote-guard4x-')]);
    }
  });

  it('5: WHEN both a dir a test made and a `snote-test-home-<run id>-` dir are left at the run end THEN the one teardown error names both, both are gone and the exit code is 1', () => {
    let list: string | undefined;
    let kept: string | undefined;
    let home: string | undefined;
    try {
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      kept = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard5-'));
      home = path.join(os.tmpdir(), 'snote-test-home-' + process.env[RUN_ID_ENV] + '-guard5');
      fs.mkdirSync(home);
      const message = runTeardown(teardown);
      expect(message).toContain(`temp dirs made by tests and left behind by this run (now removed): ${kept}`);
      expect(message).toMatch(/temp dirs left behind by this run \(now removed\): [^\n]*snote-test-home-[0-9a-f]+-guard5/);
      expect(fs.existsSync(kept)).toBe(false);
      expect(fs.existsSync(home)).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      rmAll([kept, home, list]);
    }
  });

  it('6: WHEN the run starts THEN its list folder is a new dir directly in os.tmpdir() named `snote-test-made-` plus a random part, mode `0700`, and two runs never share one', () => {
    const lists: string[] = [];
    try {
      lists.push(makeMadeList(), makeMadeList());
      for (const l of lists) {
        expect(path.dirname(l)).toBe(os.tmpdir());
        expect(path.basename(l).startsWith(MADE_PREFIX)).toBe(true);
        expect(fs.lstatSync(l).mode & 0o777).toBe(0o700);
      }
      expect(lists[0]).not.toBe(lists[1]);
      expect(leftMade(lists[0]!)).toEqual([]);
      removeMade(lists[0]!, []);
      expect(fs.existsSync(lists[0]!)).toBe(false);
    } finally {
      rmAll(lists);
    }
  });

  it('7: WHEN a listed dir is replaced by a link to a dir of this user before the run end THEN the teardown names the link on its own `not removed` line (never under `now removed`), fails the run, and the link and its target both still exist', () => {
    let target: string | undefined;
    let list: string | undefined;
    let link: string | undefined;
    try {
      target = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard7t-'));
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      link = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard7-'));
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(target, link);
      const message = runTeardown(teardown);
      expect(message).toContain(`temp dirs made by tests and left behind by this run (not removed: not a real dir of this user): ${link}`);
      expect(message).not.toContain('(now removed)');
      expect(process.exitCode).toBe(1);
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(target)).toBe(true);
    } finally {
      rmAll([link, target, list]);
    }
  });

  it('8: WHEN the worker list file `<pid>.txt` in the list folder is a link to a file of this user THEN mkdtempSync throws, leaves no dir behind and the file is unchanged', () => {
    let holder: string | undefined;
    let list: string | undefined;
    try {
      holder = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard8h-'));
      const victim = path.join(holder, 'victim.txt');
      fs.writeFileSync(victim, 'victim\n');
      list = makeMadeList();
      fs.symlinkSync(victim, path.join(list, `${process.pid}.txt`));
      process.env[MADE_LIST_ENV] = list;
      expect(() => fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard8x-'))).toThrow(/ELOOP/);
      expect(entries('snote-guard8x-')).toEqual([]);
      setEnv(MADE_LIST_ENV, listEnv);
      expect(fs.readFileSync(victim, 'utf8')).toBe('victim\n');
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([list, holder, ...entries('snote-guard8x-')]);
    }
  });

  it('9: WHEN the list folder is no longer a private dir of this user THEN fs.mkdtemp (callback), fs.promises.mkdtemp and the named mkdtemp of node:fs/promises each fail naming it and leave no dir behind', async () => {
    const list = makeMadeList();
    try {
      process.env[MADE_LIST_ENV] = list;
      fs.chmodSync(list, 0o755);
      const cbErr = await new Promise<unknown>((resolve) => {
        fs.mkdtemp(path.join(os.tmpdir(), 'snote-guard9cb-'), (err) => resolve(err));
      });
      expect(String(cbErr)).toContain(`not a private dir of this user (0700, not a link): ${list}`);
      await expect(fs.promises.mkdtemp(path.join(os.tmpdir(), 'snote-guard9p-'))).rejects.toThrow(`not a private dir of this user (0700, not a link): ${list}`);
      await expect(mkdtempNamed(path.join(os.tmpdir(), 'snote-guard9n-'))).rejects.toThrow(`not a private dir of this user (0700, not a link): ${list}`);
      expect(entries('snote-guard9')).toEqual([]);
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([list, ...entries('snote-guard9')]);
    }
  });

  it('10: WHEN a tracked mkdtemp function returns a result whose path the guard cannot read THEN the call throws `cannot read the path`', () => {
    const list = makeMadeList();
    try {
      process.env[MADE_LIST_ENV] = list;
      const fake = { mkdtempSync: () => 42, promises: {} } as unknown as typeof fs;
      trackMkdtemp(fake);
      expect(() => fake.mkdtempSync('x')).toThrow('the temp dir guard cannot read the path of this mkdtemp result: number');
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([list]);
    }
  });

  it('11: WHEN the list folder holds an entry that is not a regular file and a `snote-test-home-<run id>-` dir is left THEN the one teardown error names the list folder as not read, the list folder is kept, and the home dir is still named and removed', () => {
    let list: string | undefined;
    let home: string | undefined;
    try {
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      fs.mkdirSync(path.join(list, 'sub'));
      home = path.join(os.tmpdir(), 'snote-test-home-' + process.env[RUN_ID_ENV] + '-guard11');
      fs.mkdirSync(home);
      const message = runTeardown(teardown);
      expect(message).toContain(`the temp dir list folder cannot be read (not removed): ${list}: an entry of the temp dir list folder is not a regular file: ${path.join(list, 'sub')}`);
      expect(message).toMatch(/temp dirs left behind by this run \(now removed\): [^\n]*snote-test-home-[0-9a-f]+-guard11/);
      expect(fs.existsSync(list)).toBe(true);
      expect(fs.existsSync(home)).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      rmAll([home, list]);
    }
  });

  it('12: WHEN removing one left dir of each kind fails (fs.rmSync throws EACCES for it, forced, so also under uid 0) THEN the teardown names each on its own `the removal failed` line, still removes the other dirs and the list folder, and fails the run', () => {
    let list: string | undefined;
    const dirs: string[] = [];
    const realRm = fs.rmSync;
    const rmSpy = vi.spyOn(fs, 'rmSync');
    try {
      const teardown = setup();
      list = process.env[MADE_LIST_ENV]!;
      const stuck = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard12a-'));
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard12b-'));
      const home = path.join(os.tmpdir(), 'snote-test-home-' + process.env[RUN_ID_ENV] + '-guard12a');
      const home2 = path.join(os.tmpdir(), 'snote-test-home-' + process.env[RUN_ID_ENV] + '-guard12b');
      fs.mkdirSync(home);
      fs.mkdirSync(home2);
      dirs.push(stuck, other, home, home2);
      const failing = new Set([stuck, home]);
      rmSpy.mockImplementation((p, o) => {
        if (failing.has(String(p))) throw fsError('EACCES', `rm ${String(p)}`);
        realRm(p, o);
      });
      const message = runTeardown(teardown);
      rmSpy.mockRestore();
      expect(message).toContain(`temp dirs made by tests and left behind by this run (not removed: the removal failed): ${stuck}`);
      expect(message).toContain(`temp dirs made by tests and left behind by this run (now removed): ${other}`);
      expect(message).toMatch(/temp dirs left behind by this run \(not removed: the removal failed\): snote-test-home-[0-9a-f]+-guard12a/);
      expect(message).toMatch(/temp dirs left behind by this run \(now removed\): snote-test-home-[0-9a-f]+-guard12b/);
      expect(fs.existsSync(other)).toBe(false);
      expect(fs.existsSync(home2)).toBe(false);
      expect(fs.existsSync(list)).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      rmSpy.mockRestore();
      rmAll([...dirs, list]);
    }
  });

  it('13: WHEN the run setup fails after it made its list folder (reading os.tmpdir() throws EACCES, forced, so also under uid 0) THEN it removes that list folder and throws, and the run id and list env vars are unchanged', () => {
    const tmp = process.env.TMPDIR;
    let holder: string | undefined;
    const realReaddir = fs.readdirSync;
    const readdirSpy = vi.spyOn(fs, 'readdirSync');
    try {
      holder = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard13-'));
      const shut = holder;
      readdirSpy.mockImplementation(((p: fs.PathLike, o?: unknown) => {
        if (String(p) === shut) throw fsError('EACCES', `scandir ${shut}`);
        return realReaddir(p, o as undefined);
      }) as typeof fs.readdirSync);
      process.env.TMPDIR = holder;
      expect(() => setup()).toThrow(/EACCES/);
      setEnv('TMPDIR', tmp);
      readdirSpy.mockRestore();
      expect(fs.readdirSync(holder)).toEqual([]);
      expect(process.env[MADE_LIST_ENV]).toBe(listEnv);
      expect(process.env[RUN_ID_ENV]).toBe(runId);
    } finally {
      setEnv('TMPDIR', tmp);
      readdirSpy.mockRestore();
      rmAll([holder]);
    }
  });

  it('14: WHEN a tracked mkdtempSync makes a dir whose name holds a newline (a list record cannot hold it) THEN the call throws `holds a newline` and leaves no dir behind', () => {
    const list = makeMadeList();
    try {
      process.env[MADE_LIST_ENV] = list;
      expect(() => fs.mkdtempSync(path.join(os.tmpdir(), 'snote-guard14\n-'))).toThrow('the temp dir guard cannot list a path that holds a newline');
      expect(entries('snote-guard14')).toEqual([]);
      expect(fs.readdirSync(list)).toEqual([]);
    } finally {
      setEnv(MADE_LIST_ENV, listEnv);
      rmAll([list, ...entries('snote-guard14')]);
    }
  });
});
