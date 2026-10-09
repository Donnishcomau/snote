/**
 * T386: the once-a-day anonymous remote update check (U2 core).
 * Real temp git repos stand in for the plugin clone and its origin;
 * a fake runner records calls wherever the network would be.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  checkRemoteUpdate,
  updateCheckEnabled,
  type GitRunner,
} from '../../src/core/update-check';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'x',
  GIT_AUTHOR_EMAIL: 'x@x',
  GIT_COMMITTER_NAME: 'x',
  GIT_COMMITTER_EMAIL: 'x@x',
};

// Ignore the developer's global config (init.defaultBranch,
// push.autoSetupRemote, ...) so the fixture is reproducible.
const GIT_ENV = { ...process.env, ...GIT_IDENTITY, GIT_CONFIG_GLOBAL: '/dev/null' };

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: GIT_ENV }).toString().trim();

/**
 * Build: a bare origin (HEAD -> refs/heads/main) holding commit A, a
 * clone of it (the "plugin clone", at A), then a second commit B
 * pushed to origin from the seed's main. The clone's HEAD stays at A
 * while `git ls-remote origin HEAD` there reports B.
 */
const makeFixture = (): { cloneDir: string; stateDir: string; headA: string; headB: string } => {
  const origin = path.join(tmpRoot, 'origin.git');
  const seed = path.join(tmpRoot, 'seed');
  git(tmpRoot, 'init', '-q', '--bare', '-b', 'main', origin);
  git(tmpRoot, 'init', '-q', '-b', 'main', seed);
  git(seed, 'remote', 'add', 'origin', origin);
  fs.writeFileSync(path.join(seed, 'file.txt'), 'A\n');
  git(seed, 'add', 'file.txt');
  git(seed, 'commit', '-q', '-m', 'A');
  git(seed, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  const headA = git(seed, 'rev-parse', 'HEAD');
  const cloneDir = path.join(tmpRoot, 'clone');
  git(tmpRoot, 'clone', '-q', origin, cloneDir);
  fs.writeFileSync(path.join(seed, 'file.txt'), 'B\n');
  git(seed, 'commit', '-q', '-am', 'B');
  git(seed, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  const headB = git(seed, 'rev-parse', 'HEAD');
  const stateDir = path.join(tmpRoot, 'state');
  return { cloneDir, stateDir, headA, headB };
};

const cachePath = (stateDir: string): string => path.join(stateDir, 'update-check.json');

const readCache = (stateDir: string): { checkedAt: number; remoteHead: string } =>
  JSON.parse(fs.readFileSync(cachePath(stateDir), 'utf8'));

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t386-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('update-check', () => {
  it("1: WHEN a temp clone at commit A has a temp bare origin at commit B and no cache (now `1000000`, real git) THEN it returns `{ state: 'available' }` and `update-check.json` has `{ checkedAt: 1000000, remoteHead: <B> }`", async () => {
    const { cloneDir, stateDir, headA, headB } = makeFixture();
    expect(headA).not.toBe(headB);

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'available' });
    expect(readCache(stateDir)).toEqual({ checkedAt: 1000000, remoteHead: headB });
  });

  it("2: WHEN the origin head equals the clone head THEN it returns `{ state: 'current' }`", async () => {
    const origin = path.join(tmpRoot, 'origin.git');
    const seed = path.join(tmpRoot, 'seed');
    git(tmpRoot, 'init', '-q', '--bare', '-b', 'main', origin);
    git(tmpRoot, 'init', '-q', '-b', 'main', seed);
    git(seed, 'remote', 'add', 'origin', origin);
    fs.writeFileSync(path.join(seed, 'file.txt'), 'A\n');
    git(seed, 'add', 'file.txt');
    git(seed, 'commit', '-q', '-m', 'A');
    git(seed, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
    const headA = git(seed, 'rev-parse', 'HEAD');
    const cloneDir = path.join(tmpRoot, 'clone');
    git(tmpRoot, 'clone', '-q', origin, cloneDir);
    expect(git(cloneDir, 'ls-remote', 'origin', 'HEAD').split('\t')[0]).toBe(headA);
    const stateDir = path.join(tmpRoot, 'state');

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'current' });
  });

  it("3: WHEN a fake runner is used and the cache is 2 h old with `remoteHead` `bbb` while `rev-parse` gives `aaa` THEN it returns `{ state: 'available' }` and no runner call has `args[0]` equal to `ls-remote`", async () => {
    const cloneDir = path.join(tmpRoot, 'clone');
    fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
    const stateDir = path.join(tmpRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const now = 1000000 + 2 * 60 * 60 * 1000;
    fs.writeFileSync(
      cachePath(stateDir),
      JSON.stringify({ checkedAt: 1000000, remoteHead: 'bbb' })
    );
    const calls: string[][] = [];
    const run: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'aaa\n' };
      }
      return { code: 0, stdout: 'ccc\tHEAD\n' };
    };

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now,
      run,
    });

    expect(result).toEqual({ state: 'available' });
    expect(calls.some((args) => args[0] === 'ls-remote')).toBe(false);
    expect(calls[0]).toEqual(['rev-parse', 'HEAD']);
  });

  it("4: WHEN the cache is 25 h old THEN `ls-remote` runs `1` time with args `['ls-remote', 'https://example.invalid/snote.git', 'HEAD']`, `timeoutMs` `5000`, env `GIT_TERMINAL_PROMPT` `'0'`, and the cache `checkedAt` equals now", async () => {
    const cloneDir = path.join(tmpRoot, 'clone');
    fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(cloneDir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
    );
    const stateDir = path.join(tmpRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const now = 1000000 + 25 * 60 * 60 * 1000;
    fs.writeFileSync(
      cachePath(stateDir),
      JSON.stringify({ checkedAt: 1000000, remoteHead: 'bbb' })
    );
    const calls: {
      args: string[];
      timeoutMs: number;
      terminalPrompt: string | undefined;
    }[] = [];
    const run: GitRunner = async (args, opts) => {
      calls.push({
        args,
        timeoutMs: opts.timeoutMs,
        terminalPrompt: opts.env.GIT_TERMINAL_PROMPT,
      });
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'aaa\n' };
      }
      return { code: 0, stdout: 'bbb\tHEAD\n' };
    };

    const result = await checkRemoteUpdate({ cloneDir, stateDir, env: {}, now, run });

    expect(result).toEqual({ state: 'available' });
    const lsRemote = calls.filter((c) => c.args[0] === 'ls-remote');
    expect(lsRemote).toHaveLength(1);
    expect(lsRemote[0].args).toEqual([
      'ls-remote',
      'https://example.invalid/snote.git',
      'HEAD',
    ]);
    expect(lsRemote[0].timeoutMs).toBe(5000);
    expect(lsRemote[0].terminalPrompt).toBe('0');
    expect(readCache(stateDir).checkedAt).toBe(now);
  });

  it("5: WHEN `ls-remote` returns code `128`, and again when the clone dir has no `.git` THEN it returns `{ state: 'unknown' }`, `update-check.json` does not exist, and the no-`.git` case made `0` runner calls", async () => {
    const cloneDir = path.join(tmpRoot, 'clone');
    fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
    const stateDir = path.join(tmpRoot, 'state');
    const calls: string[][] = [];
    const failRemote: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'ls-remote') {
        return { code: 128, stdout: '' };
      }
      return { code: 0, stdout: 'aaa\n' };
    };

    const failing = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run: failRemote,
    });

    expect(failing).toEqual({ state: 'unknown' });
    expect(fs.existsSync(cachePath(stateDir))).toBe(false);

    const missingClone = path.join(tmpRoot, 'not-a-repo');
    fs.mkdirSync(missingClone, { recursive: true });
    const freshState = path.join(tmpRoot, 'state2');
    const noGitCalls: string[][] = [];
    const counting: GitRunner = async (args) => {
      noGitCalls.push(args);
      return { code: 0, stdout: 'aaa\n' };
    };

    const missing = await checkRemoteUpdate({
      cloneDir: missingClone,
      stateDir: freshState,
      env: {},
      now: 1000000,
      run: counting,
    });

    expect(missing).toEqual({ state: 'unknown' });
    expect(fs.existsSync(cachePath(freshState))).toBe(false);
    expect(noGitCalls).toHaveLength(0);
  });

  it("6: WHEN env `SNOTE_UPDATE_CHECK` is `off`, and again `0` THEN it returns `{ state: 'disabled' }` with `0` runner calls, and `updateCheckEnabled({})` is `true`", async () => {
    const { cloneDir, stateDir } = makeFixture();
    const calls: string[][] = [];
    const run: GitRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: 'aaa\n' };
    };

    expect(
      await checkRemoteUpdate({ cloneDir, stateDir, env: { SNOTE_UPDATE_CHECK: 'off' }, now: 1000000, run })
    ).toEqual({ state: 'disabled' });
    expect(
      await checkRemoteUpdate({ cloneDir, stateDir, env: { SNOTE_UPDATE_CHECK: '0' }, now: 1000000, run })
    ).toEqual({ state: 'disabled' });
    expect(calls).toHaveLength(0);
    expect(updateCheckEnabled({})).toBe(true);
  });
});
