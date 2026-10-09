/**
 * T416: the update check reports `available` only when the remote
 * head is something the clone does not already have. Real temp git
 * repos (origin ahead / clone ahead / diverged, fetched or not) run
 * through the real `defaultGitRunner`, so every git call — including
 * the ancestor probes — happens for real.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { checkRemoteUpdate } from '../../src/core/update-check';

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

/**
 * Build: a bare origin (HEAD -> refs/heads/main) holding commit A and
 * a clone of it (the "plugin clone") at A. Returns the clone dir, a
 * fresh state dir, a function that commits B in the seed and pushes
 * it to origin (returning B), and B's parent (always A).
 */
const makeFixture = (): {
  cloneDir: string;
  stateDir: string;
  pushB: () => string;
  headA: string;
} => {
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
  const pushB = (): string => {
    fs.writeFileSync(path.join(seed, 'file.txt'), 'B\n');
    git(seed, 'commit', '-q', '-am', 'B');
    git(seed, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
    return git(seed, 'rev-parse', 'HEAD');
  };
  const stateDir = path.join(tmpRoot, 'state');
  return { cloneDir, stateDir, pushB, headA };
};

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t416-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('update-ahead', () => {
  it("1: WHEN the clone has one local commit on top of origin's unchanged head THEN `checkRemoteUpdate` returns `{ state: 'current' }`", async () => {
    const { cloneDir, stateDir } = makeFixture();
    fs.writeFileSync(path.join(cloneDir, 'local.txt'), 'L\n');
    git(cloneDir, 'add', 'local.txt');
    git(cloneDir, 'commit', '-q', '-m', 'local');
    // origin's head is still the clone's ancestor: local commit only.

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'current' });
  });

  it("2: WHEN origin moved to B, the clone fetched B but stays at A and then made a local commit THEN it returns `{ state: 'current' }`", async () => {
    const { cloneDir, stateDir, pushB } = makeFixture();
    const headB = pushB();
    git(cloneDir, 'fetch', '-q', 'origin');
    expect(git(cloneDir, 'rev-parse', 'HEAD')).not.toBe(headB);
    fs.writeFileSync(path.join(cloneDir, 'local.txt'), 'L\n');
    git(cloneDir, 'add', 'local.txt');
    git(cloneDir, 'commit', '-q', '-m', 'local');
    // Diverged with B fetched: HEAD is not an ancestor of B.

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'current' });
  });

  it("3: WHEN origin moved to B and the clone fetched B but stays at A THEN it returns `{ state: 'available' }`", async () => {
    const { cloneDir, stateDir, pushB } = makeFixture();
    const headB = pushB();
    git(cloneDir, 'fetch', '-q', 'origin');
    expect(git(cloneDir, 'rev-parse', 'HEAD')).not.toBe(headB);

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'available' });
  });

  it("4: WHEN origin moved to B and the clone did not fetch THEN it returns `{ state: 'available' }`", async () => {
    const { cloneDir, stateDir, pushB } = makeFixture();
    pushB();
    // No fetch: the clone never got B, and the check itself never fetches.

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: { ...process.env },
      now: 1000000,
    });

    expect(result).toEqual({ state: 'available' });
  });
});
