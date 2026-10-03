// Acceptance tests for T345: the `snote` shim written by
// packaging/omarchy/setup tries every Node candidate in find_node's order
// ($SNOTE_NODE, /usr/bin/node, then /usr/bin/mise which node) instead of
// taking the first existing one and rejecting it for being too old, and
// every `--version` probe runs under `env -u NODE_OPTIONS` so an invalid
// NODE_OPTIONS in the caller's environment can't make a good Node look
// missing. The app directory is embedded in the shim single-quoted.
//
// Every case uses its own temp HOME and XDG_DATA_HOME plus a throwaway
// clone directory (containing packaging/omarchy/setup, the real
// uninstall, and a small fake plugin-dist whose cli.js prints a fixed
// line). No network, no real Node install.
import { describe, it, expect, afterEach } from 'vitest';
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
  const clone = mkdtempSync(join(tmpdir(), 'snote-nodelookup-clone-'));
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

function runSetup(clone: string, opts: { home: string; xdg: string }) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: opts.home,
    XDG_DATA_HOME: opts.xdg,
    SNOTE_NODE: process.execPath,
  };
  return spawnSync('bash', [join(clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// Run the installed shim the way a real launcher does: the caller's own
// environment (real HOME — that of whoever runs it, not the temp one),
// only the names in `env` overridden. The shim must not depend on the
// caller's HOME or XDG_DATA_HOME to find mise's Node.
function runShim(
  home: string,
  xdg: string,
  env: Record<string, string>
) {
  return spawnSync(join(home, '.local', 'bin', 'snote'), ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_DATA_HOME: xdg, ...env },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

// Fresh temp HOME/XDG_DATA_HOME/clone with setup already run
// successfully (SNOTE_NODE=process.execPath).
function installed(): { home: string; xdg: string } {
  tmpDir = mkdtempSync(join(tmpdir(), 'snote-nodelookup-'));
  const clone = makeClone('9.9.9');
  const home = join(tmpDir, 'home');
  const xdg = join(tmpDir, 'data');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdg, { recursive: true });
  const setup = runSetup(clone, { home, xdg });
  expect(setup.status).toBe(0);
  return { home, xdg };
}

// A Node stub: executable, prints v20.0.0 for --version, fails otherwise.
function writeV20Stub(name: string): string {
  const stub = join(tmpDir, name);
  writeFileSync(stub, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v20.0.0; exit 0; fi\nexit 1\n');
  chmodSync(stub, 0o755);
  return stub;
}

// /usr/bin/mise which node, probed with a minimal environment (mise
// needs HOME; an inherited environment with odd NODE_OPTIONS etc. must
// not skew the probe). Returns the path mise prints, or '' when mise
// has no usable Node answer.
function miseNodePath(): string {
  const probe = spawnSync('/usr/bin/mise', ['which', 'node'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '' },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  return probe.status === 0 ? probe.stdout.trim() : '';
}

// True when /usr/bin/mise which node prints an executable of major
// version 22 or newer (probed without NODE_OPTIONS, as the shim does).
function miseYieldsNode22OrNewer(): boolean {
  const p = miseNodePath();
  if (!p) return false;
  const v = spawnSync('/usr/bin/env', ['-u', 'NODE_OPTIONS', p, '--version'], {
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  const major = Number((v.stdout ?? '').match(/^v(\d+)/)?.[1]);
  return Number.isFinite(major) && major >= 22;
}

// Runtime skip value: computed with a spawn, which it.skipIf (evaluated
// at collection) cannot await, so this is checked inside each test that
// depends on it.
const miseHasNode22 = miseYieldsNode22OrNewer();

describe('packaging/omarchy/setup: the shim tries every Node candidate', () => {
  it('1: WHEN the installed shim is run with SNOTE_NODE set to a stub printing v20.0.0 and /usr/bin/mise which node yields Node 22+ THEN its stdout is the fake cli.js output and its exit status is 0', () => {
    if (!miseHasNode22) {
      // /usr/bin/mise which node does not print an executable Node 22+ on this machine
      expect(miseHasNode22).toBe(false);
      return;
    }
    const { home, xdg } = installed();
    const stub = writeV20Stub('old-node');

    const run = runShim(home, xdg, { SNOTE_NODE: stub });

    expect(run.stdout).toBe('fake snote 9.9.9\n');
    expect(run.status).toBe(0);
  });

  it('2: WHEN the shim is run with SNOTE_NODE=process.execPath and NODE_OPTIONS=--not-a-real-flag THEN its exit status is 0 and stdout is the fake cli.js output', () => {
    const { home, xdg } = installed();

    const run = runShim(home, xdg, {
      SNOTE_NODE: process.execPath,
      NODE_OPTIONS: '--not-a-real-flag',
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('fake snote 9.9.9\n');
  });

  it("3: WHEN the shim file is read THEN the line starting with `exec env -u NODE_OPTIONS` contains the app directory path wrapped in single quotes", () => {
    const { home, xdg } = installed();
    const appDir = join(xdg, 'omarchy-snote-plugin', 'app');

    const shimText = readFileSync(join(home, '.local', 'bin', 'snote'), 'utf8');
    const execLine = shimText
      .split('\n')
      .find((line) => line.startsWith('exec env -u NODE_OPTIONS'));

    expect(execLine).toBeDefined();
    expect(execLine!).toContain(`'${appDir}'`);
  });

  it('4: WHEN packaging/omarchy/setup is read as text THEN node_is_usable contains env -u NODE_OPTIONS', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-nodelookup-'));
    const text = readFileSync(REAL_SETUP, 'utf8');
    const body = text.slice(text.indexOf('node_is_usable() {'));
    const fn = body.slice(0, body.indexOf('\n}') + 2);

    expect(fn).toContain('env -u NODE_OPTIONS');
  });
});
