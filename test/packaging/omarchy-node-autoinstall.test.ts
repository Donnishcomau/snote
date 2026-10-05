// Acceptance tests for T368: when no usable Node is found, first-click
// setup installs it through Omarchy's own installer
// (omarchy-install-dev-env node, which runs `mise use --global node`) in
// the visible setup terminal, then looks again. It prints the old message
// and exits 1 only when Node is still missing after that. `--check` never
// installs anything.
//
// Every case uses its own temp HOME and XDG_DATA_HOME plus a throwaway
// clone directory (containing packaging/omarchy/setup, the real
// uninstall, and a small fake plugin-dist). No network, no real Node
// install: SNOTE_NODE is the test-only Node override and
// SNOTE_DEV_ENV_INSTALLER the test-only installer override — honoured
// only in test mode (SNOTE_NODE set), exactly like SNOTE_NODE itself.
import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const REAL_UNINSTALL = join(process.cwd(), 'packaging', 'omarchy', 'uninstall');
const SPAWN_TIMEOUT_MS = 2500;

let tmpDir: string;

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Build a throwaway clone: <dir>/packaging/omarchy/{setup,uninstall} and
// <dir>/plugin-dist/{cli.js,VERSION}. The fake cli.js prints
// "fake snote <VERSION>" so a completed install is observable.
function makeClone(version: string): string {
  const clone = mkdtempSync(join(tmpdir(), 'snote-autoinstall-clone-'));
  mkdirSync(join(clone, 'packaging', 'omarchy'), { recursive: true });
  copyFileSync(REAL_SETUP, join(clone, 'packaging', 'omarchy', 'setup'));
  copyFileSync(REAL_UNINSTALL, join(clone, 'packaging', 'omarchy', 'uninstall'));
  const dist = join(clone, 'plugin-dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, 'cli.js'),
    `#!/usr/bin/env node\nconsole.log('fake snote ${version}');\n`
  );
  writeFileSync(join(dist, 'VERSION'), `${version}\n`);
  return clone;
}

function runSetup(clone: string, opts: { home: string; xdg: string; args?: string[]; node?: string; installer?: string }) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: opts.home,
    XDG_DATA_HOME: opts.xdg,
  };
  if (opts.node !== undefined) env.SNOTE_NODE = opts.node;
  if (opts.installer !== undefined) env.SNOTE_DEV_ENV_INSTALLER = opts.installer;
  return spawnSync('bash', [join(clone, 'packaging', 'omarchy', 'setup'), ...(opts.args ?? [])], {
    encoding: 'utf8',
    env,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// Fresh temp HOME/XDG_DATA_HOME plus a clone, ready for a run.
function scaffold(): { clone: string; home: string; xdg: string } {
  tmpDir = mkdtempSync(join(tmpdir(), 'snote-autoinstall-'));
  const clone = makeClone('9.9.9');
  const home = join(tmpDir, 'home');
  const xdg = join(tmpDir, 'data');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdg, { recursive: true });
  return { clone, home, xdg };
}

// A stub installer that creates an executable `#!/bin/sh\necho v22.1.0`
// at SNOTE_NODE's path and records its arguments, one per line, in
// record. Always exits 0.
function writeCreatingInstaller(record: string): string {
  const installer = join(tmpDir, 'installer-create');
  writeFileSync(
    installer,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$SNOTE_INSTALLER_RECORD"\n' +
      'printf \'#!/bin/sh\\necho v22.1.0\\n\' > "$SNOTE_NODE"\n' +
      'chmod 755 "$SNOTE_NODE"\n'
  );
  chmodSync(installer, 0o755);
  writeFileSync(record, '');
  return installer;
}

// A stub installer that records its arguments and fails without
// creating any Node.
function writeFailingInstaller(record: string): string {
  const installer = join(tmpDir, 'installer-fail');
  writeFileSync(
    installer,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$SNOTE_INSTALLER_RECORD"\nexit 1\n'
  );
  chmodSync(installer, 0o755);
  writeFileSync(record, '');
  return installer;
}

// Run setup with the installer record exported so the stub can append
// to it (runSetup's env is closed, so pass through extra entries).
function runSetupWithRecord(
  clone: string,
  opts: { home: string; xdg: string; args?: string[]; node?: string; installer?: string; record: string }
) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: opts.home,
    XDG_DATA_HOME: opts.xdg,
    SNOTE_INSTALLER_RECORD: opts.record,
  };
  if (opts.node !== undefined) env.SNOTE_NODE = opts.node;
  if (opts.installer !== undefined) env.SNOTE_DEV_ENV_INSTALLER = opts.installer;
  return spawnSync('bash', [join(clone, 'packaging', 'omarchy', 'setup'), ...(opts.args ?? [])], {
    encoding: 'utf8',
    env,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: auto-install Node through Omarchy', () => {
  it('1: WHEN SNOTE_NODE points at a missing file and SNOTE_DEV_ENV_INSTALLER at a stub that creates a v22 node there THEN setup exits 0, the stub got the single argument `node`, and the output contains `installing it through Omarchy`', () => {
    const { clone, home, xdg } = scaffold();
    const record = join(tmpDir, 'installer-record');
    const installer = writeCreatingInstaller(record);
    const missingNode = join(tmpDir, 'missing-node');

    const result = runSetupWithRecord(clone, { home, xdg, node: missingNode, installer, record });

    expect(result.status).toBe(0);
    expect(readFileSync(record, 'utf8')).toBe('node\n');
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('installing it through Omarchy');
  });

  it('2: WHEN the stub installer exits 1 without creating a node THEN setup exits 1 and its output contains `snote needs Node.js 22 or newer`', () => {
    const { clone, home, xdg } = scaffold();
    const record = join(tmpDir, 'installer-record');
    const installer = writeFailingInstaller(record);
    const missingNode = join(tmpDir, 'missing-node');

    const result = runSetupWithRecord(clone, { home, xdg, node: missingNode, installer, record });

    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('snote needs Node.js 22 or newer');
  });

  it('3: WHEN SNOTE_NODE is set and SNOTE_DEV_ENV_INSTALLER is unset THEN setup exits 1 and its output does not contain `installing it through Omarchy`', () => {
    const { clone, home, xdg } = scaffold();
    const missingNode = join(tmpDir, 'missing-node');

    const result = runSetup(clone, { home, xdg, node: missingNode });

    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain('installing it through Omarchy');
  });

  it('4: WHEN setup runs with `--check` and a stub installer is set THEN the stub is not called (its record file does not exist)', () => {
    const { clone, home, xdg } = scaffold();
    const installer = join(tmpDir, 'unused-installer');
    // Writes its arguments into <own path>.record, which only exists
    // once the stub itself has run at least once.
    writeFileSync(installer, '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$0.record"\n');
    chmodSync(installer, 0o755);
    const missingNode = join(tmpDir, 'missing-node');

    const result = runSetup(clone, { home, xdg, args: ['--check'], node: missingNode, installer });

    expect(result.status).toBe(1);
    expect(existsSync(`${installer}.record`)).toBe(false);
  });

  it('5: WHEN packaging/omarchy/setup is read THEN it contains `/usr/share/omarchy/bin/omarchy-install-dev-env` and not `Never downloads Node`, and README.md contains `the first click installs it through Omarchy`', () => {
    const setup = readFileSync(REAL_SETUP, 'utf8');
    expect(setup).toContain('/usr/share/omarchy/bin/omarchy-install-dev-env');
    expect(setup).not.toContain('Never downloads Node');
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    expect(readme).toContain('the first click installs it through Omarchy');
  });
});
