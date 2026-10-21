// #67 (part 3): packaging/omarchy/setup writes the new shim before its two
// renames, builds a stage that is not group- or world-writable, holds the
// exclusive run lock through the swap, and removes leftover stage directories
// of a killed run under that lock. Linux only (flock). The "kill" and the
// "moment between the renames" are a fake `mv` first on PATH that acts right
// after setup's rename of `app` to `app.prev`. Every case runs in its own
// mkdtemp sandbox; nothing touches the real HOME.
import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, env, looseModes, makeSandbox, runSetup, runShim, setBuild } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;

afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

/** Setup with a fake `mv` first on PATH. After the rename of `app` to `app.prev` it kills setup (`kill`) or records whether a shared non-blocking flock on run.lock succeeds (`probe`). */
function runSetupWithMvHook(s: Sandbox, hook: 'kill' | 'probe') {
  const bin = join(s.root, 'fakebin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'mv'),
    [
      '#!/bin/sh',
      '/usr/bin/mv "$@" || exit $?',
      'case "$2" in',
      '  */app.prev)',
      '    if [ "$MV_HOOK" = kill ]; then kill -9 $PPID; fi',
      '    if [ "$MV_HOOK" = probe ]; then /usr/bin/flock -s -n "$MV_LOCK" true; echo $? > "$MV_OUT"; fi',
      '    ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: {
      ...env(s),
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      MV_HOOK: hook,
      MV_LOCK: join(s.pluginDir, 'run.lock'),
      MV_OUT: join(s.root, 'probe.out'),
    },
    timeout: Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500),
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: shim first, closed modes, lock held through the swap, stage cleanup (#67 part 3)', () => {
  it('1: WHEN `setup` installs `2.0.0` over `1.0.0` from a shim with no `app.prev` fallback and is killed between its two renames THEN `snote --version` of the shim prints `fake snote 1.0.0`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    // The shim a 0.2.7 install has: no lock, no app.prev fallback.
    writeFileSync(
      sb.shim,
      `#!/bin/sh\n# snote-omarchy-shim v1 (packaging/omarchy/setup) — safe to remove\nexec '${process.execPath}' '${join(sb.pluginDir, 'app', 'cli.js')}' "$@"\n`,
      { mode: 0o755 },
    );
    setBuild(sb, '2.0.0');

    const killed = runSetupWithMvHook(sb, 'kill');

    expect(killed.status).toBeNull();
    expect(existsSync(join(sb.pluginDir, 'app'))).toBe(false);
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8')).toBe('1.0.0\n');
    const run = runShim(sb, ['--version']);
    expect(run.stdout).toBe('fake snote 1.0.0\n');
    expect(run.status).toBe(0);
  });

  it('2: WHEN `plugin-dist` holds a group-writable file and directory and `setup` runs with umask 0 THEN no file or directory under `app` is group- or world-writable', () => {
    sb = makeSandbox('1.0.0');
    const sub = join(sb.clone, 'plugin-dist', 'extra');
    mkdirSync(sub);
    writeFileSync(join(sub, 'loose.txt'), 'x\n');
    chmodSync(join(sub, 'loose.txt'), 0o666);
    chmodSync(sub, 0o777);
    expect(looseModes(join(sb.clone, 'plugin-dist')).length).toBeGreaterThan(1);

    const res = spawnSync('sh', ['-c', 'umask 0; exec bash "$0"', join(sb.clone, 'packaging', 'omarchy', 'setup')], {
      encoding: 'utf8',
      env: env(sb),
      timeout: Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500),
      killSignal: 'SIGKILL',
    });

    expect(res.status).toBe(0);
    expect(existsSync(join(sb.pluginDir, 'app', 'extra', 'loose.txt'))).toBe(true);
    expect(looseModes(join(sb.pluginDir, 'app'))).toEqual([]);
  });

  it('3: WHEN `setup` has renamed `app` to `app.prev` and not yet the new build into place THEN a non-blocking shared flock on `run.lock` fails with exit `1`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');

    const res = runSetupWithMvHook(sb, 'probe');

    expect(res.status).toBe(0);
    expect(readFileSync(join(sb.root, 'probe.out'), 'utf8')).toBe('1\n');
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
  });

  it('4: WHEN a killed run left the directories `app.AbC123`, `app.failed.4242`, `app.rolledback.4243` and `check.Xy9Z8w` in the plugin directory THEN `setup` removes all four and installs `2.0.0` with `app.prev` holding `1.0.0`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    const names = ['app.AbC123', 'app.failed.4242', 'app.rolledback.4243', 'check.Xy9Z8w'];
    for (const name of names) {
      mkdirSync(join(sb.pluginDir, name, 'sub'), { recursive: true });
      writeFileSync(join(sb.pluginDir, name, 'sub', 'half.js'), 'partial\n');
    }
    setBuild(sb, '2.0.0');

    const res = runSetup(sb);

    expect(res.status).toBe(0);
    for (const name of names) expect(existsSync(join(sb.pluginDir, name))).toBe(false);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8')).toBe('1.0.0\n');
    expect(readdirSync(sb.pluginDir).sort()).toEqual(['app', 'app.prev', 'checked', 'run.lock']);
  });

  it('5: WHEN `app.Sy1mL1` and `check.Sy1mL1` in the plugin directory are symlinks to a directory, `app.failed.12ab` is a directory there and `app.OuT123` is a directory beside the plugin directory THEN `setup` leaves all four and the files in them unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    const victim = join(sb.root, 'victim');
    mkdirSync(victim);
    writeFileSync(join(victim, 'important.txt'), 'keep me\n');
    symlinkSync(victim, join(sb.pluginDir, 'app.Sy1mL1'));
    symlinkSync(victim, join(sb.pluginDir, 'check.Sy1mL1'));
    const odd = join(sb.pluginDir, 'app.failed.12ab');
    mkdirSync(odd);
    writeFileSync(join(odd, 'odd.txt'), 'not a pid\n');
    const outside = join(sb.xdg, 'app.OuT123');
    mkdirSync(outside);
    writeFileSync(join(outside, 'other.txt'), 'keep me too\n');
    setBuild(sb, '2.0.0');

    const res = runSetup(sb);

    expect(res.status).toBe(0);
    expect(lstatSync(join(sb.pluginDir, 'app.Sy1mL1')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(sb.pluginDir, 'check.Sy1mL1')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(victim, 'important.txt'), 'utf8')).toBe('keep me\n');
    expect(readFileSync(join(odd, 'odd.txt'), 'utf8')).toBe('not a pid\n');
    expect(readFileSync(join(outside, 'other.txt'), 'utf8')).toBe('keep me too\n');
  });
});
