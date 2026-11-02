/**
 * Issue #210 part B (rule R1): the cap override of bar-update may only lower the cap
 * (whole numbers 1024 to 33554432, read as text), and a download that fails for any reason leaves no
 * file this download wrote under the clone's .git/objects.
 * Each case runs the real script against a real local bare origin, a throwaway clone and a stand-in setup.
 * RUNNER: Linux only (bash, GNU tools, ulimit).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const MIB = 1024 * 1024;

const SETUP_STUB = `#!/bin/bash
if [ "\${1:-}" = "--check" ]; then exit 1; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
mkdir -p "$XDG_DATA_HOME/omarchy-snote-plugin/app"
cp "$d/plugin-dist/VERSION" "$XDG_DATA_HOME/omarchy-snote-plugin/app/VERSION"
`;

/** A git whose fetch writes a temp pack into the clone's objects/pack and then stalls; every other call is real git. */
const STALL_GIT = `#!/bin/bash
sub=""; gd=""
for a in "$@"; do case "$a" in fetch) sub=fetch ;; --git-dir=*) gd="\${a#--git-dir=}" ;; esac; done
if [ "$sub" = fetch ]; then
  mkdir -p "$gd/objects/pack"
  echo x > "$gd/objects/pack/tmp_pack_STALL1"
  exec "$REAL_SLEEP" 30
fi
exec "$REAL_GIT" "$@"
`;

let root: string;
let counter = 0;
const templates: Record<string, string> = {};

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
  rmSync(work, { recursive: true, force: true });
  templates[name] = template;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'snote-bar-caprules-'));
  mkdirSync(join(root, 'fixture-home'));
  build('small', 0, 0);
  build('big33', 1, 33 * MIB); // a `33` MiB random file
}, 120000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

interface Box { dir: string; clone: string; setupLog: string; env: Record<string, string> }

function realTool(name: string): string {
  return (process.env.PATH ?? '').split(':').map((d) => join(d, name)).find((f) => existsSync(f)) ?? '';
}

function makeBox(variant: string, extraEnv: Record<string, string>): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  mkdirSync(join(dir, 'home'), { recursive: true });
  cpSync(templates[variant], clone, { recursive: true });
  put(join(xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), '0.2.6\n');
  return {
    dir, clone, setupLog: join(dir, 'setup.log'),
    env: { PATH: process.env.PATH ?? '', HOME: join(dir, 'home'), XDG_DATA_HOME: xdg, STUB_LOG: join(dir, 'setup.log'), ...extraEnv },
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

function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((e) => !e.isDirectory())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

describe('issue #210 part B: the cap override is range-checked and every failed download is cleaned', () => {
  it('1: WHEN `SNOTE_UPDATE_FETCH_CAP` is `abc`, `0`, `1023` or `99999999999` THEN the default cap applies and the small normal release installs (setup runs `1` time)', () => {
    for (const cap of ['abc', '0', '1023', '99999999999']) {
      const box = makeBox('small', { SNOTE_UPDATE_FETCH_CAP: cap });
      expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBe(cap);
      const r = run(box);
      expect(r.status, `cap ${cap}: ${r.err}`).toBe(0);
      expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
      expect(setupRuns(box), `cap ${cap}`).toEqual(['SETUP-RAN 0.2.7']);
    }
  }, 60000);

  it('2: WHEN `SNOTE_UPDATE_FETCH_CAP` is `67108864` (above the default) and the same 33 MiB v0.2.7 is offered THEN bar-update exits `1` with `could not be downloaded`, setup runs `0` times and the clone is unchanged (an override never raises the cap)', () => {
    const box = makeBox('big33', { SNOTE_UPDATE_FETCH_CAP: '67108864' });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBe('67108864');
    const before = { objects: files(join(box.clone, '.git', 'objects')), head: head(box) };
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expect(setupRuns(box)).toHaveLength(0);
    expect(head(box)).toBe(before.head);
    expect(files(join(box.clone, '.git', 'objects'))).toEqual(before.objects);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.6');
  }, 120000);

  it('3: WHEN the download is stopped by the time limit (`SNOTE_UPDATE_NET_SECS` `0.2`, and a git shim whose fetch writes a `tmp_pack_` file into the clone\'s objects/pack and then stalls) THEN bar-update exits `1` with `could not be downloaded` and no `tmp_` file is left under `.git/objects`', () => {
    const box = makeBox('small', { SNOTE_UPDATE_NET_SECS: '0.2', REAL_GIT, REAL_SLEEP: realTool('sleep') });
    put(join(box.dir, 'shim', 'git'), STALL_GIT, 0o755);
    box.env.PATH = `${join(box.dir, 'shim')}:${box.env.PATH}`;
    expect(box.env.SNOTE_UPDATE_NET_SECS).toBe('0.2');
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expect(files(join(box.clone, '.git', 'objects')).filter((f) => f.includes('tmp_'))).toEqual([]);
    expect(setupRuns(box)).toHaveLength(0);
  }, 60000);

  it('4: WHEN `SNOTE_UPDATE_FETCH_CAP` is `a[$(touch <dir>/pwned)]` (with <dir> the test\'s temp folder) THEN `<dir>/pwned` does not exist and the small normal release installs', () => {
    const box = makeBox('small', {});
    box.env.SNOTE_UPDATE_FETCH_CAP = `a[$(touch ${box.dir}/pwned)]`;
    const r = run(box);
    expect(existsSync(join(box.dir, 'pwned'))).toBe(false);
    expect(r.status, r.err).toBe(0);
    expect(setupRuns(box)).toEqual(['SETUP-RAN 0.2.7']);
  }, 60000);
});
