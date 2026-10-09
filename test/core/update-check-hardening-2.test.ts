/**
 * T471: hardening of the T415/T416 update check (F118, F119). The
 * `ls-remote` call must run from `/` so no git config above the temp
 * dir is ever read, a git step killed by its timeout must read as
 * `unknown` instead of a fake exit code, and a remote head that is
 * not 1 to 64 lowercase hex characters (from `ls-remote` or from the
 * cache file) is never handed to git, never cached, and never used.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  checkRemoteUpdate,
  defaultGitRunner,
  type GitRunner,
} from '../../src/core/update-check';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'x',
  GIT_AUTHOR_EMAIL: 'x@x',
  GIT_COMMITTER_NAME: 'x',
  GIT_COMMITTER_EMAIL: 'x@x',
};

// Ignore the developer's global config (init.defaultBranch, ...) so
// the fixture is reproducible.
const GIT_ENV = { ...process.env, ...GIT_IDENTITY, GIT_CONFIG_GLOBAL: '/dev/null' };

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: GIT_ENV }).toString().trim();

const HEAD_A = '1111111111111111111111111111111111111111';
const HEAD_B = '2222222222222222222222222222222222222222';

const cachePath = (stateDir: string): string => path.join(stateDir, 'update-check.json');

/**
 * A clone standing in for the plugin clone: just a `.git` directory
 * holding the given raw `config` text (a safe https origin by
 * default), plus a fresh empty state dir. No git runs when it is
 * built.
 */
const makeFakeClone = (
  config = '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
): { cloneDir: string; stateDir: string } => {
  const cloneDir = path.join(tmpRoot, 'clone');
  fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(cloneDir, '.git', 'config'), config);
  const stateDir = path.join(tmpRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  return { cloneDir, stateDir };
};

/**
 * A runner double answering per command: `ls-remote` the given head
 * text, `rev-parse` a head differing from it, `cat-file` code 0,
 * `merge-base` the given code. Every call is recorded.
 */
const makeRunner = (answers: {
  lsRemote: string;
  mergeBase: number | null;
}): { run: GitRunner; calls: { args: string[]; cwd: string }[] } => {
  const calls: { args: string[]; cwd: string }[] = [];
  const run: GitRunner = async (args, opts) => {
    calls.push({ args, cwd: opts.cwd });
    if (args[0] === 'ls-remote') {
      return { code: 0, stdout: answers.lsRemote };
    }
    if (args[0] === 'rev-parse') {
      return { code: 0, stdout: `${HEAD_A}\n` };
    }
    if (args[0] === 'merge-base') {
      return { code: answers.mergeBase, stdout: '' };
    }
    return { code: 0, stdout: '' };
  };
  return { run, calls };
};

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t471-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('update-check-hardening-2', () => {
  it("1: WHEN `checkRemoteUpdate` runs with a recording runner double THEN the call whose `args[0]` is `ls-remote` has `cwd` equal to `/`, and src/core/update-check.ts contains no `cwd: os.tmpdir()`", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const { run, calls } = makeRunner({
      lsRemote: `${HEAD_B}\tHEAD\n`,
      mergeBase: 1,
    });

    await checkRemoteUpdate({ cloneDir, stateDir, env: {}, now: 1000000, run });

    const lsRemote = calls.filter((c) => c.args[0] === 'ls-remote');
    expect(lsRemote).toHaveLength(1);
    expect(lsRemote[0].cwd).toBe('/');

    const source = await readFile('src/core/update-check.ts', 'utf8');
    expect(source).not.toContain('cwd: os.tmpdir()');
  });

  it("2: WHEN the double answers `ls-remote` with a 40-hex head, `rev-parse` with a different 40-hex head, `cat-file` with code 0 and `merge-base` with code `null` THEN the result is `{ state: 'unknown' }`", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const { run } = makeRunner({ lsRemote: `${HEAD_B}\tHEAD\n`, mergeBase: null });

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'unknown' });
  });

  it("3: WHEN the double answers `ls-remote` with `not-a-sha\\tHEAD` THEN the result is `{ state: 'unknown' }` and no `update-check.json` is written in the state dir", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const { run } = makeRunner({ lsRemote: 'not-a-sha\tHEAD\n', mergeBase: 1 });

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'unknown' });
    expect(fs.existsSync(cachePath(stateDir))).toBe(false);
  });

  it("4: WHEN the state dir holds a fresh `update-check.json` whose `remoteHead` is `zzzz` THEN the double receives an `ls-remote` call (the bad cache is ignored)", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    fs.writeFileSync(
      cachePath(stateDir),
      JSON.stringify({ checkedAt: 1000000, remoteHead: 'zzzz' })
    );
    const { run, calls } = makeRunner({
      lsRemote: `${HEAD_B}\tHEAD\n`,
      mergeBase: 1,
    });

    await checkRemoteUpdate({ cloneDir, stateDir, env: {}, now: 2000000, run });

    expect(calls.filter((c) => c.args[0] === 'ls-remote')).toHaveLength(1);
  });

  it("5: WHEN `defaultGitRunner(['definitely-not-a-git-command'], { cwd: '/', timeoutMs: 5000, env: process.env })` resolves THEN its code is a number other than 0 and other than `null`", async () => {
    const res = await defaultGitRunner(['definitely-not-a-git-command'], {
      cwd: '/',
      timeoutMs: 5000,
      env: process.env,
    });

    expect(res.code).not.toBeNull();
    expect(typeof res.code).toBe('number');
    expect(res.code).not.toBe(0);
  });
});
