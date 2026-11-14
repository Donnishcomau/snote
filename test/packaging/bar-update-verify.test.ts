/**
 * #68 (L4): before the bar update moves the plugin clone, the INSTALLED snote checks the fetched release
 * (packaging/omarchy/setup --verify-release, which runs the installed cli.js). Every case runs the real
 * bar-update and the real setup's --verify-release mode against a throwaway origin, clone and installed
 * build; the installed cli.js is a stand-in that records its argv and answers as told. Nothing touches
 * the real HOME, clone or network.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_UPDATE = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const TEST_MS = 15_000;
const REFUSED = 'update refused: the download could not be verified';

// The clone's setup: --verify-release is the real setup's mode; every other call is logged with its arguments.
const SETUP_WRAP = `#!/bin/bash
if [ "\${1:-}" = "--verify-release" ]; then exec "$(dirname "$0")/setup-real" "$@"; fi
if [ "\${1:-}" = "--check" ]; then exit 1; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $* $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
`;

// The installed build's cli.js: records its argv, then passes, refuses, behaves like a build without the entry, or hangs.
const STAND_IN = `const fs = require('node:fs');
fs.appendFileSync(process.env.STAND_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
const mode = process.env.STAND_MODE;
if (mode === 'hang') setInterval(() => {}, 1000);
else if (mode === 'refuse') { console.log('The release signature did not verify.'); process.exit(1); }
else if (mode === 'old') { console.log('error: Unknown option --verify-release'); process.exit(2); }
else if (mode === 'hostile') { process.stderr.write(Buffer.concat([Buffer.from('bad \\x1b[31mred '), Buffer.from([0x9b]), Buffer.from('2J end\\n')])); process.exit(1); }
else if (mode === 'race' || mode === 'race-hang') {
  const g = (...a) => require('node:child_process').execFileSync('git', ['-C', process.argv[3], ...a], { stdio: 'ignore' });
  g('merge', '--ff-only', '--quiet', process.argv[4]);
  g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'moved after the check');
  if (mode === 'race-hang') setInterval(() => {}, 1000); else process.exit(0);
}
else process.exit(0);
`;

let root: string;
let template: string;
let c1 = '';
let c2 = '';
let counter = 0;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(REAL_GIT, args, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '', HOME: join(root, 'fixture-home'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function put(dir: string, rel: string, text: string | Buffer, mode = 0o644): void {
  const file = join(dir, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, mode);
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'snote-bar-verify-')));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(join(root, 'fixture-home'));
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', work);
  put(work, 'plugin-dist/VERSION', '0.2.6\n');
  put(work, 'plugin-dist/cli.js', 'cli 0.2.6\n');
  put(work, 'packaging/omarchy/setup', SETUP_WRAP, 0o755);
  put(work, 'packaging/omarchy/setup-real', readFileSync(REAL_SETUP), 0o755);
  put(work, 'packaging/omarchy/bar-update', readFileSync(REAL_UPDATE), 0o755);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release 0.2.6');
  c1 = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', 'v0.2.6');
  git(work, 'push', '-q', origin, 'main', 'v0.2.6');
  template = join(root, 'template');
  git(root, 'clone', '-q', '--no-tags', origin, template);
  put(work, 'plugin-dist/VERSION', '0.2.7\n');
  git(work, 'commit', '-q', '-am', 'release 0.2.7');
  c2 = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', '-a', '-m', 'release 0.2.7', 'v0.2.7');
  git(work, 'push', '-q', origin, 'main', '--tags');
}, 10000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

interface Box { clone: string; setupLog: string; standLog: string; env: Record<string, string>; onStart?: (pid: number) => void }

function makeBox(mode: string, opts: { cli?: boolean; node?: string; extra?: Record<string, string> } = {}): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const app = join(dir, 'xdg', 'omarchy-snote-plugin', 'app');
  mkdirSync(join(dir, 'home'), { recursive: true });
  cpSync(template, clone, { recursive: true });
  put(app, 'VERSION', '0.2.6\n');
  if (opts.cli !== false) put(app, 'cli.js', STAND_IN);
  const box: Box = {
    clone, setupLog: join(dir, 'setup.log'), standLog: join(dir, 'stand.log'),
    env: {
      PATH: process.env.PATH ?? '', HOME: join(dir, 'home'), XDG_DATA_HOME: join(dir, 'xdg'),
      STUB_LOG: join(dir, 'setup.log'), STAND_LOG: join(dir, 'stand.log'), STAND_MODE: mode,
      SNOTE_NODE: opts.node ?? process.execPath, ...opts.extra,
    },
  };
  return box;
}

function run(box: Box): Promise<{ status: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(join(box.clone, 'packaging', 'omarchy', 'bar-update'), [], { env: box.env });
    if (box.onStart && child.pid) box.onStart(child.pid);
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, out, err }));
    child.stdin.end('y\n');
  });
}

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const lines = (file: string): string[] => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []);
const hasObject = (box: Box, id: string): boolean => spawnSync(REAL_GIT, ['-C', box.clone, 'cat-file', '-e', `${id}^{commit}`]).status === 0;

describe('#68 the bar update moves the clone only after the installed snote verified the release', () => {
  it('1: WHEN the installed build passes the check of `v0.2.7` THEN its cli.js got `--verify-release <clone> <commit> v0.2.7`, the clone is at `0.2.7` and setup then runs once with `--verified-update`', async () => {
    const box = makeBox('pass');
    const r = await run(box);
    expect({ status: r.status, err: r.err }).toEqual({ status: 0, err: expect.not.stringContaining(REFUSED) });
    expect(head(box)).toBe(c2);
    expect(lines(box.standLog)).toEqual([JSON.stringify(['--verify-release', realpathSync(box.clone), c2, 'v0.2.7'])]);
    expect(lines(box.setupLog)).toEqual(['SETUP-RAN --verified-update 0.2.7']);
  }, TEST_MS);

  it('2: WHEN the installed build refuses the release, is a build without the check (exit `2`), is missing, or no usable Node is found THEN bar-update exits `1` with `update refused: the download could not be verified` and `Nothing was reinstalled.`, the clone stays at `0.2.6`, the fetched commit is gone and setup does not run', async () => {
    const boxes = [makeBox('refuse'), makeBox('old'), makeBox('pass', { cli: false }), makeBox('pass', { node: '/nonexistent/node' })];
    const runs = await Promise.all(boxes.map(run));
    runs.forEach((r, i) => {
      const box = boxes[i] as Box;
      expect({ i, status: r.status }).toEqual({ i, status: 1 });
      expect(r.err).toContain(REFUSED);
      expect(r.err).toContain('Nothing was reinstalled.');
      expect({ i, head: head(box), fetched: hasObject(box, c2), setup: lines(box.setupLog) }).toEqual({ i, head: c1, fetched: false, setup: [] });
    });
    expect(runs[0]?.err).toContain('The release signature did not verify.');
  }, TEST_MS);

  it('3: WHEN the installed build does not answer within the bound (`SNOTE_SETUP_PROBE_SECS` `0.5`) THEN the update is refused with `update refused: the download could not be verified` and the clone stays at `0.2.6`', async () => {
    const box = makeBox('hang', { extra: { SNOTE_SETUP_PROBE_SECS: '0.5' } });
    const r = await run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain(REFUSED);
    expect({ head: head(box), setup: lines(box.setupLog) }).toEqual({ head: c1, setup: [] });
  }, TEST_MS);

  it('4: WHEN the refusal reason holds ESC `[31m` and a 0x9b byte under LANG=C.UTF-8 THEN stderr holds `bad [31mred 2J end` without either byte; WHEN the clone HEAD is not the checked commit after the move THEN bar-update exits `1`, the clone is back at `0.2.6` (the commit read before the check) and setup does not run', async () => {
    const hostile = makeBox('hostile', { extra: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
    const race = makeBox('race');
    const [h, r] = await Promise.all([run(hostile), run(race)]);
    expect({ status: h.status, refused: h.err.includes(REFUSED), reason: h.err.includes('bad [31mred 2J end') }).toEqual({ status: 1, refused: true, reason: true });
    expect({ esc: h.err.includes('\x1b'), c1: h.err.includes('\u009b'), bad: h.err.includes('\ufffd') }).toEqual({ esc: false, c1: false, bad: false });
    expect({ status: r.status, err: r.err.includes('the plugin folder is not at the checked release 0.2.7.') }).toEqual({ status: 1, err: true });
    expect({ head: head(race), setup: lines(race.setupLog) }).toEqual({ head: c1, setup: [] });
  }, TEST_MS);

  it('5: WHEN a run was refused because the clone HEAD moved after the check, and bar-update runs again with an installed build that refuses THEN the second run checks the release again, exits `1` with `update refused: the download could not be verified`, the clone stays at `0.2.6` and setup never runs', async () => {
    const box = makeBox('race');
    const first = await run(box);
    box.env.STAND_MODE = 'refuse';
    const second = await run(box);
    const check = JSON.stringify(['--verify-release', realpathSync(box.clone), c2, 'v0.2.7']);
    expect({ first: first.status, second: second.status, refused: second.err.includes(REFUSED), checks: lines(box.standLog), head: head(box), setup: lines(box.setupLog) })
      .toEqual({ first: 1, second: 1, refused: true, checks: [check, check], head: c1, setup: [] });
  }, TEST_MS);

  it('6: WHEN bar-update gets SIGHUP (the terminal closed) while the check runs and the clone HEAD has moved THEN it exits `1`, the clone is back at `0.2.6` and setup does not run', async () => {
    const box = makeBox('race-hang', { extra: { SNOTE_SETUP_PROBE_SECS: '1' } });
    let pid = 0;
    box.onStart = (p) => { pid = p; };
    const done = run(box);
    const deadline = Date.now() + 10_000;
    while (head(box) === c1 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(head(box)).not.toBe(c1); // the stand-in moved the clone and now hangs inside the check
    process.kill(pid, 'SIGHUP');
    const r = await done;
    expect({ status: r.status, head: head(box), setup: lines(box.setupLog) }).toEqual({ status: 1, head: c1, setup: [] });
  }, TEST_MS);
});
