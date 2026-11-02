/**
 * #278: a test run once left a commit by author `x` in the enclosing worktree (it added scripts/export.d/exclude/probe-a and
 * probe-b). git finds the repo from GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE in the environment before it looks at `cwd`, and by
 * climbing up from the scratch dir, so a scratch repo with a correct `cwd` can still write into the real one.
 * test/setup.ts calls isolateGitEnv(); these tests fail if that call goes, or if the helper stops closing either route.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { isolateGitEnv, REPO_LOCATING_VARS } from '../helpers/git-isolation';

const root = mkdtempSync(join(tmpdir(), 'snote-278-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const ID = ['-c', 'user.name=x', '-c', 'user.email=x@x', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const run = (cwd: string, env: NodeJS.ProcessEnv, ...a: string[]) => spawnSync('git', [...ID, ...a], { cwd, env, encoding: 'utf8' });
// the test's own git calls use a clean env, so a missing fix fails the assertions and never writes into the enclosing repo
const CLEAN: NodeJS.ProcessEnv = { ...process.env };
for (const k of REPO_LOCATING_VARS) delete CLEAN[k];
const head = (cwd: string): string => run(cwd, CLEAN, 'rev-parse', 'HEAD').stdout.trim();

describe('#278 tests never commit into the enclosing repo', () => {
  it('1: WHEN a test file runs THEN none of `GIT_DIR`, `GIT_WORK_TREE` or `GIT_INDEX_FILE` is set and `GIT_CEILING_DIRECTORIES` is the scratch root', () => {
    for (const k of REPO_LOCATING_VARS.filter((v) => v !== 'GIT_CEILING_DIRECTORIES')) expect(process.env[k], k).toBeUndefined();
    expect(process.env.GIT_CEILING_DIRECTORIES).toBe(tmpdir());
  });

  it('2: WHEN the environment carries GIT_DIR of a real repo and a scratch dir sits under it THEN `isolateGitEnv` leaves HEAD and the file list of the real repo unchanged after `git add -A` and `git commit` run with that env', () => {
    const real = join(root, 'real');
    mkdirSync(real);
    writeFileSync(join(real, 'a.txt'), 'a\n');
    for (const a of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-qm', 'base']]) expect(run(real, CLEAN, ...a).status).toBe(0);
    const before = head(real);
    const scratch = join(real, 'sub', 'scratch');
    mkdirSync(scratch, { recursive: true });
    writeFileSync(join(scratch, 'probe-a'), 'p\n');
    // the leak: inherited repo variables and a scratch dir below the repo
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_DIR: join(real, '.git'), GIT_WORK_TREE: real };
    isolateGitEnv(env, join(real, 'sub'));
    expect(env.GIT_DIR).toBeUndefined();
    expect(run(scratch, env, 'add', '-A').status).not.toBe(0);
    expect(run(scratch, env, 'commit', '-qm', 'probe').status).not.toBe(0);
    expect(head(real)).toBe(before);
    expect(run(real, CLEAN, 'ls-files').stdout.trim()).toBe('a.txt');
    // and an init in the scratch dir stays its own repo
    expect(run(scratch, env, 'init', '-q', '-b', 'main').status).toBe(0);
    expect(run(scratch, env, 'add', '-A').status).toBe(0);
    expect(run(scratch, env, 'commit', '-qm', 'own').status).toBe(0);
    expect(head(real)).toBe(before);
  });

  it('3: WHEN test/setup.ts is read THEN it calls `isolateGitEnv()` before any test code runs', () => {
    expect(readFileSync(resolve('test/setup.ts'), 'utf8')).toMatch(/^isolateGitEnv\(\);$/m);
  });
});
