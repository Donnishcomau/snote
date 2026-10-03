// Acceptance tests for T342: packaging/omarchy/setup installs the
// pre-built plugin-dist/ payload instead of running an npm build, finds
// Node without PATH, and writes a shim that resolves Node at run time.
//
// Every case uses its own temp HOME and XDG_DATA_HOME plus a throwaway
// clone directory (containing packaging/omarchy/setup, the real
// uninstall, and a small fake plugin-dist). No network, no real Node
// install: the setup script and the shim honour SNOTE_NODE, a test-only
// override checked first by the same Node lookup.
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
import { dirname, join } from 'node:path';
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
// "fake snote <VERSION>" so the shim can be run end-to-end.
function makeClone(version: string): string {
  const clone = mkdtempSync(join(tmpdir(), 'snote-prebuilt-clone-'));
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

function runSetup(clone: string, opts: { home: string; xdg: string; args?: string[]; node?: string }) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: opts.home,
    XDG_DATA_HOME: opts.xdg,
  };
  if (opts.node !== undefined) env.SNOTE_NODE = opts.node;
  return spawnSync('bash', [join(clone, 'packaging', 'omarchy', 'setup'), ...(opts.args ?? [])], {
    encoding: 'utf8',
    env,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: pre-built install (no build step)', () => {
  it('1: WHEN setup runs with SNOTE_NODE set to process.execPath THEN it exits 0, <XDG_DATA_HOME>/omarchy-snote-plugin/app/cli.js exists, and <HOME>/.local/bin/snote contains snote-omarchy-shim', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const clone = makeClone('9.9.9');
    const home = join(tmpDir, 'home');
    const xdg = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdg, { recursive: true });

    const result = runSetup(clone, { home, xdg, node: process.execPath });

    expect(result.status).toBe(0);
    expect(existsSync(join(xdg, 'omarchy-snote-plugin', 'app', 'cli.js'))).toBe(true);
    const shim = join(home, '.local', 'bin', 'snote');
    expect(readFileSync(shim, 'utf8')).toContain('snote-omarchy-shim');
  });

  it('2: WHEN the installed shim is then run with --version and the fake cli.js prints "fake snote 9.9.9" THEN the shim\'s stdout is `fake snote 9.9.9\\n` and its exit status is 0', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const clone = makeClone('9.9.9');
    const home = join(tmpDir, 'home');
    const xdg = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdg, { recursive: true });

    const setupResult = runSetup(clone, { home, xdg, node: process.execPath });
    expect(setupResult.status).toBe(0);

    const shim = join(home, '.local', 'bin', 'snote');
    const run = spawnSync(shim, ['--version'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: home, XDG_DATA_HOME: xdg, SNOTE_NODE: process.execPath },
      timeout: SPAWN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });

    expect(run.stdout).toBe('fake snote 9.9.9\n');
    expect(run.status).toBe(0);
  });

  it('3: WHEN setup runs with SNOTE_NODE pointing at a stub that prints v20.0.0 and no other Node is available THEN it exits 1 and its output contains `snote needs Node.js 22 or newer` and `omarchy-install-dev-env node`', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const clone = makeClone('9.9.9');
    const home = join(tmpDir, 'home');
    const xdg = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdg, { recursive: true });

    const stub = join(tmpDir, 'old-node');
    writeFileSync(stub, '#!/bin/sh\necho v20.0.0\n');
    chmodSync(stub, 0o755);

    const result = runSetup(clone, { home, xdg, node: stub });

    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('snote needs Node.js 22 or newer');
    expect(output).toContain('omarchy-install-dev-env node');
  });

  it('4: WHEN plugin-dist is missing from the clone THEN setup exits non-zero and its output contains `plugin-dist`', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const clone = makeClone('9.9.9');
    rmSync(join(clone, 'plugin-dist'), { recursive: true, force: true });
    const home = join(tmpDir, 'home');
    const xdg = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdg, { recursive: true });

    const result = runSetup(clone, { home, xdg, node: process.execPath });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('plugin-dist');
  });

  it('5: WHEN packaging/omarchy/setup is read as text THEN it contains none of `npm ci`, `npm run build`, `rsync` and `node@22`', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const text = readFileSync(REAL_SETUP, 'utf8');
    expect(text).not.toContain('npm ci');
    expect(text).not.toContain('npm run build');
    expect(text).not.toContain('rsync');
    expect(text).not.toContain('node@22');
  });

  it('6: WHEN setup --check runs after a successful setup THEN it exits 0; after the clone\'s plugin-dist/VERSION is changed to 9.9.10 it exits 1', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-prebuilt-'));
    const clone = makeClone('9.9.9');
    const home = join(tmpDir, 'home');
    const xdg = join(tmpDir, 'data');
    mkdirSync(home, { recursive: true });
    mkdirSync(xdg, { recursive: true });

    const setupResult = runSetup(clone, { home, xdg, node: process.execPath });
    expect(setupResult.status).toBe(0);

    const check1 = runSetup(clone, { home, xdg, args: ['--check'] });
    expect(check1.status).toBe(0);

    writeFileSync(join(clone, 'plugin-dist', 'VERSION'), '9.9.10\n');
    const check2 = runSetup(clone, { home, xdg, args: ['--check'] });
    expect(check2.status).toBe(1);
  });
});
