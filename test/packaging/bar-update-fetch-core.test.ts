/**
 * Issue #318 (a #210 regression): the capped release download of bar-update runs with a core-file size
 * limit of 0, so when the byte cap stops git (SIGXFSZ) the kernel writes no core and systemd-coredump
 * raises no "Process crashed" notification. Each case runs the real script against a real local bare origin.
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
const RAISED = '4096';

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
  root = mkdtempSync(join(tmpdir(), 'snote-bar-core-'));
  mkdirSync(join(root, 'fixture-home'));
  build('small', 0, 0);
  build('big3', 1, 3 * MIB); // a `3` MiB random file
}, 120000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** A git that records, per call, the subcommand and the core (soft, hard) and file limits, then runs the real git. */
const RECORD_GIT = `#!/bin/bash
sub=""; skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in -c|-C) skip=1 ;; -*) ;; *) sub="$a"; break ;; esac
done
raise=""
if [ "$sub" = fetch ]; then ( ulimit -c ${RAISED} ) 2>/dev/null; raise="raise-exit=$?"; fi
echo "$sub c=$(ulimit -c) Hc=$(ulimit -Hc) f=$(ulimit -f) xfsz=$(sed -n 's/^SigIgn:\t//p' /proc/$$/status) $raise" >> "$CALL_LOG"
exec "$REAL_GIT" $EXEC_FLAG "$@"
`;

/** Stands in for git-index-pack (and the git it is run through): records the limits of the process SIGXFSZ hits. */
const RECORD_PACK = `#!/bin/bash
if [ "$(basename "$0")" = git ] && [ "\${1:-}" != index-pack ]; then exec "$REAL_GIT" "$@"; fi
echo "index-pack c=$(ulimit -c) Hc=$(ulimit -Hc) xfsz=$(sed -n 's/^SigIgn:\t//p' /proc/$$/status)" >> "$PACK_LOG"
if [ "$(basename "$0")" = git ]; then exec "$REAL_GIT" "$@"; fi
exec "$REAL_GIT" index-pack "$@"
`;

interface Box { dir: string; clone: string; setupLog: string; callLog: string; work: string; env: Record<string, string> }

function realTool(name: string): string {
  return (process.env.PATH ?? '').split(':').map((d) => join(d, name)).find((f) => existsSync(f)) ?? '';
}

/** `timeout: false` builds a PATH of git and the few plain tools the script uses, with no timeout(1). The git shim is first on PATH. */
function makeBox(variant: string, opts: { timeout: boolean; cap?: string }): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  const work = join(dir, 'work');
  mkdirSync(join(dir, 'home'), { recursive: true });
  mkdirSync(work);
  cpSync(templates[variant].template, clone, { recursive: true });
  put(join(xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), '0.2.6\n');
  let path = process.env.PATH ?? '';
  if (!opts.timeout) {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const t of ['git', 'cat', 'tr', 'dirname', 'sleep', 'head', 'seq', 'env', 'bash', 'sh', 'uname', 'rm', 'mkdir', 'cp', 'sed', 'ls', 'basename']) {
      const p = t === 'git' ? REAL_GIT : realTool(t);
      if (p) symlinkSync(p, join(bin, t));
    }
    path = bin;
  }
  put(join(dir, 'shim', 'git'), RECORD_GIT, 0o755);
  return {
    dir, clone, work, setupLog: join(dir, 'setup.log'), callLog: join(dir, 'calls.log'),
    env: {
      PATH: `${join(dir, 'shim')}:${path}`, HOME: join(dir, 'home'), XDG_DATA_HOME: xdg, STUB_LOG: join(dir, 'setup.log'),
      CALL_LOG: join(dir, 'calls.log'), REAL_GIT,
      ...(opts.cap === undefined ? {} : { SNOTE_UPDATE_FETCH_CAP: opts.cap }),
    },
  };
}

/** Runs bar-update with this process's own core limit raised to 4096 blocks first; the raise is asserted. */
function run(box: Box) {
  const r = spawnSync('/bin/bash', ['-c', `ulimit -c ${RAISED} && [ "$(ulimit -c)" = ${RAISED} ] && exec /bin/bash "$0"`, join(box.clone, 'packaging', 'omarchy', 'bar-update')], {
    cwd: box.work, input: 'y\n', encoding: 'utf8', timeout: 60000, env: box.env,
  });
  return { status: r.status, err: String(r.stderr ?? ''), out: String(r.stdout ?? '') };
}

interface Call { sub: string; c: string; hc: string; f: string; ign: string; raise: string }
/** SIGXFSZ is signal 25: bit 24 of the SigIgn mask in /proc/<pid>/status, inherited across fork and exec. */
const xfszIgnored = (mask: string): boolean => (BigInt(`0x${mask}`) & (1n << 24n)) !== 0n;
function calls(box: Box): Call[] {
  if (!existsSync(box.callLog)) return [];
  return readFileSync(box.callLog, 'utf8').trim().split('\n').map((l) => {
    const m = /^(\S*) c=(\S+) Hc=(\S+) f=(\S+) xfsz=(\S+) ?(?:raise-exit=(\d+))?$/.exec(l);
    if (!m) throw new Error(`unparsed shim line: ${l}`);
    return { sub: m[1], c: m[2], hc: m[3], f: m[4], ign: m[5], raise: m[6] ?? '' };
  });
}
const fetchCall = (box: Box): Call => {
  const f = calls(box).filter((c) => c.sub === 'fetch');
  expect(f).toHaveLength(1);
  return f[0];
};

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const setupRuns = (box: Box): string[] =>
  existsSync(box.setupLog) ? readFileSync(box.setupLog, 'utf8').trim().split('\n') : [];

function allFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((e) => !e.isDirectory())
    .map((e) => join(e.parentPath, e.name));
}

describe('issue #318: the capped bar update download runs with a core limit of 0', () => {
  it('1: WHEN the test starts bar-update with its own core limit raised to `4096` blocks (and asserts that raise worked, so the test cannot pass vacuously on a host whose limit is already 0) and a git shim records `ulimit -c` and `ulimit -f` of the `fetch` call, with v0.2.7 the small normal release and `SNOTE_UPDATE_FETCH_CAP` unset THEN the recorded core limit is `0`, the recorded file limit is `32768`, and the update still completes (exit `0`, clone at `0.2.7`, setup ran `1` time)', () => {
    const raise = spawnSync('/bin/bash', ['-c', `ulimit -c ${RAISED} && ulimit -c`], { encoding: 'utf8' });
    expect(raise.stdout.trim()).toBe(RAISED);
    const box = makeBox('small', { timeout: true });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBeUndefined();
    const r = run(box);
    expect(r.status).toBe(0);
    const f = fetchCall(box);
    expect(f.c).toBe('0');
    expect(f.f).toBe('32768');
    expect(xfszIgnored(f.ign)).toBe(true);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
    expect(setupRuns(box)).toEqual(['SETUP-RAN 0.2.7']);
    expect(setupRuns(box)).toHaveLength(1);
    // the raise reached the script: the calls outside the subshell saw it
    expect(calls(box).filter((c) => c.sub !== 'fetch').every((c) => c.c === RAISED)).toBe(true);
  }, 60000);

  it('2: WHEN v0.2.7 adds a `3` MiB random file, `SNOTE_UPDATE_FETCH_CAP` is `1048576` and the same shim records THEN bar-update exits `1`, stderr contains `release 0.2.7 could not be downloaded.` and `Nothing was reinstalled.`, the recorded core limit is `0`, the recorded file limit is `1024`, and `refs/snote-update/target` does not exist', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    expect(box.env.SNOTE_UPDATE_FETCH_CAP).toBe('1048576');
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release 0.2.7 could not be downloaded.');
    expect(r.err).toContain('Nothing was reinstalled.');
    const f = fetchCall(box);
    expect(f.c).toBe('0');
    expect(f.f).toBe('1024');
    expect(xfszIgnored(f.ign)).toBe(true);
    expect(existsSync(join(box.clone, '.git', 'refs', 'snote-update', 'target'))).toBe(false);
    expect(spawnSync(REAL_GIT, ['--git-dir', join(box.clone, '.git'), 'rev-parse', '--verify', '--quiet', 'refs/snote-update/target']).status).not.toBe(0);
  }, 60000);

  it('3: WHEN `timeout` is not on PATH and the same oversized v0.2.7 is offered THEN the result is the same as line 2 (exit `1`, the download line, recorded core limit `0`)', () => {
    const box = makeBox('big3', { timeout: false, cap: CAP });
    expect(existsSync(join(box.dir, 'bin', 'timeout'))).toBe(false);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release 0.2.7 could not be downloaded.');
    expect(r.err).toContain('Nothing was reinstalled.');
    expect(fetchCall(box).c).toBe('0');
    expect(fetchCall(box).f).toBe('1024');
  }, 60000);

  it('4: WHEN the same capped run ends THEN the git calls the script makes outside the limited subshell (every call that is not `fetch`, including `ls-remote` and `merge`) record the test\'s own core limit `4096`, not `0`', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    expect(run(box).status).toBe(1);
    const others = calls(box).filter((c) => c.sub !== 'fetch');
    expect(others.map((c) => c.sub)).toContain('ls-remote');
    expect(others.length).toBeGreaterThan(0);
    for (const c of others) { expect(c.c).toBe(RAISED); expect(xfszIgnored(c.ign)).toBe(false); }
    // merge only runs when the update succeeds: the small release shows it also keeps the raised limit
    const ok = makeBox('small', { timeout: true });
    expect(run(ok).status).toBe(0);
    const okOthers = calls(ok).filter((c) => c.sub !== 'fetch');
    expect(okOthers.map((c) => c.sub)).toContain('merge');
    for (const c of okOthers) expect(c.c).toBe(RAISED);
  }, 120000);

  it('5: WHEN the capped run in line 2 ends THEN no file named `core` or `core.*` exists in the clone, in `.git` or in the run\'s working directory', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    expect(run(box).status).toBe(1);
    expect(fetchCall(box).c).toBe('0');
    const isCore = (p: string): boolean => /^core(\..*)?$/.test(p.split('/').pop() ?? '');
    expect(allFiles(box.clone).filter(isCore)).toEqual([]);
    expect(allFiles(join(box.clone, '.git')).filter(isCore)).toEqual([]);
    expect(allFiles(box.work).filter(isCore)).toEqual([]);
  }, 60000);

  it('6: WHEN the shim in line 1 also records `ulimit -Hc` of the `fetch` call THEN the recorded hard core limit is `0` (a limit only the soft side would let a child raise it again), and the shim, running as a child of the script\'s git, fails to raise it (`ulimit -c 4096` in the shim exits non-zero)', () => {
    const box = makeBox('small', { timeout: true });
    expect(run(box).status).toBe(0);
    const f = fetchCall(box);
    expect(f.hc).toBe('0');
    expect(f.raise).not.toBe('');
    expect(f.raise).not.toBe('0');
  }, 60000);

  it('7: WHEN a `git-index-pack` wrapper is first in GIT_EXEC_PATH (copy of the real exec dir with only index-pack replaced by a script that records `ulimit -c` and `ulimit -Hc` and then runs the real one) and v0.2.7 is the oversized 3 MiB release with cap `1048576` THEN the recorded index-pack core limit is `0` and hard limit `0` (the process that actually receives SIGXFSZ, not only git)', () => {
    const box = makeBox('big3', { timeout: true, cap: CAP });
    // The script unsets every GIT_* variable, so GIT_EXEC_PATH cannot carry the wrapper in: the git shim
    // passes --exec-path=<wrapper dir> to the real git instead (same effect: the wrapper dir comes first).
    const exec = spawnSync(REAL_GIT, ['--exec-path'], { encoding: 'utf8' }).stdout.trim();
    const wrap = join(box.dir, 'exec');
    mkdirSync(wrap);
    for (const name of readdirSync(exec)) symlinkSync(join(exec, name), join(wrap, name));
    for (const name of ['git-index-pack', 'git']) {
      rmSync(join(wrap, name), { force: true });
      put(join(wrap, name), RECORD_PACK, 0o755);
    }
    box.env.EXEC_FLAG = `--exec-path=${wrap}`;
    box.env.PACK_LOG = join(box.dir, 'pack.log');
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release 0.2.7 could not be downloaded.');
    expect(existsSync(box.env.PACK_LOG)).toBe(true);
    const lines = readFileSync(box.env.PACK_LOG, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const m = /^index-pack c=0 Hc=0 xfsz=(\S+)$/.exec(l);
      expect(m).not.toBeNull();
      expect(xfszIgnored(m![1])).toBe(true); // the process that would receive SIGXFSZ ignores it: EFBIG, no journal entry
    }
  }, 60000);
});
