/**
 * Issue #517: the bar update action moves the plugin clone only to the commit the
 * release list named, and puts the clone back when the release says another version.
 * Both refusals live in packaging/omarchy/bar-update; no test reached either one. Every case
 * runs the real script against a throwaway origin, clone and stand-in setup, with a git
 * wrapper on PATH that re-points an origin tag right after `ls-remote` answered.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_UPDATE = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

const SETUP_STUB = `#!/bin/bash
if [ "\${1:-}" = "--check" ]; then exit "\${STUB_CHECK:-1}"; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
mkdir -p "$XDG_DATA_HOME/omarchy-snote-plugin/app"
cp "$d/plugin-dist/VERSION" "$XDG_DATA_HOME/omarchy-snote-plugin/app/VERSION"
`;

// runs the real git; right after an ls-remote call it re-points MOVE_TAG of the origin at MOVE_TO
const GIT_WRAPPER = `#!/bin/sh
is_ls=0
for a in "$@"; do
  if [ "$a" = "ls-remote" ]; then is_ls=1; fi
done
"$REAL_GIT" "$@"
rc=$?
if [ "$is_ls" = 1 ] && [ -n "\${MOVE_TO:-}" ]; then
  "$REAL_GIT" --git-dir="$ORIGIN" update-ref "refs/tags/$MOVE_TAG" "$MOVE_TO"
fi
exit "$rc"
`;

let root: string;
let origin: string;
let work: string;
let template: string;
let c1 = '';
let c3 = '';
let counter = 0;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(REAL_GIT, args, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: join(root, 'fixture-home'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function put(dir: string, rel: string, text: string, mode = 0o644): void {
  const file = join(dir, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, mode);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'snote-tag-moved-'));
  origin = join(root, 'origin.git');
  work = join(root, 'work');
  mkdirSync(join(root, 'fixture-home'));
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', work);
  put(work, 'plugin-dist/VERSION', '0.2.6\n');
  put(work, 'README.md', 'readme\n');
  put(work, 'packaging/omarchy/setup', SETUP_STUB, 0o755);
  writeFileSync(join(work, 'packaging', 'omarchy', 'bar-update'), readFileSync(REAL_UPDATE));
  chmodSync(join(work, 'packaging', 'omarchy', 'bar-update'), 0o755);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release 0.2.6');
  c1 = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', 'v0.2.6');
  git(work, 'push', '-q', origin, 'main', 'v0.2.6');
  template = join(root, 'template');
  git(root, 'clone', '-q', '--no-tags', origin, template);
  // release 0.2.7, then a later commit that still says 0.2.7 (where the tag gets moved to)
  put(work, 'plugin-dist/VERSION', '0.2.7\n');
  git(work, 'commit', '-q', '-am', 'release 0.2.7');
  git(work, 'tag', '-a', '-m', 'release 0.2.7', 'v0.2.7');
  put(work, 'README.md', 'moved\n');
  git(work, 'commit', '-q', '-am', 'moved');
  c3 = git(work, 'rev-parse', 'HEAD');
  git(work, 'push', '-q', origin, 'main', 'v0.2.7');
  // v0.2.8 is tagged on a commit whose plugin-dist/VERSION still says 0.2.7; it is never pushed to the shared origin
  put(work, 'README.md', 'v8\n');
  git(work, 'commit', '-q', '-am', 'release 0.2.8 (VERSION not bumped)');
  git(work, 'tag', '-a', '-m', 'release 0.2.8', 'v0.2.8');
}, 20000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

interface Box {
  dir: string;
  clone: string;
  xdg: string;
  origin: string;
  setupLog: string;
  env: Record<string, string>;
}

function makeBox(tags: string[]): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  const bin = join(dir, 'bin');
  const boxOrigin = join(dir, 'origin.git');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, 'home'));
  cpSync(origin, boxOrigin, { recursive: true });
  for (const t of tags) git(work, 'push', '-q', boxOrigin, `refs/tags/${t}:refs/tags/${t}`);
  cpSync(template, clone, { recursive: true });
  git(clone, 'config', 'remote.origin.url', boxOrigin);
  put(bin, 'git', GIT_WRAPPER, 0o755);
  put(xdg, 'omarchy-snote-plugin/app/VERSION', '0.2.6\n');
  return {
    dir, clone, xdg, origin: boxOrigin,
    setupLog: join(dir, 'setup.log'),
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: join(dir, 'home'),
      XDG_DATA_HOME: xdg,
      STUB_LOG: join(dir, 'setup.log'),
      ORIGIN: boxOrigin,
      REAL_GIT,
    },
  };
}

// a run waits on the script's exit (its `close` event), never on a fixed time
function run(box: Box, input: string, extra: Record<string, string> = {}): Promise<{ status: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(join(box.clone, 'packaging', 'omarchy', 'bar-update'), [], { env: { ...box.env, ...extra } });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, out, err }));
    child.stdin.end(input);
  });
}

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const setupRuns = (box: Box): string[] =>
  existsSync(box.setupLog) ? readFileSync(box.setupLog, 'utf8').trim().split('\n') : [];

describe('#517 bar-update moves the clone only to the listed release commit', () => {
  it('1: WHEN the origin tag `v0.2.7` is moved to another commit (also saying `0.2.7`) between ls-remote and fetch THEN bar-update exits `1` saying `did not match its tag`, the clone stays at release `0.2.6` and setup does not run, and with the tag left in place the same rig moves to `0.2.7`', async () => {
    const moved = makeBox(['v0.2.7']);
    const still = makeBox(['v0.2.7']);
    const [rm, rs] = await Promise.all([
      run(moved, 'y\n', { MOVE_TAG: 'v0.2.7', MOVE_TO: c3 }),
      run(still, 'y\n'),
    ]);
    expect(rm.status).toBe(1);
    expect(rm.err).toContain('did not match its tag');
    expect(head(moved)).toBe(c1);
    expect(readFileSync(join(moved.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.6');
    expect(setupRuns(moved)).toEqual([]);
    expect(rs.status).toBe(0);
    expect(readFileSync(join(still.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
    expect(setupRuns(still)).toEqual(['SETUP-RAN 0.2.7']);
  }, 20000);

  it('2: WHEN the newest release `v0.2.8` fast-forwards to a commit whose plugin-dist/VERSION says `0.2.7` THEN bar-update exits `1` saying `did not match its version` and the clone is put back at release `0.2.6`', async () => {
    const box = makeBox(['v0.2.8']);
    const r = await run(box, 'y\n');
    expect(r.status).toBe(1);
    expect(r.err).toContain('did not match its version');
    expect(head(box)).toBe(c1);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.6');
    expect(setupRuns(box)).toEqual([]);
  }, 20000);
});
