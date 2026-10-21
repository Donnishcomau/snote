// #67 (part 1): packaging/omarchy/setup never replaces the build under a
// running snote, keeps the previous build as app.prev (one copy), leaves the
// snote data folder alone, and keeps a runnable snote when it is killed
// between its two renames. Linux only (flock, /proc). Every case runs in its
// own mkdtemp sandbox (HOME, XDG_DATA_HOME, clone); nothing touches the real
// HOME.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Held,
  type Sandbox,
  cleanup,
  fillDataFolder,
  looseModes,
  makeSandbox,
  runSetup,
  runShim,
  setBuild,
  startHold,
  treeFingerprint,
} from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;
let held: Held | undefined;

afterEach(async () => {
  await held?.stop();
  held = undefined;
  cleanup(sb);
  sb = undefined;
});

const RUNNING = 'snote is running: quit it and run setup again';

describe('packaging/omarchy/setup: safe, reversible swap of the build (#67 part 1)', () => {
  it('1: WHEN snote is running, started through the shim, and `setup` installs a new build THEN setup exits `1` printing `snote is running: quit it and run setup again` and every file of the running build is unchanged', async () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    held = await startHold(sb, sb.shim, ['--hold-hidden']);
    const before = treeFingerprint(join(sb.pluginDir, 'app'));
    expect(before.length).toBeGreaterThan(1);
    setBuild(sb, '2.0.0');

    const res = runSetup(sb);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(RUNNING);
    expect(treeFingerprint(join(sb.pluginDir, 'app'))).toEqual(before);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('1.0.0\n');
    expect(existsSync(join(sb.pluginDir, 'app.prev'))).toBe(false);
  });

  it('2: WHEN a snote started by an older shim, which takes no lock, is running THEN `setup` exits `1` printing `snote is running: quit it and run setup again` and every file of the running build is unchanged', async () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    held = await startHold(sb, process.execPath, [join(sb.pluginDir, 'app', 'cli.js'), '--hold']);
    const before = treeFingerprint(join(sb.pluginDir, 'app'));
    expect(before.length).toBeGreaterThan(1);
    setBuild(sb, '2.0.0');

    const res = runSetup(sb);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(RUNNING);
    expect(treeFingerprint(join(sb.pluginDir, 'app'))).toEqual(before);
    expect(existsSync(join(sb.pluginDir, 'app.prev'))).toBe(false);
  });

  it('3: WHEN `setup` installs a new build over an installed one, twice, THEN `app.prev` holds the build installed before the last one, `app`, `app.prev` and `run.lock` are the only entries, and no file is group- or world-writable', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '3.0.0');
    expect(runSetup(sb).status).toBe(0);

    expect(readdirSync(sb.pluginDir).sort()).toEqual(['app', 'app.prev', 'checked', 'run.lock']);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('3.0.0\n');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8')).toBe('2.0.0\n');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'cli.js'), 'utf8')).toContain('"2.0.0"');
    expect(looseModes(sb.pluginDir)).toEqual([]);
  });

  it('4: WHEN `setup` installs, updates and is refused because snote is running THEN nothing in the snote data folder changes', async () => {
    sb = makeSandbox('1.0.0');
    fillDataFolder(sb);
    const before = treeFingerprint(sb.dataDir);
    expect(before.length).toBeGreaterThan(3);

    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    held = await startHold(sb, sb.shim, ['--hold-hidden']);
    setBuild(sb, '3.0.0');
    expect(runSetup(sb).status).toBe(1);

    expect(treeFingerprint(sb.dataDir)).toEqual(before);
  });

  it('5: WHEN `setup` was killed between its two renames, so `app` is missing and `app.prev` holds `1.0.0`, THEN `snote --version` of the shim prints `fake snote 1.0.0`, and running `setup` again installs `2.0.0` as `app` and keeps `1.0.0` as `app.prev`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    renameSync(join(sb.pluginDir, 'app'), join(sb.pluginDir, 'app.prev'));
    expect(existsSync(join(sb.pluginDir, 'app'))).toBe(false);

    const run = runShim(sb, ['--version']);

    expect(run.stdout).toBe('fake snote 1.0.0\n');
    expect(run.status).toBe(0);

    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8')).toBe('1.0.0\n');
  });

  it('6: WHEN `app.prev` or `run.lock` is a symlink to a victim THEN `setup` exits `1` naming it and the victim is unchanged', () => {
    for (const name of ['app.prev', 'run.lock']) {
      sb = makeSandbox('1.0.0');
      expect(runSetup(sb).status).toBe(0);
      setBuild(sb, '1.5.0');
      expect(runSetup(sb).status).toBe(0);
      const victim = join(sb.root, 'victim');
      mkdirSync(victim);
      writeFileSync(join(victim, 'important.txt'), 'keep me\n');
      renameSync(join(sb.pluginDir, name), join(sb.root, 'moved-aside'));
      symlinkSync(name === 'app.prev' ? victim : join(victim, 'important.txt'), join(sb.pluginDir, name));
      setBuild(sb, '2.0.0');

      const res = runSetup(sb);

      expect(res.status).toBe(1);
      expect(res.stderr).toContain(`(${join(sb.pluginDir, name)}) is a symlink`);
      expect(readFileSync(join(victim, 'important.txt'), 'utf8')).toBe('keep me\n');
      expect(readdirSync(victim)).toEqual(['important.txt']);
      expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8')).toBe('1.5.0\n');
      cleanup(sb);
      sb = undefined;
    }
  });
});
