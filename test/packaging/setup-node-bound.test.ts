// #484: every node run packaging/omarchy/setup makes (the Node probe, the start check and the closing shim run) is
// bounded by setup's own shell on any host, with or without coreutils' timeout. The bound is injected as
// SNOTE_SETUP_PROBE_SECS=0.5 so each case ends well inside the 2500 ms spawn limit; the default stays 10 s (test 4).
// The node stand-in is a /bin/sh script given as SNOTE_NODE: it answers or hangs depending on the call.
// Linux only (flock), like every setup sandbox test.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, env, makeSandbox } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;

afterEach(() => {
  // rev2 (#668): end any hung child the forking wrapper recorded (only a failing run leaves one), by its recorded pid
  const pids = sb ? join(sb.root, 'hung-pids') : '';
  if (pids && existsSync(pids)) {
    for (const p of readFileSync(pids, 'utf8').split('\n').filter(Boolean)) {
      try {
        process.kill(Number(p), 'SIGKILL');
      } catch {
        // already gone: the expected case
      }
    }
  }
  cleanup(sb);
  sb = undefined;
});

const SPAWN_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);

/** A node stand-in: `version` answers `--version` (null: it hangs there too); `startCheck` runs the real node in the start check (HOME under check.*), anything else hangs. */
function stubNode(s: Sandbox, version: string | null, startCheck: boolean): string {
  const p = join(s.root, 'stub-node');
  writeFileSync(
    p,
    [
      '#!/bin/sh',
      version === null ? '' : `if [ "$1" = --version ]; then echo ${version}; exit 0; fi`,
      startCheck ? `case "$HOME" in */check.*) exec ${JSON.stringify(process.execPath)} "$@" ;; esac` : '',
      'exec sleep 10',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return p;
}

/**
 * rev2 (#668): a SNOTE_NODE wrapper that FORKS the hung node instead of exec-ing it. The first `--version` answers
 * `v22.0.0` (the probe before the run lock); every later one (the probe inside the start check, run with the lock held)
 * forks `sleep 30` (the node that never answers), records its pid in <sandbox>/hung-pids and waits for it. With `detach`
 * the child leaves the process group (setsid) and drops its output, so only its inherited fd 9 can hold the run lock.
 */
function forkingNode(s: Sandbox, detach = false): string {
  const p = join(s.root, 'fork-node');
  writeFileSync(
    p,
    [
      '#!/bin/sh',
      'if [ "$1" = --version ]; then',
      `  echo x >> ${JSON.stringify(join(s.root, 'probes'))}`,
      `  [ "$(wc -l < ${JSON.stringify(join(s.root, 'probes'))})" -le 1 ] && { echo v22.0.0; exit 0; }`,
      'fi',
      detach ? 'setsid sleep 30 >/dev/null 2>&1 &' : 'sleep 30 &',
      `echo $! >> ${JSON.stringify(join(s.root, 'hung-pids'))}`,
      'wait',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return p;
}

/**
 * rev3 (#668, SEC amend): a SNOTE_NODE wrapper that answers `v22.0.0` to every call, then backgrounds a node that never
 * answers (recording its pid in <sandbox>/hung-pids) and EXITS 0 without waiting: the run returns before the bound, but
 * the child still holds the run's output (the probe's `| sed` pipe, the start check's `$(...)`).
 */
function answerAndLeaveNode(s: Sandbox): string {
  const p = join(s.root, 'leave-node');
  writeFileSync(
    p,
    [
      '#!/bin/sh',
      'echo v22.0.0',
      'sleep 30 &',
      `echo $! >> ${JSON.stringify(join(s.root, 'hung-pids'))}`,
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return p;
}

function setup(s: Sandbox, node: string) {
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: { ...env(s), SNOTE_NODE: node, SNOTE_SETUP_PROBE_SECS: '0.5' },
    timeout: SPAWN_MS,
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: node runs are bounded on any host (#484)', () => {
  it('1: WHEN SNOTE_NODE is a stand-in that never answers `--version` THEN setup exits `1` (not killed by the spawn limit) and stderr holds `snote needs Node.js 22 or newer`', () => {
    sb = makeSandbox('1.0.0');
    const r = setup(sb, stubNode(sb, null, false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('snote needs Node.js 22 or newer');
  });

  it('2: WHEN the stand-in answers `v22.0.0` to `--version` but never answers the start check THEN setup exits `1` (not killed) and stderr holds `install failed: the new build did not start`', () => {
    sb = makeSandbox('1.0.0');
    const r = setup(sb, stubNode(sb, 'v22.0.0', false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('install failed: the new build did not start');
  });

  it('3: WHEN the stand-in passes the probe and the start check but never answers the closing shim run THEN setup exits `0` (not killed) and stdout holds `snote is installed. Launching it now...`', () => {
    sb = makeSandbox('1.0.0');
    const r = setup(sb, stubNode(sb, 'v22.0.0', true));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('snote is installed. Launching it now...');
  });

  it('4: WHEN packaging/omarchy/setup is read as text THEN the bound defaults to `probe_secs=10`, SNOTE_SETUP_PROBE_SECS is taken only as 1 to 9 or 0.1 to 0.9, and no line names `timeout`', () => {
    const text = readFileSync(join(process.cwd(), 'packaging', 'omarchy', 'setup'), 'utf8');
    expect(text.split('\n')).toContain('probe_secs=10');
    expect(text).toContain('case "${SNOTE_SETUP_PROBE_SECS:-}" in [1-9]|0.[1-9]) probe_secs=$SNOTE_SETUP_PROBE_SECS ;; esac');
    expect(text.split('\n').filter((l) => l.includes('timeout'))).toEqual([]);
  });
  it('5: rev2 (#668) WHEN the SNOTE_NODE wrapper forks a node that never answers, under the run lock, THEN setup exits `1` (not killed) and stderr holds `install failed: the new build did not start`, and a second setup takes the run lock and installs', () => {
    sb = makeSandbox('1.0.0');
    const first = setup(sb, forkingNode(sb));
    expect(first.error).toBeUndefined();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('install failed: the new build did not start');
    expect(existsSync(join(sb.root, 'hung-pids'))).toBe(true);
    const second = setup(sb, stubNode(sb, 'v22.0.0', true));
    expect(second.stderr).not.toContain('snote is running');
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('snote is installed. Launching it now...');
  });

  it('6: rev2 (#668) WHEN the forked node also left the process group and dropped its output (so only its fd 9 could hold the lock) THEN setup exits `1` (not killed) and stderr holds `install failed: the new build did not start`, and a second setup takes the run lock and installs', () => {
    sb = makeSandbox('1.0.0');
    const first = setup(sb, forkingNode(sb, true));
    expect(first.error).toBeUndefined();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('install failed: the new build did not start');
    expect(existsSync(join(sb.root, 'hung-pids'))).toBe(true);
    const second = setup(sb, stubNode(sb, 'v22.0.0', true));
    expect(second.stderr).not.toContain('snote is running');
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('snote is installed. Launching it now...');
  });

  it('7: rev3 (#668) WHEN the SNOTE_NODE wrapper answers `v22.0.0`, backgrounds a node that never answers and exits 0 THEN setup exits `1` (not killed) and stderr holds `install failed: the new build did not start`, and a second setup takes the run lock and installs', () => {
    sb = makeSandbox('1.0.0');
    const first = setup(sb, answerAndLeaveNode(sb));
    expect(first.error).toBeUndefined();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('install failed: the new build did not start');
    expect(existsSync(join(sb.root, 'hung-pids'))).toBe(true);
    const second = setup(sb, stubNode(sb, 'v22.0.0', true));
    expect(second.stderr).not.toContain('snote is running');
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('snote is installed. Launching it now...');
  });
});
