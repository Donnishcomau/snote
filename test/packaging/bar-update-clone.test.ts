/**
 * Issue #135: the bar's update action never reinstalls the old version. The
 * action is packaging/omarchy/bar-update: it asks, brings the plugin clone to
 * the newest release with a fast-forward only, then runs setup; when the clone
 * cannot be moved it runs nothing and says why. Every case below runs the
 * real script against a throwaway origin, a throwaway clone and a stand-in
 * setup; nothing touches the real HOME, clone or network.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_UPDATE = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const QML = join(process.cwd(), 'BarWidget.qml');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

const SETUP_STUB = `#!/bin/bash
if [ "\${1:-}" = "--check" ]; then exit "\${STUB_CHECK:-1}"; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
mkdir -p "$XDG_DATA_HOME/omarchy-snote-plugin/app"
cp "$d/plugin-dist/VERSION" "$XDG_DATA_HOME/omarchy-snote-plugin/app/VERSION"
`;

const GIT_WRAPPER = `#!/bin/sh
printf '%s\\n' "$*" >> "$WRAP_LOG"
exec "$REAL_GIT" "$@"
`;

let root: string;
let origin: string;
let template: string;
let c1 = '';
let c2 = '';
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
  root = mkdtempSync(join(tmpdir(), 'snote-bar-update-'));
  origin = join(root, 'origin.git');
  const work = join(root, 'work');
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
  // the origin moves on after the clone was made: the clone does not have this commit yet
  put(work, 'plugin-dist/VERSION', '0.2.7\n');
  git(work, 'commit', '-q', '-am', 'release 0.2.7');
  c2 = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', '-a', '-m', 'release 0.2.7', 'v0.2.7');
  // tags that are not releases: a remote can name anything
  git(work, 'tag', 'v9.9.9-rc1');
  git(work, 'tag', 'v8.8.8$(touch${IFS}MARK)');
  git(work, 'push', '-q', origin, 'main', '--tags');
}, 10000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

interface Box {
  dir: string;
  clone: string;
  xdg: string;
  setupLog: string;
  wrapLog: string;
  env: Record<string, string>;
}

function makeBox(installed: string | null): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, 'home'));
  cpSync(template, clone, { recursive: true });
  put(bin, 'git', GIT_WRAPPER, 0o755);
  if (installed !== null) put(xdg, 'omarchy-snote-plugin/app/VERSION', `${installed}\n`);
  const box: Box = {
    dir, clone, xdg,
    setupLog: join(dir, 'setup.log'),
    wrapLog: join(dir, 'git.log'),
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: join(dir, 'home'),
      XDG_DATA_HOME: xdg,
      STUB_LOG: join(dir, 'setup.log'),
      WRAP_LOG: join(dir, 'git.log'),
      REAL_GIT,
    },
  };
  return box;
}

// #172: a run waits on the script's exit (its `close` event), never on a fixed time. The old
// spawnSync kill at 2.5 s turned a slow run on a loaded machine into status null, and five
// runs in a row overran the 3 s test limit; independent runs now go side by side.
function run(box: Box, args: string[], input: string, extra: Record<string, string> = {}): Promise<{ status: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(join(box.clone, 'packaging', 'omarchy', 'bar-update'), args, { env: { ...box.env, ...extra } });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    child.stdin.on('error', () => {}); // the script may exit before it reads its answer
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, out, err }));
    child.stdin.end(input);
  });
}

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const setupRuns = (box: Box): string[] =>
  existsSync(box.setupLog) ? readFileSync(box.setupLog, 'utf8').trim().split('\n') : [];
const gitCalls = (box: Box): string[] =>
  existsSync(box.wrapLog) ? readFileSync(box.wrapLog, 'utf8').trim().split('\n') : [];
const installedVersion = (box: Box): string =>
  readFileSync(join(box.xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), 'utf8').trim();

describe('issue #135 the bar update action brings the plugin clone to the release first', () => {
  it('1: WHEN the bar update action runs with `y`, the installed snote is `0.2.6`, the plugin clone is at `0.2.6` and the origin newest release tag is `v0.2.7` THEN the clone is at the commit of `v0.2.7` before setup runs, setup runs once and the installed version is `0.2.7`', async () => {
    expect(statSync(REAL_UPDATE).mode & 0o111).not.toBe(0);
    const box = makeBox('0.2.6');
    expect(head(box)).toBe(c1);
    const r = await run(box, [], 'y\n', { GIT_DIR: '/nonexistent' });
    expect(r.status).toBe(0);
    expect(head(box)).toBe(c2);
    expect(setupRuns(box)).toEqual(['SETUP-RAN 0.2.7']);
    expect(installedVersion(box)).toBe('0.2.7');
    const calls = gitCalls(box);
    for (const sub of ['ls-remote --tags', 'fetch']) {
      const line = calls.find((l) => l.includes(sub)) ?? '';
      for (const flag of ['credential.helper=', 'core.hooksPath=/dev/null', 'core.fsmonitor=false', 'protocol.allow=never', 'protocol.https.allow=always']) {
        expect(line, `${sub} carries ${flag}`).toContain(`-c ${flag}`);
      }
    }
  });

  it('2: WHEN the installed snote is `0.2.7`, the plugin clone is at `0.2.6` and the newest release is `v0.2.7` THEN the clone is moved to `0.2.7`, setup does not run and the output says `already the newest release`', async () => {
    const box = makeBox('0.2.7');
    const r = await run(box, [], 'y\n', { STUB_CHECK: '0' });
    expect(r.status).toBe(0);
    expect(head(box)).toBe(c2);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
    expect(setupRuns(box)).toEqual([]);
    expect(installedVersion(box)).toBe('0.2.7');
    expect(r.out).toContain('already the newest release');
  });

  it('3: WHEN the clone has local changes, has diverged, cannot reach the origin, the answer is not `y`, or the installed snote is newer than every release THEN setup does not run and the output says `local changes`, `fast-forwarded`, `looked up`, `Nothing was changed` or `older than the installed`', async () => {
    // five independent clones; their runs go side by side and each result waits on its own exit
    const dirty = makeBox('0.2.6');
    writeFileSync(join(dirty.clone, 'README.md'), 'edited\n');
    const diverged = makeBox('0.2.6');
    writeFileSync(join(diverged.clone, 'own.txt'), 'own\n');
    git(diverged.clone, 'add', 'own.txt');
    git(diverged.clone, 'commit', '-q', '-m', 'own');
    const own = head(diverged);
    const offline = makeBox('0.2.6');
    git(offline.clone, 'config', 'remote.origin.url', join(offline.dir, 'gone.git'));
    const declined = makeBox('0.2.6');
    const ahead = makeBox('0.2.9');
    const [rd, rv, ro, rn, ra] = await Promise.all([
      run(dirty, [], 'y\n'), run(diverged, [], 'y\n'), run(offline, [], 'y\n'), run(declined, [], 'n\n'), run(ahead, [], 'y\n'),
    ]);
    // local changes
    expect(rd.status).toBe(1);
    expect(rd.err).toContain('local changes');
    expect(rd.err).toContain('Nothing was reinstalled');
    expect(setupRuns(dirty)).toEqual([]);
    expect(head(dirty)).toBe(c1);
    // diverged: a commit of its own on top of the old release
    expect(rv.status).toBe(1);
    expect(rv.err).toContain('fast-forwarded');
    expect(setupRuns(diverged)).toEqual([]);
    expect(head(diverged)).toBe(own);
    // offline: the origin cannot be reached
    expect(ro.status).toBe(1);
    expect(ro.err).toContain('looked up');
    expect(setupRuns(offline)).toEqual([]);
    expect(head(offline)).toBe(c1);
    // the answer is not y
    expect(rn.status).toBe(1);
    expect(rn.out).toContain('Nothing was changed');
    expect(gitCalls(declined).some((l) => l.includes('ls-remote'))).toBe(false);
    expect(setupRuns(declined)).toEqual([]);
    expect(head(declined)).toBe(c1);
    // the install is newer than every release (a build ahead of the tags)
    expect(ra.status).toBe(1);
    expect(ra.err).toContain('older than the installed');
    expect(setupRuns(ahead)).toEqual([]);
    expect(installedVersion(ahead)).toBe('0.2.9');
  });

  it('4: WHEN the installed snote is newer than the clone `plugin-dist/VERSION` THEN `bar-update --check` exits `0` with no git call, and it exits `1` when the install is older', async () => {
    const newer = makeBox('0.2.7');
    const older = makeBox('0.2.5');
    const equal = makeBox('0.2.6');
    const [r1, rOlder, rEqual0, rEqual1, rNone] = await Promise.all([
      run(newer, ['--check'], '', { STUB_CHECK: '1' }),
      run(older, ['--check'], '', { STUB_CHECK: '1' }),
      run(equal, ['--check'], '', { STUB_CHECK: '0' }),
      run(equal, ['--check'], '', { STUB_CHECK: '1' }),
      run(makeBox(null), ['--check'], '', { STUB_CHECK: '1' }),
    ]);
    expect(r1.status).toBe(0);
    expect(gitCalls(newer)).toEqual([]);
    expect(rOlder.status).toBe(1);
    // an equal version is setup's own answer (the checked mark), not decided here
    expect(rEqual0.status).toBe(0);
    expect(rEqual1.status).toBe(1);
    expect(rNone.status).toBe(1);
  });

  it('5: WHEN the origin is not `https://github.com/donnishcomau/snote` or an absolute path, or SNOTE_UPDATE_CHECK is `off` THEN git never asks the origin (no `ls-remote`), nothing is run and the output says `not the snote repository` or `switched off`', async () => {
    const mark = join(root, 'MARK');
    const urls = [
      `ext::sh -c touch% ${mark}`,
      'github.com:donnishcomau/snote.git',
      'https://evil.example/donnishcomau/snote',
      'http://github.com/donnishcomau/snote',
      'file:///tmp/x',
    ];
    const boxes = urls.map((url) => {
      const b = makeBox('0.2.6');
      git(b.clone, 'config', 'remote.origin.url', url);
      return b;
    });
    const off = makeBox('0.2.6');
    const [ro, ...results] = await Promise.all([run(off, [], 'y\n', { SNOTE_UPDATE_CHECK: 'off' }), ...boxes.map((b) => run(b, [], 'y\n'))]);
    for (const [i, url] of urls.entries()) {
      const box = boxes[i];
      const r = results[i];
      expect(r.status, url).toBe(1);
      expect(r.err, url).toContain('not the snote repository');
      expect(gitCalls(box).some((l) => l.includes('ls-remote') || l.includes('fetch')), url).toBe(false);
      expect(setupRuns(box), url).toEqual([]);
      expect(existsSync(mark), url).toBe(false);
    }
    expect(ro.status).toBe(1);
    expect(ro.err).toContain('switched off');
    expect(gitCalls(off).some((l) => l.includes('ls-remote'))).toBe(false);
    expect(setupRuns(off)).toEqual([]);
  });

  it('6: WHEN BarWidget.qml is read THEN a click on an installed snote runs `root.setupCommand(root.updateScript)`, a missing install still runs `root.setupCommand(root.setupScript)`, the version probe runs `[root.updateScript, "--check"]`, and the file holds no `git` command', () => {
    const text = readFileSync(QML, 'utf8');
    const start = text.indexOf('function launchOrHint()');
    const body = text.slice(start, text.indexOf('\n\n', start));
    expect(text).toContain('readonly property string updateScript: root.localPath("packaging/omarchy/bar-update")');
    expect(body).toContain('if (root.snoteStatus === "missing") root.bar.run(root.setupCommand(root.setupScript))');
    expect(body).toContain('else root.bar.run(root.setupCommand(root.updateScript))');
    const probe = text.slice(text.indexOf('id: checkVersionProc'));
    expect(probe.slice(0, probe.indexOf('onExited'))).toContain('command: [root.updateScript, "--check"]');
    expect(/\bgit\b/.test(text)).toBe(false);
  });

  it('7: WHEN a step in this test waits on a spawned process THEN it waits on the process exit or its output, never on a fixed time', () => {
    const text = readFileSync(join(process.cwd(), 'test', 'packaging', 'bar-update-clone.test.ts'), 'utf8');
    const helpers = text.slice(0, text.indexOf("describe('issue #135"));
    const runner = helpers.slice(helpers.indexOf('function run('), helpers.indexOf('const head ='));
    expect(runner).toContain("child.on('close', (status) => resolve({ status, out, err }))");
    expect(runner).not.toMatch(/\btimeout\s*:/);
    expect(runner).not.toContain('spawnSync(');
    expect(helpers).not.toMatch(/setTimeout\(|Atomics\.wait|\bsleep\b/);
  });
});
