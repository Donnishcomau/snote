// Security regression tests for the symlink-redirect finding reported
// against packaging/omarchy/setup (omacom/omarchy-plugin-marketplace#9458):
// `rsync -a --delete` into the existing app_dir followed a destination
// symlink and pruned files inside whatever real directory it pointed at.
//
// Most scenarios here spawn the real scripts with HOME/XDG_DATA_HOME
// pointed at a fresh temp dir — no network, no mise required, because the
// fix moves the symlink/ownership guards before any network or mise work.
// spawnSync has a bounded `timeout` so that if a pre-fix script tries to
// reach the network (npm ci) it is killed well inside vitest's 3s test
// timeout rather than hanging the run.
//
// A few scenarios need to prove the *opposite*: that the guard lets a
// legitimate case (a symlinked XDG_DATA_HOME, a pre-marker legacy shim)
// PAST it. Since the setup script stopped building (T342: it copies the
// plugin's shipped plugin-dist/ instead of running npm), those cases run
// setup against a clone with no plugin-dist and SNOTE_NODE set to this
// very process's node. If the guard had rejected the symlink or the
// legacy shim, the script would fail there with a message naming the
// symlinked/foreign path. Instead it gets past the guard and fails for
// an entirely different, unambiguous reason (the missing pre-built
// payload) — proof the guard let it through.
import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
  existsSync,
  chmodSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const UNINSTALL = join(process.cwd(), 'packaging', 'omarchy', 'uninstall');
const INSTALL_SH = join(process.cwd(), 'packaging', 'omarchy', 'install.sh');
const SPAWN_TIMEOUT_MS = 2500;

function run(script: string, home: string, xdgDataHome: string, args: string[] = []) {
  return spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: home, XDG_DATA_HOME: xdgDataHome },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// Run setup with SNOTE_NODE pointed at this process's own node, so it
// gets past the Node lookup and the symlink/legacy-shim guards and only
// then fails for the (intentionally) missing plugin-dist payload.
function runWithNode(script: string, home: string, xdgDataHome: string) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      SNOTE_NODE: process.execPath,
    },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// A self-contained clone holding only the setup script and deliberately NO
// plugin-dist/, so the result is identical in the private tree and in the
// public export (which ships a real plugin-dist/). setup derives its source
// directory from its own location, so the copy sees the temp clone.
function setupInCloneWithoutDist(root: string): string {
  const dir = join(root, 'clone', 'packaging', 'omarchy');
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'setup');
  copyFileSync(SETUP, copy);
  chmodSync(copy, 0o755);
  return copy;
}

describe('packaging/omarchy/setup and uninstall: symlink-redirect safety', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1: WHEN the build directory (omarchy-snote-plugin/app) is a symlink to a victim directory holding important.txt THEN setup exits non-zero, important.txt is unchanged, and the message names the app_dir path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const victimDir = join(tmpDir, 'victim-app-dir');
    mkdirSync(victimDir, { recursive: true });
    const victimFile = join(victimDir, 'important.txt');
    writeFileSync(victimFile, 'do not touch\n');

    const pluginDir = join(xdgDataHome, 'omarchy-snote-plugin');
    mkdirSync(pluginDir, { recursive: true });
    const appDir = join(pluginDir, 'app');
    symlinkSync(victimDir, appDir);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(victimFile, 'utf8')).toBe('do not touch\n');
    expect(result.stderr).toContain(appDir);
  });

  it('2: WHEN the plugin parent directory (omarchy-snote-plugin) is a symlink to a victim directory holding important.txt THEN setup exits non-zero, important.txt is unchanged, and the message names the plugin directory path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const victimDir = join(tmpDir, 'victim-plugin-dir');
    mkdirSync(victimDir, { recursive: true });
    const victimFile = join(victimDir, 'important.txt');
    writeFileSync(victimFile, 'do not touch\n');

    const pluginDir = join(xdgDataHome, 'omarchy-snote-plugin');
    symlinkSync(victimDir, pluginDir);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(victimFile, 'utf8')).toBe('do not touch\n');
    expect(result.stderr).toContain(pluginDir);
  });

  it('3: WHEN XDG_DATA_HOME is a symlink to a real, empty directory THEN setup gets past the guard (fails later only because the clone ships no plugin-dist payload, not because of a symlink message)', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    mkdirSync(home, { recursive: true });

    const realDataHome = join(tmpDir, 'real-data-home');
    mkdirSync(realDataHome, { recursive: true });
    const xdgDataHome = join(tmpDir, 'data-symlink');
    symlinkSync(realDataHome, xdgDataHome);

    const result = runWithNode(setupInCloneWithoutDist(tmpDir), home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('plugin-dist');
    expect(result.stderr).not.toContain('symlink');
  });

  it('4: WHEN XDG_DATA_HOME is a symlink to a real directory AND omarchy-snote-plugin inside it is itself a symlink to a victim directory holding important.txt THEN setup exits non-zero, important.txt is unchanged, and the message names the resolved plugin directory path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    mkdirSync(home, { recursive: true });

    const victimDir = join(tmpDir, 'victim-plugin-dir');
    mkdirSync(victimDir, { recursive: true });
    const victimFile = join(victimDir, 'important.txt');
    writeFileSync(victimFile, 'do not touch\n');

    const realDataHome = join(tmpDir, 'real-data-home');
    mkdirSync(realDataHome, { recursive: true });
    const resolvedPluginDir = join(realDataHome, 'omarchy-snote-plugin');
    symlinkSync(victimDir, resolvedPluginDir);

    const xdgDataHome = join(tmpDir, 'data-symlink');
    symlinkSync(realDataHome, xdgDataHome);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(victimFile, 'utf8')).toBe('do not touch\n');
    expect(result.stderr).toContain(resolvedPluginDir);
  });

  it('5: WHEN ~/.local/bin/snote is a symlink to victim.sh THEN setup exits non-zero, victim.sh content is unchanged, the symlink still points at victim.sh, and the message names the shim path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const victimFile = join(tmpDir, 'victim.sh');
    writeFileSync(victimFile, '#!/bin/sh\necho victim\n');
    chmodSync(victimFile, 0o755);

    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'snote');
    symlinkSync(victimFile, shim);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(victimFile, 'utf8')).toBe('#!/bin/sh\necho victim\n');
    expect(lstatSync(shim).isSymbolicLink()).toBe(true);
    expect(readlinkSync(shim)).toBe(victimFile);
    expect(result.stderr).toContain(shim);
  });

  it('6: WHEN ~/.local/bin/snote is a foreign regular file with unrelated content THEN setup exits non-zero, leaves the file content unchanged, and the message names the shim path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'snote');
    writeFileSync(shim, '#!/bin/sh\necho totally unrelated\n');
    chmodSync(shim, 0o755);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(shim, 'utf8')).toBe('#!/bin/sh\necho totally unrelated\n');
    expect(result.stderr).toContain(shim);
  });

  it('7: WHEN ~/.local/bin/snote is a legacy pre-marker shim (small, plain file, exec line names omarchy-snote-plugin/app/dist/cli.js) THEN setup gets past the guard (fails later only because the clone ships no plugin-dist payload, not because the shim is foreign)', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'snote');
    const appDir = join(xdgDataHome, 'omarchy-snote-plugin', 'app');
    writeFileSync(
      shim,
      `#!/bin/sh\nexec mise exec node@22 -- node "${appDir}/dist/cli.js" "$@"\n`
    );
    chmodSync(shim, 0o755);

    const result = runWithNode(setupInCloneWithoutDist(tmpDir), home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('plugin-dist');
    expect(result.stderr).not.toContain('not created by this installer');
  });

  it('8: WHEN ~/.local/bin/snote is a foreign file whose content merely contains the word "snote" THEN setup still exits non-zero and leaves the file content unchanged', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'snote');
    const foreignContent = '#!/bin/sh\n# this mentions snote but is not our shim\necho hi\n';
    writeFileSync(shim, foreignContent);
    chmodSync(shim, 0o755);

    const result = run(SETUP, home, xdgDataHome);

    expect(result.status).not.toBe(0);
    expect(readFileSync(shim, 'utf8')).toBe(foreignContent);
    expect(result.stderr).toContain(shim);
  });

  it('9: WHEN uninstall runs with the plugin directory (omarchy-snote-plugin) a symlink to a victim directory holding important.txt THEN the symlink still points at the victim directory and important.txt is unchanged', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const victimDir = join(tmpDir, 'victim-plugin-dir');
    mkdirSync(victimDir, { recursive: true });
    const victimFile = join(victimDir, 'important.txt');
    writeFileSync(victimFile, 'do not touch\n');

    const pluginDir = join(xdgDataHome, 'omarchy-snote-plugin');
    symlinkSync(victimDir, pluginDir);

    run(UNINSTALL, home, xdgDataHome);

    expect(existsSync(pluginDir)).toBe(true);
    expect(lstatSync(pluginDir).isSymbolicLink()).toBe(true);
    expect(readlinkSync(pluginDir)).toBe(victimDir);
    expect(readFileSync(victimFile, 'utf8')).toBe('do not touch\n');
  });

  it('10: WHEN ~/.local/bin/snote is a legacy pre-marker shim THEN uninstall removes it', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const home = join(tmpDir, 'home');
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdgDataHome, { recursive: true });

    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'snote');
    const appDir = join(xdgDataHome, 'omarchy-snote-plugin', 'app');
    writeFileSync(
      shim,
      `#!/bin/sh\nexec mise exec node@22 -- node "${appDir}/dist/cli.js" "$@"\n`
    );
    chmodSync(shim, 0o755);

    const result = run(UNINSTALL, home, xdgDataHome);

    expect(result.stdout).toContain(`removed ${shim}`);
    expect(existsSync(shim)).toBe(false);
  });

  it('11: WHEN packaging/omarchy/install.sh runs with the destination a symlink to victim.desktop THEN victim.desktop content is unchanged and the destination is replaced with the real snote.desktop content (no longer a symlink)', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-setup-safety-'));
    const xdgDataHome = join(tmpDir, 'data');
    mkdirSync(xdgDataHome, { recursive: true });

    const victimFile = join(tmpDir, 'victim.desktop');
    writeFileSync(victimFile, '[Desktop Entry]\nName=Victim\n');

    const appsDir = join(xdgDataHome, 'applications');
    mkdirSync(appsDir, { recursive: true });
    const dest = join(appsDir, 'snote.desktop');
    symlinkSync(victimFile, dest);

    const result = spawnSync('sh', [INSTALL_SH], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: xdgDataHome },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(victimFile, 'utf8')).toBe('[Desktop Entry]\nName=Victim\n');
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    const source = readFileSync(
      join(process.cwd(), 'packaging', 'omarchy', 'snote.desktop'),
      'utf8'
    );
    expect(readFileSync(dest, 'utf8')).toBe(source);
  });
});
