/**
 * Issue #210 part A (rule R1): the release download of bar-update stops at a byte cap
 * (default 32 MiB, lowered by SNOTE_UPDATE_FETCH_CAP) and leaves nothing behind in the clone's .git.
 * Each case runs the real script against a real local bare origin, a throwaway clone and a stand-in setup.
 * RUNNER: Linux only (bash, GNU tools, ulimit).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const MIB = 1024 * 1024;
const CAP = '1048576';

const SETUP_STUB = `#!/bin/bash
if [ "\${1:-}" = "--check" ]; then exit 1; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
mkdir -p "$XDG_DATA_HOME/omarchy-snote-plugin/app"
cp "$d/plugin-dist/VERSION" "$XDG_DATA_HOME/omarchy-snote-plugin/app/VERSION"
`;

let root: string;
let counter = 0;
const templates: Record<string, { origin: string; template: string }> = {};

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(REAL_GIT, args, {
    cwd, encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '', HOME: join(root, 'fixture-home'),
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function put(file: string, text: string | Buffer, mode = 0o644): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, mode);
}

/** A local bare origin with v0.2.6 and v0.2.7 (v0.2.7 adds `extra` random files of `size` bytes) and a clone at v0.2.6. */
function build(name: string, extra: number, size: number): void {
  const origin = join(root, `${name}-origin.git`);
  const work = join(root, `${name}-work`);
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', work);
  put(join(work, 'plugin-dist', 'VERSION'), '0.2.6\n');
  put(join(work, 'packaging', 'omarchy', 'setup'), SETUP_STUB, 0o755);
  put(join(work, 'packaging', 'omarchy', 'bar-update'), readFileSync(SCRIPT, 'utf8'), 0o755);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release 0.2.6');
  git(work, 'tag', 'v0.2.6');
  git(work, 'push', '-q', origin, 'main', 'v0.2.6');
  const template = join(root, `${name}-template`);
  git(root, 'clone', '-q', '--no-tags', origin, template);
  git(template, 'config', 'remote.origin.url', origin);
  put(join(work, 'plugin-dist', 'VERSION'), '0.2.7\n');
  for (let i = 0; i < extra; i++) put(join(work, 'blobs', `blob-${i}.bin`), randomBytes(size));
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release 0.2.7');
  git(work, 'tag', '-a', '-m', 'release 0.2.7', 'v0.2.7');
  git(work, 'push', '-q', origin, 'main', '--tags');
  rmSync(work, { recursive: true, force: true }); // keep the temp footprint small: only the origin and the template are used
  templates[name] = { origin, template };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'snote-bar-cap-'));
  mkdirSync(join(root, 'fixture-home'));
  build('small', 0, 0);
  build('big3', 1, 3 * MIB); // a `3` MiB random file
  build('big33', 1, 33 * MIB); // a `33` MiB random file
  build('many8', 8, 262144); // `8` random files of `262144` bytes each
}, 120000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** A git that dies in `fetch` after leaving what a cut download can leave: loose temp and complete objects, a pack temp, a lock. */
const LEAVE_GIT = `#!/bin/bash
sub=""; gd=""
for a in "$@"; do case "$a" in fetch) sub=fetch ;; --git-dir=*) gd="\${a#--git-dir=}" ;; esac; done
if [ "$sub" = fetch ]; then
  mkdir -p "$gd/objects/ab" "$gd/objects/pack"
  echo x > "$gd/objects/ab/tmp_obj_X1"; echo x > "$gd/objects/ab/cdef0123"; echo x > "$gd/objects/pack/tmp_pack_Y1"
  echo x > "$gd/shallow.lock"
  exit 128
fi
exec "$REAL_GIT" "$@"
`;

interface Box { dir: string; clone: string; setupLog: string; env: Record<string, string> }

function realTool(name: string): string {
  return (process.env.PATH ?? '').split(':').map((d) => join(d, name)).find((f) => existsSync(f)) ?? '';
}

/** `timeout: false` builds a PATH of git and the few plain tools the script uses, with no timeout(1). */
function makeBox(variant: string, opts: { timeout: boolean; cap?: string }): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  mkdirSync(join(dir, 'home'), { recursive: true });
  cpSync(templates[variant].template, clone, { recursive: true });
  put(join(xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), '0.2.6\n');
  let path = process.env.PATH ?? '';
  if (!opts.timeout) {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const t of ['git', 'cat', 'tr', 'dirname', 'sleep', 'head', 'seq', 'env', 'bash', 'sh', 'uname', 'rm', 'mkdir', 'cp', 'sed', 'ls']) {
      const p = t === 'git' ? REAL_GIT : realTool(t);
      if (p) symlinkSync(p, join(bin, t));
    }
    path = bin;
  }
  return {
    dir, clone, setupLog: join(dir, 'setup.log'),
    env: {
      PATH: path, HOME: join(dir, 'home'), XDG_DATA_HOME: xdg, STUB_LOG: join(dir, 'setup.log'),
      ...(opts.cap === undefined ? {} : { SNOTE_UPDATE_FETCH_CAP: opts.cap }),
    },
  };
}

function run(box: Box) {
  const r = spawnSync('/bin/bash', [join(box.clone, 'packaging', 'omarchy', 'bar-update')], {
    input: 'y\n', encoding: 'utf8', timeout: 60000, env: box.env,
  });
  return { status: r.status, err: String(r.stderr ?? ''), out: String(r.stdout ?? '') };
}

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const setupRuns = (box: Box): string[] =>
  existsSync(box.setupLog) ? readFileSync(box.setupLog, 'utf8').trim().split('\n') : [];

/** Every file (not directory) under `dir`, relative, sorted. */
function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((e) => !e.isDirectory())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

interface Snap { objects: string[]; head: string }
const snap = (box: Box): Snap => ({ objects: files(join(box.clone, '.git', 'objects')), head: head(box) });

/** The clone is as it was: line 2 of the acceptance. */
function expectCloneUntouched(box: Box, before: Snap): void {
  const gd = join(box.clone, '.git');
  expect(spawnSync(REAL_GIT, ['--git-dir', gd, 'rev-parse', '--verify', '--quiet', 'refs/snote-update/target']).status).not.toBe(0);
  expect(existsSync(join(gd, 'refs', 'snote-update', 'target'))).toBe(false);
  const after = files(join(gd, 'objects'));
  expect(after.filter((f) => f.includes('tmp_'))).toEqual([]);
  expect(after.filter((f) => f.endsWith('.pack')).sort()).toEqual(before.objects.filter((f) => f.endsWith('.pack')).sort());
  expect(after).toEqual(before.objects);
  expect(files(gd).filter((f) => f.endsWith('.lock'))).toEqual([]);
  expect(spawnSync(REAL_GIT, ['--git-dir', gd, 'fsck'], { env: { PATH: process.env.PATH ?? '' } }).status).toBe(0);
}

describe('issue #210 part A: the bar update download stops at a byte cap and leaves nothing behind', () => {
  it('1: WHEN v0.2.7 adds a `3` MiB random file, `SNOTE_UPDATE_FETCH_CAP` is `1048576` and bar-update gets `y` THEN it exits `1`, stderr contains `release 0.2.7 could not be downloaded.` and `Nothing was reinstalled.`, setup ran `0` times, and HEAD and the work tree are unchanged', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBe('1048576');
    const before = snap(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release 0.2.7 could not be downloaded.');
    expect(r.err).toContain('Nothing was reinstalled.');
    expect(setupRuns(box)).toHaveLength(0);
    expect(head(box)).toBe(before.head);
    expect(git(box.clone, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.6');
  }, 60000);

  it('2: WHEN that download was stopped THEN `refs/snote-update/target` does not exist, the set of files under `.git/objects` is exactly the set before the run (no `tmp_` file anywhere under it, no new loose object, no new `.pack`), no `.lock` file is left under `.git`, and `git fsck` on the clone exits `0`', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    const before = snap(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expectCloneUntouched(box, before);

    // and the cleanup reaches loose objects, a temp pack and a lock file, not only what this git happens to leave
    const shim = makeBox('big3', { timeout: true, cap: CAP });
    put(join(shim.dir, 'shim', 'git'), LEAVE_GIT, 0o755);
    shim.env.PATH = `${join(shim.dir, 'shim')}:${shim.env.PATH}`;
    shim.env.REAL_GIT = REAL_GIT;
    const shimBefore = snap(shim);
    const r2 = run(shim);
    expect(r2.status).toBe(1);
    expect(r2.err).toContain('could not be downloaded');
    expectCloneUntouched(shim, shimBefore);
  }, 60000);

  it('3: WHEN `timeout` is not on PATH and the same oversized v0.2.7 is offered THEN the result is the same as lines 1 and 2: exit `1`, `could not be downloaded`, no target ref, no `tmp_` file', () => {
    const box = makeBox('big3', { timeout: false, cap: CAP });
    expect(existsSync(join(box.env.PATH, 'timeout'))).toBe(false);
    const before = snap(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expect(setupRuns(box)).toHaveLength(0);
    expectCloneUntouched(box, before);
  }, 60000);

  it('4: WHEN v0.2.7 is the small normal release and `SNOTE_UPDATE_FETCH_CAP` is unset THEN the clone moves to `0.2.7` and setup runs `1` time, as today', () => {
    const box = makeBox('small', { timeout: true });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBeUndefined();
    const r = run(box);
    expect(r.status).toBe(0);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
    expect(setupRuns(box)).toEqual(['SETUP-RAN 0.2.7']);
    expect(setupRuns(box)).toHaveLength(1);
  }, 60000);

  it('5: WHEN `SNOTE_UPDATE_FETCH_CAP` is unset and v0.2.7 adds a `33` MiB random file THEN bar-update exits `1` with `could not be downloaded`, setup runs `0` times, and the clone is as line 2 says', () => {
    const box = makeBox('big33', { timeout: true });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBeUndefined();
    const before = snap(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expect(setupRuns(box)).toHaveLength(0);
    expectCloneUntouched(box, before);
  }, 120000);

  it('6: WHEN `SNOTE_UPDATE_FETCH_CAP` is `1048576` and v0.2.7 adds `8` random files of `262144` bytes each (each under the cap, 2 MiB in all) THEN it is refused as in line 1 and the clone is as line 2 says', () => {
    const box = makeBox('many8', { timeout: true, cap: '1048576' });
    const before = snap(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release 0.2.7 could not be downloaded.');
    expect(r.err).toContain('Nothing was reinstalled.');
    expect(setupRuns(box)).toHaveLength(0);
    expect(head(box)).toBe(before.head);
    expectCloneUntouched(box, before);
  }, 60000);
});
