// Acceptance tests for T372: the `snote` shim written by
// packaging/omarchy/setup starts its mise probe from a clean
// `env -i PATH=/usr/bin:/bin HOME=...` base but carries through each
// of the caller's XDG_* and MISE_* directory variables that is set
// and non-empty (byte for byte, spaces and single quotes included),
// so a mise-installed Node under custom XDG or mise directories is
// still found. NODE_OPTIONS and every other variable stay dropped,
// and a failing probe still ends with the Node.js error and exit 1.
//
// Each case runs setup in a throwaway clone into a temp HOME (the
// probe is never run against the real /usr/bin/mise), copies the
// generated shim, replaces /usr/bin/mise in the COPY with a stub
// script that dumps its environment and exits 1, replaces
// /usr/bin/node with a missing path so the probe is reached, and
// runs the copy with `sh`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const REAL_UNINSTALL = join(process.cwd(), 'packaging', 'omarchy', 'uninstall');
const SPAWN_TIMEOUT_MS = 2500;
const NODE_MISSING = '/tmp/snote-t372-definitely-missing-node';
const CAPTION = 'snote needs Node.js 22 or newer';

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'snote-shimmiseenv-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// The seven directory variables the probe must carry through.
const PASS_VARS = [
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'MISE_DATA_DIR',
  'MISE_CONFIG_DIR',
  'MISE_GLOBAL_CONFIG_FILE',
];

// Build a throwaway clone whose cli.js prints a fixed line.
function makeClone(): string {
  const clone = mkdtempSync(join(tmpdir(), 'snote-shimmiseenv-clone-'));
  mkdirSync(join(clone, 'packaging', 'omarchy'), { recursive: true });
  copyFileSync(REAL_SETUP, join(clone, 'packaging', 'omarchy', 'setup'));
  copyFileSync(REAL_UNINSTALL, join(clone, 'packaging', 'omarchy', 'uninstall'));
  const dist = join(clone, 'plugin-dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'cli.js'), "#!/usr/bin/env node\nconsole.log('fake snote 9.9.9');\n");
  writeFileSync(join(dist, 'VERSION'), '9.9.9\n');
  return clone;
}

// Run setup into a temp HOME; returns the shim path setup installed.
function install(home: string, xdg: string): string {
  const clone = makeClone();
  const setup = spawnSync('bash', [join(clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: home,
      XDG_DATA_HOME: xdg,
      SNOTE_NODE: process.execPath,
    },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  expect(setup.status).toBe(0);
  return join(home, '.local', 'bin', 'snote');
}

// The shim copy under test: /usr/bin/mise swapped for a stub that
// dumps its environment and exits 1, /usr/bin/node swapped for a
// missing path. Every swap happens in the COPY only. The probe runs
// mise under `env -i`, which strips MISE_STUB_ENV_FILE, so the dump
// path is baked into the stub body instead.
function makeShimCopy(name: string): { shim: string; envFile: string } {
  const dir = mkdtempSync(join(tmpDir, name));
  const home = join(dir, 'home');
  const xdg = join(dir, 'data');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdg, { recursive: true });
  const installedShim = install(home, xdg);

  const envFile = join(dir, 'env-dump.txt');
  const stub = join(dir, 'mise-stub');
  writeFileSync(stub, "#!/bin/sh\n/usr/bin/env > '" + envFile + "'\nexit 1\n");
  chmodSync(stub, 0o755);

  let text = readFileSync(installedShim, 'utf8');
  text = text.split('/usr/bin/mise').join(stub);
  text = text.split('/usr/bin/node').join(NODE_MISSING);
  const shim = join(dir, 'snote-copy');
  writeFileSync(shim, text);
  chmodSync(shim, 0o755);
  expect(readFileSync(shim, 'utf8')).toContain(stub);
  return { shim, envFile };
}

// Run the copy with sh under a fully controlled caller environment.
function runCopy(shim: string, envFile: string, callerEnv: Record<string, string>) {
  rmSync(envFile, { force: true });
  return spawnSync('sh', [shim, '--version', 'a b'], {
    encoding: 'utf8',
    env: callerEnv,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: the mise probe carries the caller XDG/MISE dirs', () => {
  it("1: WHEN the shim copy runs under `sh` with `XDG_DATA_HOME=/x/data` and `MISE_DATA_DIR=/x/mise` set THEN the stub mise saw `XDG_DATA_HOME=/x/data` and `MISE_DATA_DIR=/x/mise`.", () => {
    const { shim, envFile } = makeShimCopy('case1');
    const run = runCopy(shim, envFile, { HOME: '/home/tester', XDG_DATA_HOME: '/x/data', MISE_DATA_DIR: '/x/mise' });
    const lines = readFileSync(envFile, 'utf8').split('\n');
    expect(lines).toContain('XDG_DATA_HOME=/x/data');
    expect(lines).toContain('MISE_DATA_DIR=/x/mise');
  });

  it('2: WHEN it runs with `NODE_OPTIONS=--bad` and `FOO=bar` also set THEN the stub saw neither `NODE_OPTIONS` nor `FOO`, and saw `PATH=/usr/bin:/bin`.', () => {
    const { shim, envFile } = makeShimCopy('case2');
    const run = runCopy(shim, envFile, {
      HOME: '/home/tester',
      NODE_OPTIONS: '--bad',
      FOO: 'bar',
      XDG_DATA_HOME: '/x/data',
    });
    const lines = readFileSync(envFile, 'utf8').split('\n');
    expect(lines.some((l) => l.startsWith('NODE_OPTIONS='))).toBe(false);
    expect(lines.some((l) => l.startsWith('FOO='))).toBe(false);
    expect(lines).toContain('PATH=/usr/bin:/bin');
  });

  it("3: WHEN it runs with `XDG_CONFIG_HOME` set to a value containing a single quote and a space (`/x/it's here`) THEN the stub saw exactly `XDG_CONFIG_HOME=/x/it's here`.", () => {
    const { shim, envFile } = makeShimCopy('case3');
    const run = runCopy(shim, envFile, { HOME: '/home/tester', XDG_CONFIG_HOME: "/x/it's here" });
    const lines = readFileSync(envFile, 'utf8').split('\n');
    expect(lines).toContain("XDG_CONFIG_HOME=/x/it's here");
  });

  it('4: WHEN it runs with arguments `--version` and `a b` and no XDG variables set THEN it exits `1` with `snote needs Node.js 22 or newer`, and the stub saw no `XDG_` variable.', () => {
    const { shim, envFile } = makeShimCopy('case4');
    const run = runCopy(shim, envFile, { HOME: '/home/tester', NODE_OPTIONS: '--bad' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(CAPTION);
    const lines = readFileSync(envFile, 'utf8').split('\n');
    expect(lines.some((l) => l.includes('XDG_'))).toBe(false);
  });
});
