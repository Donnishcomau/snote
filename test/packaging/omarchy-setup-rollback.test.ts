// #67 (part 2): `setup --rollback` brings the previous build back, a new
// build that fails its start check is replaced by the previous one with a
// plain message, the start check runs in an isolated environment, and after a
// rollback the bar's `--check` does not ask for the same version again.
// Linux only (flock, /proc). Every case runs in its own mkdtemp sandbox
// (HOME, XDG_DATA_HOME, clone); nothing touches the real HOME.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Sandbox,
  cleanup,
  fillDataFolder,
  makeSandbox,
  runSetup,
  runShim,
  setBuild,
  treeFingerprint,
} from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;

afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

function installTwice(first: string, second: string): Sandbox {
  const box = makeSandbox(first);
  expect(runSetup(box).status).toBe(0);
  setBuild(box, second);
  expect(runSetup(box).status).toBe(0);
  return box;
}

describe('packaging/omarchy/setup: rollback and the start check (#67 part 2)', () => {
  it('1: WHEN the user runs `setup --rollback` after `1.0.0` was replaced by `2.0.0` THEN it exits `0`, `snote --version` of the shim prints `fake snote 1.0.0` and `app.prev` no longer exists', () => {
    sb = installTwice('1.0.0', '2.0.0');
    expect(runShim(sb, ['--version']).stdout).toBe('fake snote 2.0.0\n');

    const res = runSetup(sb, ['--rollback']);

    expect(res.status).toBe(0);
    const run = runShim(sb, ['--version']);
    expect(run.stdout).toBe('fake snote 1.0.0\n');
    expect(run.status).toBe(0);
    expect(existsSync(join(sb.pluginDir, 'app.prev'))).toBe(false);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('1.0.0\n');
  });

  it('2: WHEN the user runs `setup --rollback` with no previous build THEN it exits `1` printing `no previous build to roll back to` and the installed build is unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    const before = treeFingerprint(join(sb.pluginDir, 'app'));
    expect(before.length).toBeGreaterThan(1);

    const res = runSetup(sb, ['--rollback']);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no previous build to roll back to');
    expect(treeFingerprint(join(sb.pluginDir, 'app'))).toEqual(before);
  });

  it('3: WHEN the new build fails its start check (its `--version` exits 1) THEN setup exits `1` printing the one line `update failed: kept 1.0.0`, `snote --version` of the shim prints `fake snote 1.0.0`, and with nothing installed before it exits `1` printing `install failed` and leaves no `app` and no shim', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    const shimBefore = readFileSync(sb.shim, 'utf8');
    const cloneBefore = treeFingerprint(join(sb.clone, 'plugin-dist'));
    setBuild(sb, '2.0.0', 'broken');
    const brokenBuild = treeFingerprint(join(sb.clone, 'plugin-dist'));

    const res = runSetup(sb);

    expect(res.status).toBe(1);
    expect(res.stderr.trim().split('\n')).toEqual(['snote setup: update failed: kept 1.0.0']);
    const run = runShim(sb, ['--version']);
    expect(run.stdout).toBe('fake snote 1.0.0\n');
    expect(readFileSync(sb.shim, 'utf8')).toBe(shimBefore);
    expect(treeFingerprint(join(sb.clone, 'plugin-dist'))).toEqual(brokenBuild);
    expect(brokenBuild).not.toEqual(cloneBefore);
    expect(readdirSync(sb.pluginDir).sort()).toEqual(['app', 'run.lock']);

    const fresh = makeSandbox('3.0.0');
    setBuild(fresh, '3.0.0', 'broken');
    const first = runSetup(fresh);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('install failed');
    expect(existsSync(join(fresh.pluginDir, 'app'))).toBe(false);
    expect(existsSync(fresh.shim)).toBe(false);
    cleanup(fresh);
  });

  it('4: WHEN setup runs the new build\'s start check THEN the build sees a HOME and an XDG_DATA_HOME inside a temp directory of its own, not the caller\'s, so setup exits `0` and `app/VERSION` is `2.0.0`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0', 'strict-env');

    const res = runSetup(sb);

    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
    const seen = readFileSync(join(sb.root, 'probe.log'), 'utf8').trim().split('\n');
    const [home, data] = seen[0].split('|');
    expect(home.startsWith(join(sb.pluginDir, 'check.'))).toBe(true);
    expect(data.startsWith(join(sb.pluginDir, 'check.'))).toBe(true);
    expect(home).not.toBe(sb.home);
    expect(data).not.toBe(sb.xdg);
    expect(readdirSync(sb.pluginDir).sort()).toEqual(['app', 'app.prev', 'checked', 'run.lock']);
  });

  it('5: WHEN `setup --rollback` has run THEN `setup --check` exits `0` while the clone still ships `2.0.0`, exits `1` once the clone ships `3.0.0`, and running `setup` by hand installs `2.0.0` again', () => {
    sb = installTwice('1.0.0', '2.0.0');
    expect(runSetup(sb, ['--check']).status).toBe(0);
    expect(runSetup(sb, ['--rollback']).status).toBe(0);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('1.0.0\n');

    expect(runSetup(sb, ['--check']).status).toBe(0);

    setBuild(sb, '3.0.0');
    expect(runSetup(sb, ['--check']).status).toBe(1);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb, ['--check']).status).toBe(0);
    expect(runSetup(sb).status).toBe(0);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
    expect(existsSync(join(sb.pluginDir, 'rolled-back'))).toBe(false);
  });

  it('6: WHEN `setup --rollback` runs, and when a new build fails its start check, THEN nothing in the snote data folder changes', () => {
    sb = installTwice('1.0.0', '2.0.0');
    fillDataFolder(sb);
    const before = treeFingerprint(sb.dataDir);
    expect(before.length).toBeGreaterThan(3);

    expect(runSetup(sb, ['--rollback']).status).toBe(0);
    setBuild(sb, '3.0.0', 'broken');
    expect(runSetup(sb).status).toBe(1);

    expect(treeFingerprint(sb.dataDir)).toEqual(before);
  });
});
