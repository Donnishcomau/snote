// #67 (part 4): packaging/omarchy/setup writes a `checked` mark for the
// installed build only after its start check passed, treats a build as
// current only while that mark names its VERSION, and four controls of the
// rollback and start-check code are each guarded by a test (FINDINGS F242,
// F243). Linux only (flock). The "kill during the start check" is a fake `rm`
// first on PATH: setup's first `rm` of the check directory runs right after
// the check ran, and the fake kills setup then. Every case runs in its own
// mkdtemp sandbox; nothing touches the real HOME.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, env, makeSandbox, runSetup, runShim, setBuild, startHold } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;

afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

const SPAWN_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);

/** Setup with a fake `rm` first on PATH that kills setup right after it removes a `check.` directory (the end of the start check). */
function runSetupKilledInStartCheck(s: Sandbox) {
  const bin = join(s.root, 'fakebin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'rm'),
    ['#!/bin/sh', '/usr/bin/rm "$@" || exit $?', 'case "$*" in', '  */check.*) kill -9 $PPID ;;', 'esac', ''].join('\n'),
    { mode: 0o755 },
  );
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: { ...env(s), PATH: `${bin}:${process.env.PATH ?? ''}` },
    timeout: SPAWN_MS,
    killSignal: 'SIGKILL',
  });
}

/** 1.0.0 installed, then a run installing 2.0.0 that is killed during the start check. */
function killedUpgrade(): Sandbox {
  const box = makeSandbox('1.0.0');
  expect(runSetup(box).status).toBe(0);
  setBuild(box, '2.0.0');
  const killed = runSetupKilledInStartCheck(box);
  expect(killed.status).toBeNull();
  expect(readFileSync(join(box.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
  return box;
}

describe('packaging/omarchy/setup: the checked mark and the guarded controls (#67 part 4)', () => {
  it('1: WHEN `setup` installing `2.0.0` over `1.0.0` is killed during the start check THEN no `checked` mark exists, `setup --check` exits `1`, and a re-run exits `0` with `checked` holding `2.0.0` at mode `600` and `setup --check` exiting `0`', () => {
    sb = killedUpgrade();
    const mark = join(sb.pluginDir, 'checked');
    expect(existsSync(mark)).toBe(false);
    expect(runSetup(sb, ['--check']).status).toBe(1);

    const rerun = runSetup(sb);

    expect(rerun.status).toBe(0);
    expect(readFileSync(mark, 'utf8')).toBe('2.0.0\n');
    expect(statSync(mark).mode & 0o777).toBe(0o600);
    expect(runSetup(sb, ['--check']).status).toBe(0);
  });

  it('2: WHEN `setup` was killed during the start check and the installed `2.0.0` does not start THEN a re-run exits `1` printing `update failed: kept 1.0.0`, the shim prints `fake snote 1.0.0` and no `checked` mark exists', () => {
    sb = killedUpgrade();
    writeFileSync(join(sb.pluginDir, 'app', 'cli.js'), 'process.exit(1);\n');

    const rerun = runSetup(sb);

    expect(rerun.status).toBe(1);
    expect(rerun.stderr.trim().split('\n')).toEqual(['snote setup: update failed: kept 1.0.0']);
    expect(runShim(sb, ['--version']).stdout).toBe('fake snote 1.0.0\n');
    expect(existsSync(join(sb.pluginDir, 'checked'))).toBe(false);
  });

  it('3: WHEN snote is running from the installed `2.0.0` and the user runs `setup --rollback` THEN it exits `1` printing `snote is running` and `app` still holds `2.0.0` with `app.prev` holding `1.0.0`', async () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    const held = await startHold(sb, sb.shim, ['--hold']);
    try {
      const res = runSetup(sb, ['--rollback']);

      expect(res.status).toBe(1);
      expect(res.stderr).toContain('snote is running');
      expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
      expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8')).toBe('1.0.0\n');
    } finally {
      await held.stop();
    }
  });

  it('4: WHEN the caller env holds `SNOTE_SENTINEL` and `setup` installs `2.0.0` THEN the build run by the start check (its env has `SNOTE_UPDATE_CHECK` `off`) does not see `SNOTE_SENTINEL`', () => {
    sb = makeSandbox('1.0.0');
    const log = join(sb.root, 'env.log');
    writeFileSync(
      join(sb.clone, 'plugin-dist', 'cli.js'),
      [
        `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.env) + '\\n');`,
        "console.log('fake snote 1.0.0');",
        '',
      ].join('\n'),
    );

    const res = spawnSync('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup')], {
      encoding: 'utf8',
      env: { ...env(sb), SNOTE_SENTINEL: 'leak-me' },
      timeout: SPAWN_MS,
      killSignal: 'SIGKILL',
    });

    expect(res.status).toBe(0);
    const runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, string>);
    const checks = runs.filter((e) => e.SNOTE_UPDATE_CHECK === 'off');
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.some((e) => 'SNOTE_SENTINEL' in e)).toBe(false);
    expect(runs.some((e) => e.SNOTE_SENTINEL === 'leak-me')).toBe(true);
  });

  it('5: WHEN `setup --rollback` takes `2.0.0` back to `1.0.0` THEN the `rolled-back` mark holds `2.0.0` at mode `600`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);

    const res = runSetup(sb, ['--rollback']);

    expect(res.status).toBe(0);
    const mark = join(sb.pluginDir, 'rolled-back');
    expect(readFileSync(mark, 'utf8')).toBe('2.0.0\n');
    expect(statSync(mark).mode & 0o777).toBe(0o600);
  });

  it('6: WHEN `rolled-back` in the plugin directory is a symlink to a file and the user runs `setup --rollback` THEN it exits `1` printing `the rolled-back mark` and the file and the symlink are unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    const victim = join(sb.root, 'victim.txt');
    writeFileSync(victim, 'keep me\n');
    symlinkSync(victim, join(sb.pluginDir, 'rolled-back'));

    const res = runSetup(sb, ['--rollback']);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('the rolled-back mark');
    expect(readFileSync(victim, 'utf8')).toBe('keep me\n');
    expect(lstatSync(join(sb.pluginDir, 'rolled-back')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
  });
});
