// #223 (security build rule R12): the first click installs only snote. Setup runs in a
// sandbox HOME shaped like a standard Omarchy one (a shell rc, a mise config, another
// app's data and another tool in ~/.local/bin) with recording `mise`,
// `omarchy-install-dev-env` and `omarchy` first on PATH, and in a COPY of setup (the #203
// pattern) every absolute path to one of those three programs, in any directory (such as
// /usr/bin/mise or /usr/share/omarchy/bin/omarchy-install-dev-env), points at the recorder;
// the test fails before it runs setup if the copy still names one. PATH is the recorders
// plus /usr/bin:/bin only, so no program from the real HOME can run (#223 security AMEND
// A1, A2). Every path under HOME is fingerprinted before and
// after (lstat: type, mode, size, mtime and content hash; a symlink by its target), and
// the set of created, changed or removed paths must sit inside the allowlist below.
// The recorders, the call log and the clone live outside HOME, so they never show up in
// the diff. Linux only (setup uses GNU mv -T and flock). No network.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeSandbox, setBuild, type Sandbox } from '../helpers/omarchy-sandbox';

const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const SPAWN_TIMEOUT_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 8000);
// Programs that setup must never run; each one is a recorder in the sandbox.
const RECORDED = ['omarchy-install-dev-env', 'omarchy', 'mise'];
/** An absolute path to `name` in any directory, as a whole word. */
const absPath = (name: string): RegExp => new RegExp(`(?<![\\w.$-])/(?:[\\w.-]+/)*${name}(?![\\w./-])`, 'g');

// R12: the only paths under HOME that setup may create, change or remove. A path added
// by a later decision (for example a launcher entry) is one new row here.
const ALLOWED: Array<(rel: string) => boolean> = [
  (rel) => rel === '.local/share/omarchy-snote-plugin' || rel.startsWith('.local/share/omarchy-snote-plugin/'),
  (rel) => rel === '.local/bin/snote',
];

let sb: Sandbox | undefined;
afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

interface Scope {
  sb: Sandbox;
  calls: string;
  bin: string;
}

function writeExec(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// A standard Omarchy HOME: ~/.local/share and ~/.local/bin already exist and hold
// other software's files; a shell rc and a mise config are present.
function scaffold(extraSetupLine?: string): Scope {
  const s = makeSandbox('1.0.0');
  sb = s; // cleaned up by afterEach even when the guard below stops the test
  const bin = join(s.root, 'recorders');
  const calls = join(s.root, 'calls.log');
  mkdirSync(bin);
  writeFileSync(calls, '');
  let text = readFileSync(REAL_SETUP, 'utf8');
  for (const name of RECORDED) {
    writeExec(join(bin, name), `#!/bin/sh\nprintf '${name} %s\\n' "$*" >> '${calls}'\nexit 1\n`);
    text = text.replace(absPath(name), join(bin, name));
  }
  if (extraSetupLine !== undefined) {
    const anchor = 'log "snote is installed. Launching it now..."';
    expect(text.split(anchor)).toHaveLength(2);
    text = text.replace(anchor, `${extraSetupLine}\n${anchor}`);
    for (const name of RECORDED) text = text.replace(absPath(name), join(bin, name));
  }
  // fail before setup runs if the copy can still reach a real installer or mise by absolute path
  const stray = RECORDED.flatMap((name) => [...text.matchAll(absPath(name))].map((m) => m[0]).filter((p) => p !== join(bin, name)));
  expect(stray, 'absolute paths to a real installer or mise left in the copy').toEqual([]);
  writeExec(join(s.clone, 'packaging', 'omarchy', 'setup'), text);
  const home = s.home;
  for (const d of ['.config/mise', '.local/share/other-app', '.local/bin']) mkdirSync(join(home, d), { recursive: true });
  writeFileSync(join(home, '.bashrc'), '# the user\'s own shell rc\n');
  writeFileSync(join(home, '.config', 'mise', 'config.toml'), '[tools]\nnode = "lts"\n');
  writeFileSync(join(home, '.local', 'share', 'other-app', 'data.txt'), 'another app\n');
  writeExec(join(home, '.local', 'bin', 'other-tool'), '#!/bin/sh\nexit 0\n');
  return { sb: s, calls, bin };
}

// setup with HOME = the sandbox HOME and no XDG_DATA_HOME, so the plugin goes to
// its default ~/.local/share/omarchy-snote-plugin; SNOTE_NODE is this test's node.
function runSetup(sc: Scope) {
  return spawnSync('bash', [join(sc.sb.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: {
      PATH: `${sc.bin}:/usr/bin:/bin`,
      HOME: sc.sb.home,
      SNOTE_NODE: process.execPath,
    },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

/** path relative to HOME -> fingerprint, for every entry under HOME (symlinks not followed). */
function snapshot(home: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(home, rel)).sort()) {
      const r = rel === '' ? name : `${rel}/${name}`;
      const abs = join(home, r);
      const st = lstatSync(abs);
      const mode = (st.mode & 0o7777).toString(8);
      if (st.isSymbolicLink()) out.set(r, `l ${readlinkSync(abs)}`);
      else if (st.isDirectory()) {
        // a directory's own mtime moves when a child changes; the child is in the diff itself
        out.set(r, `d ${mode}`);
        walk(r);
      } else {
        const sum = createHash('sha256').update(readFileSync(abs)).digest('hex');
        out.set(r, `f ${mode} ${st.size} ${st.mtimeMs} ${sum}`);
      }
    }
  };
  walk('');
  return out;
}

/** Created, changed or removed paths between two snapshots, sorted. */
function changed(before: Map<string, string>, after: Map<string, string>): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => before.get(k) !== after.get(k)).sort();
}

const outsideScope = (paths: string[]): string[] => paths.filter((p) => !ALLOWED.some((ok) => ok(p)));

describe('packaging/omarchy/setup: the first click changes only snote\'s own paths under HOME (#223, R12)', () => {
  it('1: WHEN setup runs a first install in a sandbox HOME with a recording `mise` and `omarchy-install-dev-env` on PATH THEN the set of created or changed paths under HOME is inside the allowlist `.local/share/omarchy-snote-plugin/**` and `.local/bin/snote`', () => {
    const sc = scaffold();
    sb = sc.sb;
    const before = snapshot(sc.sb.home);
    const res = runSetup(sc);
    expect(res.status, res.stderr).toBe(0);
    const diff = changed(before, snapshot(sc.sb.home));
    expect(outsideScope(diff)).toEqual([]);
    expect(diff).toContain('.local/bin/snote');
    expect(diff).toContain('.local/share/omarchy-snote-plugin/app/cli.js');
  }, 20000);

  it('2: WHEN setup runs an update over an existing install THEN the same allowlist holds', () => {
    const sc = scaffold();
    sb = sc.sb;
    expect(runSetup(sc).status).toBe(0);
    setBuild(sc.sb, '2.0.0');
    const before = snapshot(sc.sb.home);
    const res = runSetup(sc);
    expect(res.status, res.stderr).toBe(0);
    const diff = changed(before, snapshot(sc.sb.home));
    expect(outsideScope(diff)).toEqual([]);
    expect(diff).toContain('.local/share/omarchy-snote-plugin/app/VERSION');
    expect(readFileSync(join(sc.sb.home, '.local', 'share', 'omarchy-snote-plugin', 'app', 'VERSION'), 'utf8')).toBe('2.0.0\n');
  }, 20000);

  it('3: WHEN a copy of setup also appends to `.bashrc` in HOME THEN the scope check fails and names `.bashrc`', () => {
    const sc = scaffold('echo \'export PATH="$HOME/.local/bin:$PATH"\' >> "$HOME/.bashrc"');
    sb = sc.sb;
    const before = snapshot(sc.sb.home);
    const res = runSetup(sc);
    expect(res.status, res.stderr).toBe(0);
    expect(outsideScope(changed(before, snapshot(sc.sb.home)))).toEqual(['.bashrc']);
  }, 20000);

  it('4: WHEN setup runs a first install and then an update THEN neither recorder was called and the call log stays empty', () => {
    const sc = scaffold();
    sb = sc.sb;
    expect(runSetup(sc).status).toBe(0);
    setBuild(sc.sb, '2.0.0');
    expect(runSetup(sc).status).toBe(0);
    expect(readFileSync(sc.calls, 'utf8')).toBe('');
  }, 20000);
});
