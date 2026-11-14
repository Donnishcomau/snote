/**
 * Issue #30 L5a1 AC7: the hand-off argv holds no remote text and survives a hostile install path. The launcher runs its
 * argument with `bash -c` (omarchy-launch-floating-terminal-with-presentation joins "$*"), so each case runs the inner
 * command with bash against stub commands in a home whose path holds a space, a quote, `$()` and a backtick.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pluginHandOffArgv } from '../../src/core/update-handoff';

const STILL_RUNNING = 'another snote is still running: quit it and press U again';
const paths = (home: string) => ({
  barUpdate: path.join(home, '.config', 'omarchy', 'plugins', 'io.github.donnishcomau.snote-simplenote', 'packaging', 'omarchy', 'bar-update'),
  lock: path.join(home, '.local', 'share', 'omarchy-snote-plugin', 'run.lock'),
});

let root: string;
let home: string;
let bin: string;
let log: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'l5a1-argv-'));
  home = path.join(root, "h o'me $(touch pwned1) `touch pwned2`");
  bin = path.join(root, 'bin');
  log = path.join(root, 'calls.log');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'omarchy-launch-or-focus-tui'), `#!/bin/sh\necho "tui $*" >> '${log}'\n`, { mode: 0o755 });
  const p = paths(home);
  fs.mkdirSync(path.dirname(p.barUpdate), { recursive: true });
  fs.writeFileSync(p.barUpdate, `#!/bin/sh\necho "bar-update $#" >> '${log}'\n`, { mode: 0o755 });
  fs.mkdirSync(path.dirname(p.lock), { recursive: true });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function runInner(waitSeconds = 1) {
  const argv = pluginHandOffArgv(home, {}, waitSeconds);
  const r = spawnSync('bash', ['-c', argv[1]], { cwd: root, env: { PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8' });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  return { status: r.status, out: r.stdout, calls, pwned: ['pwned1', 'pwned2'].filter((f) => fs.existsSync(path.join(root, f))) };
}

describe('issue #30 L5a1 hand-off argv (AC7)', () => {
  it('1: WHEN the install path holds a space, a quote, `$()` and a backtick and run.lock is a free regular file THEN the argv is exactly [launcher, inner], and the inner command runs bar-update once with no argument, then `omarchy-launch-or-focus-tui snote`, exits 0 and runs no injected command', () => {
    fs.writeFileSync(paths(home).lock, '');
    const argv = pluginHandOffArgv(home, {});
    expect(argv).toHaveLength(2);
    expect(argv[0]).toBe('omarchy-launch-floating-terminal-with-presentation');
    expect(runInner()).toEqual({ status: 0, out: '', calls: 'bar-update 0\ntui snote\n', pwned: [] });
  });

  it('2: WHEN another process holds run.lock THEN the inner command waits at most its bound, prints `another snote is still running: quit it and press U again`, exits 1 and never runs bar-update', async () => {
    const lock = paths(home).lock;
    fs.writeFileSync(lock, '');
    const holder = spawn('/usr/bin/flock', ['-x', lock, '-c', 'echo held; sleep 5'], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));
      expect(runInner(1)).toEqual({ status: 1, out: `${STILL_RUNNING}\n`, calls: '', pwned: [] });
    } finally {
      holder.kill('SIGKILL');
    }
  });

  it('3: WHEN run.lock is missing, or is a symlink to a regular file another process holds locked, THEN the inner command does not wait on it or follow it, runs bar-update once and exits 0 (setup decides about the lock)', async () => {
    const lock = paths(home).lock;
    expect(runInner()).toEqual({ status: 0, out: '', calls: 'bar-update 0\ntui snote\n', pwned: [] });
    fs.rmSync(log);
    const target = path.join(root, 'elsewhere.lock');
    fs.writeFileSync(target, '');
    fs.symlinkSync(target, lock);
    const holder = spawn('/usr/bin/flock', ['-x', target, '-c', 'echo held; sleep 5'], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));
      expect(runInner(1)).toEqual({ status: 0, out: '', calls: 'bar-update 0\ntui snote\n', pwned: [] });
    } finally {
      holder.kill('SIGKILL');
    }
  });

  it('4: WHEN src/core/update-handoff.ts is read THEN its only process start is one spawn of the launcher with `detached: true` and `stdio: \'ignore\'`, it never sets `shell`, and the inner text is fixed apart from the two q()-quoted install paths', () => {
    const src = fs.readFileSync('src/core/update-handoff.ts', 'utf8');
    expect(src.match(/nodeSpawn\)\(/g)).toHaveLength(1);
    expect(src).toContain("{ detached: true, stdio: 'ignore', env, timeout: 10_000 }");
    expect(src).not.toMatch(/shell\s*:|execSync|exec\(|execFile/);
    const inner = pluginHandOffArgv('/H', { XDG_DATA_HOME: '/D' })[1];
    expect(inner).toBe("if [ ! -f '/D/omarchy-snote-plugin/run.lock' ] || [ -L '/D/omarchy-snote-plugin/run.lock' ] || /usr/bin/flock -x -w 10 '/D/omarchy-snote-plugin/run.lock' true; then '/H/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote/packaging/omarchy/bar-update' && omarchy-launch-or-focus-tui snote; else echo 'another snote is still running: quit it and press U again'; false; fi");
  });
});
