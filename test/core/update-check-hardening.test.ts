/**
 * T415: the once-a-day update check must never let the plugin
 * clone's own `.git/config` run anything. Real temp git clones carry
 * configs whose `remote.origin.uploadpack`, `core.sshCommand`,
 * `credential.helper` (`!` script) and `core.fsmonitor` all create a
 * `marker` file if git ever honours them, plus `ext::` and ssh urls;
 * a fake runner records calls wherever the network would be.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  checkRemoteUpdate,
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

const cachePath = (stateDir: string): string => path.join(stateDir, 'update-check.json');

/**
 * Real-git fixture: a bare origin (HEAD -> refs/heads/main) holding
 * commit A, a clone of it (the "plugin clone", at A), then commit B
 * pushed to origin, so a safe check answers `available`
 * (headA !== headB).
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

/**
 * A clone standing in for a hostile plugin clone: just a `.git`
 * directory holding the given raw `config` text, plus a fresh empty
 * state dir. No git runs when it is built.
 */
const makeFakeClone = (config: string): { cloneDir: string; stateDir: string } => {
  const cloneDir = path.join(tmpRoot, 'clone');
  fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(cloneDir, '.git', 'config'), config);
  const stateDir = path.join(tmpRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  return { cloneDir, stateDir };
};

/** Executable that creates `marker` wherever git decides to run it. */
const markerScript = (): string => {
  const script = path.join(tmpRoot, 'evil.sh');
  fs.writeFileSync(script, '#!/bin/sh\ntouch "$SNOTE_MARKER"\n');
  fs.chmodSync(script, 0o755);
  return script;
};

/** Rev-parse answers `aaa\n`; anything else `bbb\tHEAD\n`; counts calls. */
const makeRunner = (): { run: GitRunner; calls: string[][] } => {
  const calls: string[][] = [];
  const run: GitRunner = async (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      return { code: 0, stdout: 'aaa\n' };
    }
    return { code: 0, stdout: 'bbb\tHEAD\n' };
  };
  return { run, calls };
};

let tmpRoot: string;
let prevMarker: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t415-'));
  prevMarker = process.env.SNOTE_MARKER;
  process.env.SNOTE_MARKER = path.join(tmpRoot, 'marker');
});

afterEach(() => {
  if (prevMarker === undefined) {
    delete process.env.SNOTE_MARKER;
  } else {
    process.env.SNOTE_MARKER = prevMarker;
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('update-check-hardening', () => {
  it("1: WHEN the real-git fixture clone (at A, origin at B) has `remote.origin.uploadpack`, `core.sshCommand`, `credential.helper` (`!` plus the script) and `core.fsmonitor` set to a script that creates `marker` THEN `checkRemoteUpdate` returns `{ state: 'available' }` and `marker` does not exist", async () => {
    const { cloneDir, stateDir, headA, headB } = makeFixture();
    expect(headA).not.toBe(headB);
    const script = markerScript();
    git(cloneDir, 'config', 'remote.origin.uploadpack', script);
    git(cloneDir, 'config', 'core.sshCommand', script);
    git(cloneDir, 'config', 'credential.helper', `!${script}`);
    git(cloneDir, 'config', 'core.fsmonitor', script);

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'available' });
    expect(fs.existsSync(path.join(tmpRoot, 'marker'))).toBe(false);
  });

  it("2: WHEN the clone's origin url is `ext::<script> %S` and `protocol.ext.allow` is `always` THEN it returns `{ state: 'unknown' }`, `marker` does not exist and no `update-check.json` was written", async () => {
    const script = markerScript();
    const { cloneDir, stateDir } = makeFakeClone(
      '[remote "origin"]\n' +
        `\turl = ext::${script} %S\n` +
        '[protocol "ext"]\n' +
        '\tallow = always\n'
    );

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'unknown' });
    expect(fs.existsSync(path.join(tmpRoot, 'marker'))).toBe(false);
    expect(fs.existsSync(cachePath(stateDir))).toBe(false);
  });

  it("3: WHEN the origin url is `ssh://example.invalid/x.git` with `core.sshCommand` set to the script, and a counting fake runner is used THEN it returns `{ state: 'unknown' }`, the runner saw no `ls-remote` call, and `marker` does not exist", async () => {
    const script = markerScript();
    const { cloneDir, stateDir } = makeFakeClone(
      '[remote "origin"]\n\turl = ssh://example.invalid/x.git\n' +
        `[core]\n\tsshCommand = ${script}\n`
    );
    const { run, calls } = makeRunner();

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'unknown' });
    expect(calls.filter((args) => args[0] === 'ls-remote')).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpRoot, 'marker'))).toBe(false);
  });

  it("4: WHEN a fake runner is used, `.git/config` has url `https://example.invalid/snote.git` and env is `{ GIT_SSH_COMMAND: 'x', GIT_DIR: '/x', GIT_CONFIG_PARAMETERS: 'y', HOME: '/h' }` THEN the ls-remote args are `['ls-remote', 'https://example.invalid/snote.git', 'HEAD']`, its cwd is not the clone dir, and every call's env has `HOME` `/h`, `GIT_TERMINAL_PROMPT` `0` and no other key starting with `GIT_`", async () => {
    const { cloneDir, stateDir } = makeFakeClone(
      '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
    );
    const calls: {
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
    }[] = [];
    const run: GitRunner = async (args, opts) => {
      calls.push({ args, cwd: opts.cwd, env: opts.env });
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'aaa\n' };
      }
      return { code: 0, stdout: 'bbb\tHEAD\n' };
    };

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { GIT_SSH_COMMAND: 'x', GIT_DIR: '/x', GIT_CONFIG_PARAMETERS: 'y', HOME: '/h' },
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'available' });
    const lsRemote = calls.filter((c) => c.args[0] === 'ls-remote');
    expect(lsRemote).toHaveLength(1);
    expect(lsRemote[0].args).toEqual([
      'ls-remote',
      'https://example.invalid/snote.git',
      'HEAD',
    ]);
    expect(lsRemote[0].cwd).not.toBe(cloneDir);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.env.HOME).toBe('/h');
      expect(call.env.GIT_TERMINAL_PROMPT).toBe('0');
      expect(Object.keys(call.env).filter((k) => k.startsWith('GIT_'))).toEqual([
        'GIT_TERMINAL_PROMPT',
      ]);
    }
  });
});
