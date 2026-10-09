// Acceptance tests for T393: on the mise path the `snote` shim passes
// the user's arguments to cli.js unchanged. The T372 probe must keep
// starting from `env -i PATH=/usr/bin:/bin HOME=...` and carry each
// set, non-empty XDG/MISE directory variable byte for byte, but it may
// no longer touch the shim's positional parameters: no `set --`, no
// `shift`, no `eval` anywhere in the shim heredoc.
//
// Each case runs setup in a throwaway clone into a temp HOME, copies
// the generated shim, replaces /usr/bin/mise in the COPY with a stub
// that records its arguments and environment and then prints the path
// of a fake Node (so the shim reaches `exec`), replaces /usr/bin/node
// with a missing path, and runs the copy with `sh`. The fake Node
// records every argument it receives on its own line.
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
const NODE_MISSING = '/tmp/snote-t393-definitely-missing-node';

// Values with spaces or a single quote reach the probe the same way
// real callers' values do; assembling them at runtime keeps this
// file's text identical to the acceptance lines' spellings.
const DATA_VALUE = '/x' + '/data';
const MISE_VALUE = '/x' + '/mise';
const CONFIG_VALUE = "/x/it'" + "s here";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'snote-shimargs-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Build a throwaway clone whose cli.js prints a fixed line.
function makeClone(): string {
  const clone = mkdtempSync(join(tmpdir(), 'snote-shimargs-clone-'));
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

// The shim copy under test. /usr/bin/mise becomes a stub that records
// each argument on its own line, dumps its environment, and prints
// the fake Node's path (so the probe's candidate check passes and the
// shim reaches exec); /usr/bin/node becomes a missing path so the
// mise path is the one taken. The shim runs under `exec`, so the fake
// Node cannot learn its record path from the environment: every path
// is baked into the script bodies here.
function makeShimCopy(name: string): { shim: string; stubArgs: string; stubEnv: string; nodeArgs: string; cliPath: string } {
  const dir = mkdtempSync(join(tmpDir, name));
  const home = join(dir, 'home');
  const xdg = join(dir, 'data');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdg, { recursive: true });
  const installedShim = install(home, xdg);
  const cliPath = join(xdg, 'omarchy-snote-plugin', 'app', 'cli.js');

  const stubArgs = join(dir, 'stub-args.txt');
  const stubEnv = join(dir, 'stub-env.txt');
  const nodeArgs = join(dir, 'node-args.txt');
  const fakeNode = join(dir, 'fake-node');

  const stub = join(dir, 'mise-stub');
  writeFileSync(
    stub,
    "#!/bin/sh\n" +
      "printf '%s\\n' \"$@\" > '" + stubArgs + "'\n" +
      "/usr/bin/env > '" + stubEnv + "'\n" +
      "printf '%s\\n' '" + fakeNode + "'\n",
  );
  chmodSync(stub, 0o755);

  writeFileSync(
    fakeNode,
    "#!/bin/sh\n" +
      'if [ "$1" = --version ]; then echo v22.1.0; exit 0; fi\n' +
      "printf '%s\\n' \"$@\" > '" + nodeArgs + "'\n" +
      "echo 'fake snote ran'\n",
  );
  chmodSync(fakeNode, 0o755);

  let text = readFileSync(installedShim, 'utf8');
  text = text.split('/usr/bin/mise').join(stub);
  text = text.split('/usr/bin/node').join(NODE_MISSING);
  const shim = join(dir, 'snote-copy');
  writeFileSync(shim, text);
  chmodSync(shim, 0o755);
  expect(readFileSync(shim, 'utf8')).toContain(stub);
  return { shim, stubArgs, stubEnv, nodeArgs, cliPath };
}

// Run the copy with sh under a fully controlled caller environment.
function runCopy(shim: string, args: string[], callerEnv: Record<string, string>) {
  return spawnSync('sh', [shim, ...args], {
    encoding: 'utf8',
    env: callerEnv,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

function readLines(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

describe('packaging/omarchy/setup: on the mise path the shim passes the user arguments unchanged', () => {
  it('1: WHEN the shim copy runs with arguments `--new` and `a b` and no XDG variables THEN the fake Node got exactly 3 arguments: a path ending `cli.js`, then `--new`, then `a b`.', () => {
    const c = makeShimCopy('case1');
    const run = runCopy(c.shim, ['--new', 'a b'], { HOME: '/home/tester' });
    expect(run.status).toBe(0);
    const got = readLines(c.nodeArgs);
    expect(got.length).toBe(3);
    expect(got[0].endsWith('cli.js')).toBe(true);
    expect(got[0]).toBe(c.cliPath);
    expect(got[1]).toBe('--new');
    expect(got[2]).toBe('a b');
  });

  it("2: WHEN it runs with arguments `--new` and `XDG_DATA_HOME=/x/data`, `MISE_DATA_DIR=/x/mise` set THEN the fake Node got exactly `2` arguments (`cli.js` path and `--new`), and the stub saw `XDG_DATA_HOME=/x/data`.", () => {
    const c = makeShimCopy('case2');
    const run = runCopy(c.shim, ['--new'], {
      HOME: '/home/tester',
      XDG_DATA_HOME: DATA_VALUE,
      MISE_DATA_DIR: MISE_VALUE,
    });
    expect(run.status).toBe(0);
    const got = readLines(c.nodeArgs);
    expect(got.length).toBe(2);
    expect(got[0]).toBe(c.cliPath);
    expect(got[1]).toBe('--new');
    const stubEnv = readLines(c.stubEnv);
    expect(stubEnv).toContain('XDG_DATA_HOME=' + DATA_VALUE);
    expect(stubEnv).toContain('MISE_DATA_DIR=' + MISE_VALUE);
  });

  it("3: WHEN it runs with no arguments and `XDG_CONFIG_HOME=/x/it's here` set THEN the fake Node got exactly `1` argument (the `cli.js` path), and the stub saw `XDG_CONFIG_HOME=/x/it's here`.", () => {
    const c = makeShimCopy('case3');
    const run = runCopy(c.shim, [], { HOME: '/home/tester', XDG_CONFIG_HOME: CONFIG_VALUE });
    expect(run.status).toBe(0);
    const got = readLines(c.nodeArgs);
    expect(got.length).toBe(1);
    expect(got[0]).toBe(c.cliPath);
    const stubEnv = readLines(c.stubEnv);
    expect(stubEnv).toContain('XDG_CONFIG_HOME=' + CONFIG_VALUE);
  });

  it('4: WHEN packaging/omarchy/setup is read THEN the shim heredoc contains no `set --`, no `shift` and no `eval`.', () => {
    const text = readFileSync(REAL_SETUP, 'utf8');
    const start = text.indexOf('cat > "$shim_tmp" <<EOF');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = text.indexOf('\nEOF\n', start);
    expect(end).toBeGreaterThan(start);
    const heredoc = text.slice(start, end);
    expect(heredoc).not.toMatch(/\bset --/);
    expect(heredoc).not.toMatch(/\bshift\b/);
    expect(heredoc).not.toMatch(/\beval\b/);
  });
});
