/**
 * Issue #197: bar-update reads the release list
 * with a size cap while it reads (not after it is all in memory) and time-limits
 * every network git call even when timeout(1) is not on PATH. Each case runs the
 * real script against a stand-in git on PATH, a throwaway clone and a stand-in setup.
 * RUNNER: Linux only (bash, sleep, head -c, process signals).
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'packaging', 'omarchy', 'bar-update');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const CHUNKS = 48; // 48 chunks of 64 KiB = 3 MiB, three times the 1 MiB cap

const SETUP_STUB = `#!/bin/bash
if [ "\${1:-}" = "--check" ]; then exit 1; fi
d="$(cd "$(dirname "$0")/../.." && pwd)"
echo "SETUP-RAN $(cat "$d/plugin-dist/VERSION")" >> "$STUB_LOG"
mkdir -p "$XDG_DATA_HOME/omarchy-snote-plugin/app"
cp "$d/plugin-dist/VERSION" "$XDG_DATA_HOME/omarchy-snote-plugin/app/VERSION"
`;

// The stand-in git: MODE=flood streams a huge ref list in 64 KiB chunks and logs each chunk;
// MODE=hang-ls / MODE=hang-fetch replaces that one network call by a sleep (exec, so a signal reaches it).
const GIT_SHIM = `#!/bin/bash
sub=""
for a in "$@"; do case "$a" in ls-remote|fetch) sub="$a"; break ;; esac; done
if [ -n "$sub" ] && [ "$MODE" = normal ]; then
  # Return only after this call's limit is armed: call k waits until sleep.log holds k lines (at most 2 s).
  k=0; [ -f "$SLEEP_LOG.calls" ] && read -r k < "$SLEEP_LOG.calls"
  k=$((k + 1)); echo "$k" > "$SLEEP_LOG.calls"
  t0=$EPOCHREALTIME
  while :; do
    c=0; [ -f "$SLEEP_LOG" ] && while IFS= read -r _; do c=$((c + 1)); done < "$SLEEP_LOG"
    [ "$c" -ge "$k" ] && break
    [ $(( (\${EPOCHREALTIME/./} - \${t0/./}) / 1000 )) -ge 2000 ] && break
    "$REAL_SLEEP" 0.01
  done
fi
if [ "$sub" = ls-remote ] && [ "$MODE" = flood ]; then
  line="$(head -c 65400 /dev/zero | tr '\\0' 'x')"
  for i in $(seq 1 ${CHUNKS}); do printf '%s\\n' "$line"; echo "$i" >> "$CHUNK_LOG"; done
  exit 0
fi
if [ "$sub" = ls-remote ] && [ "$MODE" = hang-ls ]; then exec sleep 30; fi
if [ "$sub" = ls-remote ] && [ "$MODE" = hang-fetch ]; then printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\trefs/tags/v0.2.7\\n'; exit 0; fi
if [ "$sub" = fetch ] && [ "$MODE" = hang-fetch ]; then exec sleep 30; fi
exec "$REAL_GIT" "$@"
`;

// In the normal case `sleep` is a wrapper that logs its pid and argument, then becomes the real sleep:
// it shows the watchdog started for each network call and is gone when bar-update ends.
const SLEEP_WRAP = `#!/bin/bash
echo "$$ $1" >> "$SLEEP_LOG"
exec "$REAL_SLEEP" "$@"
`;

let root: string;
let origin: string;
let template: string;
let counter = 0;

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

function put(file: string, text: string, mode = 0o644): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, mode);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'snote-bar-bounds-'));
  origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(join(root, 'fixture-home'));
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', work);
  put(join(work, 'plugin-dist', 'VERSION'), '0.2.6\n');
  put(join(work, 'packaging', 'omarchy', 'setup'), SETUP_STUB, 0o755);
  put(join(work, 'packaging', 'omarchy', 'bar-update'), readFileSync(SCRIPT, 'utf8'), 0o755);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release 0.2.6');
  git(work, 'tag', 'v0.2.6');
  git(work, 'push', '-q', origin, 'main', 'v0.2.6');
  template = join(root, 'template');
  git(root, 'clone', '-q', '--no-tags', origin, template);
  git(template, 'config', 'remote.origin.url', origin);
  put(join(work, 'plugin-dist', 'VERSION'), '0.2.7\n');
  git(work, 'commit', '-q', '-am', 'release 0.2.7');
  git(work, 'tag', '-a', '-m', 'release 0.2.7', 'v0.2.7');
  git(work, 'push', '-q', origin, 'main', '--tags');
}, 10000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

interface Box { dir: string; clone: string; xdg: string; setupLog: string; chunkLog: string; env: Record<string, string> }

function realTool(name: string): string {
  return (process.env.PATH ?? '').split(':').map((d) => join(d, name)).find((f) => existsSync(f)) ?? '';
}

/** A PATH without timeout(1): the shim git plus links to the few tools the script and the shim use. */
function makeBox(mode: string, withTimeout: boolean): Box {
  const dir = join(root, `case-${++counter}`);
  const clone = join(dir, 'clone');
  const xdg = join(dir, 'xdg');
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, 'home'));
  cpSync(template, clone, { recursive: true });
  put(join(bin, 'git'), GIT_SHIM, 0o755);
  const tools = ['cat', 'tr', 'dirname', 'sleep', 'head', 'seq', 'env', 'bash', 'sh', 'uname', 'rm', 'mkdir', 'cp', 'sed', 'ls'];
  if (withTimeout) tools.push('timeout');
  for (const t of tools) {
    const p = realTool(t);
    if (p && !existsSync(join(bin, t))) symlinkSync(p, join(bin, t));
  }
  put(join(xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), '0.2.6\n');
  if (mode === 'normal') {
    rmSync(join(bin, 'sleep'));
    put(join(bin, 'sleep'), SLEEP_WRAP, 0o755);
  }
  return {
    dir, clone, xdg, setupLog: join(dir, 'setup.log'), chunkLog: join(dir, 'chunks.log'),
    env: {
      PATH: bin, HOME: join(dir, 'home'), XDG_DATA_HOME: xdg, STUB_LOG: join(dir, 'setup.log'),
      CHUNK_LOG: join(dir, 'chunks.log'), SLEEP_LOG: join(dir, 'sleep.log'), REAL_SLEEP: realTool('sleep'), REAL_GIT, MODE: mode, ...(mode.startsWith('hang') ? { SNOTE_UPDATE_NET_SECS: '0.4' } : {}),
    },
  };
}

function run(box: Box) {
  const t0 = Date.now();
  const r = spawnSync('/bin/bash', [join(box.clone, 'packaging', 'omarchy', 'bar-update')], {
    input: 'y\n', encoding: 'utf8', timeout: 12000, env: box.env,
  });
  return { status: r.status, err: String(r.stderr ?? ''), out: String(r.stdout ?? ''), ms: Date.now() - t0 };
}

const head = (box: Box): string => git(box.clone, 'rev-parse', 'HEAD');
const setupRuns = (box: Box): string[] =>
  existsSync(box.setupLog) ? readFileSync(box.setupLog, 'utf8').trim().split('\n') : [];
const chunks = (box: Box): number =>
  existsSync(box.chunkLog) ? readFileSync(box.chunkLog, 'utf8').trim().split('\n').length : 0;

describe('issue #197 bar-update bounds its network reads', () => {
  it('1: WHEN the origin\'s ref list is larger than the cap THEN bar-update stops reading at the cap (`git` is stopped before it has written all `48` chunks), refuses with `release list was too large` and `Nothing was reinstalled`, and changes nothing', () => {
    const box = makeBox('flood', true);
    const before = head(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('release list was too large');
    expect(r.err).toContain('Nothing was reinstalled');
    expect(chunks(box)).toBeGreaterThan(0);
    expect(chunks(box)).toBeLessThan(CHUNKS);
    expect(setupRuns(box)).toEqual([]);
    expect(head(box)).toBe(before);
  });

  it('2: WHEN `timeout` is not on PATH and the ls-remote call never answers THEN it is still stopped after `SNOTE_UPDATE_NET_SECS` seconds, the output says `looked up` and nothing changes', () => {
    const box = makeBox('hang-ls', false);
    expect(existsSync(join(box.env.PATH, 'timeout'))).toBe(false);
    const before = head(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('looked up');
    expect(r.ms).toBeLessThan(10000);
    expect(setupRuns(box)).toEqual([]);
    expect(head(box)).toBe(before);
  });

  it('3: WHEN `timeout` is not on PATH and the fetch call never answers THEN it is still stopped after `SNOTE_UPDATE_NET_SECS` seconds, the output says `could not be downloaded` and nothing changes', () => {
    const box = makeBox('hang-fetch', false);
    const before = head(box);
    const r = run(box);
    expect(r.status).toBe(1);
    expect(r.err).toContain('could not be downloaded');
    expect(r.ms).toBeLessThan(10000);
    expect(setupRuns(box)).toEqual([]);
    expect(head(box)).toBe(before);
  });

  it('4: WHEN `timeout` is not on PATH and the origin answers normally THEN the clone moves to `0.2.7`, setup runs once, a `60` second limit was armed for each of the `2` network calls and none of them is left running', () => {
    const box = makeBox('normal', false);
    const r = run(box);
    expect(r.status).toBe(0);
    expect(setupRuns(box)).toEqual(['SETUP-RAN 0.2.7']);
    expect(readFileSync(join(box.clone, 'plugin-dist', 'VERSION'), 'utf8').trim()).toBe('0.2.7');
    const armed = existsSync(join(box.dir, 'sleep.log')) ? readFileSync(join(box.dir, 'sleep.log'), 'utf8').trim().split('\n') : [];
    expect(armed.map((l) => l.split(' ')[1])).toEqual(['60', '60']);
    const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const pids = armed.map((l) => Number(l.split(' ')[0]));
    for (let i = 0; i < 40 && pids.some(alive); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    expect(pids.some(alive)).toBe(false);
  });

  it('5: WHEN src, packaging and scripts are scanned THEN every `ls-remote` and `fetch` call in bar-update goes through `run_limited` and the ls-remote output is read through `head -c`', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    const calls = text.split('\n').filter((l) => !l.trim().startsWith('#') && /\bgit\b.*\b(ls-remote|fetch)\b/.test(l));
    expect(calls.length).toBe(2);
    for (const l of calls) expect(l).toContain('run_limited git');
    const ls = calls.find((l) => l.includes('ls-remote')) ?? '';
    expect(ls).toContain('| head -c $((list_cap + 1))');
    const others = ['setup', 'install.sh', 'uninstall'].map((f) => readFileSync(join(process.cwd(), 'packaging', 'omarchy', f), 'utf8'));
    for (const o of others) expect(/\bgit\b.*\b(ls-remote|fetch)\b/.test(o.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'))).toBe(false);
    expect(readdirSync(join(process.cwd(), 'packaging', 'omarchy')).includes('bar-update')).toBe(true);
  });
});
