// Issue #208: packaging/omarchy/setup and the `snote` shim it writes (a heredoc inside setup)
// call env (and the shim's printenv) only by absolute path, never a bare name resolved from PATH, where a
// user-writable directory ahead of /usr/bin could substitute it. Tests 1 and 2 read the text;
// tests 3 to 5 put a fake `env` first on PATH that records every call and then fails, run setup
// and the installed shim in the sandbox, and require that it was never called. Linux only: the
// run lock uses flock(1) and /proc (test/helpers/omarchy-sandbox.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeSandbox, type Sandbox } from '../helpers/omarchy-sandbox';

const SETUP_TEXT = readFileSync(join(process.cwd(), 'packaging', 'omarchy', 'setup'), 'utf8');
const SPAWN_TIMEOUT_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);

/** The shim template: the lines of the heredoc that writes the shim. */
function shimTemplate(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^cat > "\$shim_tmp" <<EOF$/.test(l));
  const end = lines.findIndex((l, i) => i > start && l === 'EOF');
  return start < 0 || end < 0 ? '' : lines.slice(start + 1, end).join('\n');
}

const PREFIX = '(^|[;&|(`]|\\$\\(|\\b(?:exec|then|do|else|command|xargs|nice|time|bounded)\\s|!\\s)\\s*';
/** Every `name` word at a command position (line start, after `$(`, `(`, a backtick, `;`, `&&`, `||`, `|`, `!`, `exec`, `then`, `do`, `else`, `command`, `xargs`, `nice`, `time`), as bare or /usr/bin/<name>; comment lines skipped. Returns those lines. */
function calls(text: string, name: string): string[] {
  const re = new RegExp(`${PREFIX}(/usr/bin/)?${name}(\\s|\\)|$)`);
  return text.split('\n').filter((l) => !/^\s*#/.test(l) && re.test(l));
}
const isBare = (line: string, name: string): boolean => new RegExp(`${PREFIX}${name}(\\s|\\)|$)`).test(line);
const envCalls = (text: string): string[] => calls(text, 'env');

let sb: Sandbox | undefined;
afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

/** A directory first on PATH whose `env` records its arguments to <sandbox>/env-called.log and exits 97. */
function fakeEnvDir(s: Sandbox): { bin: string; log: string } {
  const bin = join(s.root, 'fakebin');
  const log = join(s.root, 'env-called.log');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'env'), `#!/bin/sh\necho "$@" >> '${log}'\nexit 97\n`);
  chmodSync(join(bin, 'env'), 0o755);
  return { bin, log };
}

function run(cmd: string, args: string[], s: Sandbox, bin: string) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: s.home, XDG_DATA_HOME: s.xdg, SNOTE_NODE: process.execPath },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

describe('setup and the shim call /usr/bin/env, never a bare env (#208)', () => {
  it('1: WHEN `packaging/omarchy/setup` is read THEN its non-comment lines hold 7 `env` calls at a command position, none of them a bare `env`, and the shim template holds 5 of them', () => {
    const shim = shimTemplate(SETUP_TEXT);
    expect(shim.length).toBeGreaterThan(500);
    expect(envCalls(SETUP_TEXT)).toHaveLength(7);
    expect(envCalls(shim)).toHaveLength(5);
    expect(envCalls(SETUP_TEXT).filter((l) => isBare(l, 'env'))).toEqual([]);
    expect(envCalls(shim).filter((l) => isBare(l, 'env'))).toEqual([]);
  });

  it('2: WHEN `env` follows `$(`, `exec`, `&&`, `|`, `;`, `then`, `do`, `else`, `!`, `command`, `xargs`, `nice` or `time`, or starts a line, THEN the detector reports it bare, and `/usr/bin/env`, `printenv`, `dev-env` and comments are not', () => {
    const bare = [
      'x="$(env -u A b)"', '  exec env -u A b', 'a && env -i b', 'a | env b', 'a; env b', '  env -i \\',
      'if a; then env b; fi', 'for i in a; do env b; done', 'else env b', '! env b', 'command env b', 'a | xargs env b', 'nice env b', 'time env b',
    ];
    for (const line of bare) expect(envCalls(line).filter((l) => isBare(l, 'env')), line).toHaveLength(1);
    const clean = ['x="$(/usr/bin/env -u A b)"', '  exec /usr/bin/env b', 'v=$(printenv HOME)', 'omarchy-install-dev-env', '# env -u A b is mentioned in a comment', 'then /usr/bin/env b', 'command /usr/bin/env b'];
    for (const line of clean) expect(envCalls(line).filter((l) => isBare(l, 'env')), line).toEqual([]);
    expect(calls('v=$(printenv HOME)', 'printenv').filter((l) => isBare(l, 'printenv'))).toHaveLength(1);
    expect(calls('v=$(/usr/bin/printenv HOME)', 'printenv').filter((l) => isBare(l, 'printenv'))).toEqual([]);
  });

  it('3: WHEN a fake `env` that records and fails is first on PATH and setup runs THEN setup exits `0`, installs the shim, and `env-called.log` does not exist', () => {
    sb = makeSandbox('1.0.0');
    const { bin, log } = fakeEnvDir(sb);
    const r = run('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup')], sb, bin);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(sb.shim)).toBe(true);
    expect(existsSync(join(sb.pluginDir, 'app', 'cli.js'))).toBe(true);
    expect(existsSync(log)).toBe(false);
  }, 10000);

  it('4: WHEN setup has installed the shim and a fake `env` is first on PATH THEN the shim prints `fake snote 1.0.0`, exits `0`, and `env-called.log` does not exist', () => {
    sb = makeSandbox('1.0.0');
    const { bin, log } = fakeEnvDir(sb);
    expect(run('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup')], sb, '/usr/bin').status).toBe(0);
    const r = run(sb.shim, ['--version'], sb, bin);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('fake snote 1.0.0\n');
    expect(existsSync(log)).toBe(false);
  }, 10000);

  it('5: WHEN the app directory is missing and only `app.prev` holds the build and a fake `env` is first on PATH THEN the shim prints `fake snote 1.0.0`, exits `0`, and `env-called.log` does not exist', () => {
    sb = makeSandbox('1.0.0');
    const { bin, log } = fakeEnvDir(sb);
    expect(run('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup')], sb, '/usr/bin').status).toBe(0);
    renameSync(join(sb.pluginDir, 'app'), join(sb.pluginDir, 'app.prev'));
    expect(existsSync(join(sb.pluginDir, 'app', 'cli.js'))).toBe(false);
    const r = run(sb.shim, ['--version'], sb, bin);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('fake snote 1.0.0\n');
    expect(existsSync(log)).toBe(false);
  }, 10000);

  it('6: WHEN the shim holds 7 `printenv` calls, all `/usr/bin/printenv`, and a copy of it with a stub mise runs with a fake `printenv` first on PATH THEN the stub saw `XDG_DATA_HOME=/x/data` and `printenv-called.log` does not exist', () => {
    const shim = shimTemplate(SETUP_TEXT);
    expect(calls(shim, 'printenv')).toHaveLength(7);
    expect(calls(shim, 'printenv').filter((l) => isBare(l, 'printenv'))).toEqual([]);
    sb = makeSandbox('1.0.0');
    const bin = join(sb.root, 'fakebin');
    const log = join(sb.root, 'printenv-called.log');
    const dump = join(sb.root, 'mise-env.txt');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'printenv'), `#!/bin/sh\necho "$@" >> '${log}'\nexit 97\n`);
    chmodSync(join(bin, 'printenv'), 0o755);
    const stub = join(sb.root, 'mise-stub');
    writeFileSync(stub, `#!/bin/sh\n/usr/bin/env > '${dump}'\nexit 1\n`);
    chmodSync(stub, 0o755);
    expect(run('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup')], sb, '/usr/bin').status).toBe(0);
    const copy = join(sb.root, 'snote-copy');
    writeFileSync(copy, readFileSync(sb.shim, 'utf8').split('/usr/bin/mise').join(stub).split('/usr/bin/node').join(join(sb.root, 'no-node')));
    chmodSync(copy, 0o755);
    const r = spawnSync('sh', [copy, '--version'], {
      encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: sb.home, XDG_DATA_HOME: '/x/data' },
      timeout: SPAWN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    expect(r.status).toBe(1);
    expect(readFileSync(dump, 'utf8').split('\n')).toContain('XDG_DATA_HOME=/x/data');
    expect(existsSync(log)).toBe(false);
  }, 10000);
});
