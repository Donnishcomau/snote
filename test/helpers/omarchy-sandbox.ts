// Shared sandbox for the packaging/omarchy/setup tests that install, swap and
// roll back builds (#67). Every sandbox is a fresh mkdtemp tree holding its
// own HOME, XDG_DATA_HOME and a throwaway plugin clone; nothing here ever
// touches the real HOME or the real snote data folder. Linux only: the
// run lock uses flock(1) and /proc.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const REAL_UNINSTALL = join(process.cwd(), 'packaging', 'omarchy', 'uninstall');
// 2.5 s on a normal machine; SNOTE_TEST_SPAWN_MS lets a heavily loaded runner wait longer.
const SPAWN_TIMEOUT_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);

export interface Sandbox {
  root: string;
  home: string;
  xdg: string;
  clone: string;
  /** <xdg>/omarchy-snote-plugin */
  pluginDir: string;
  /** <xdg>/snote: stands in for the user's snote data folder. */
  dataDir: string;
  shim: string;
}

export function makeSandbox(version: string): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'snote-swap-'));
  const home = join(root, 'home');
  const xdg = join(root, 'data');
  const clone = join(root, 'clone');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdg, { recursive: true });
  mkdirSync(join(clone, 'packaging', 'omarchy'), { recursive: true });
  copyFileSync(REAL_SETUP, join(clone, 'packaging', 'omarchy', 'setup'));
  copyFileSync(REAL_UNINSTALL, join(clone, 'packaging', 'omarchy', 'uninstall'));
  mkdirSync(join(clone, 'plugin-dist'), { recursive: true });
  const sb: Sandbox = {
    root,
    home,
    xdg,
    clone,
    pluginDir: join(xdg, 'omarchy-snote-plugin'),
    dataDir: join(xdg, 'snote'),
    shim: join(home, '.local', 'bin', 'snote'),
  };
  setBuild(sb, version);
  return sb;
}

/**
 * Make the clone ship `version`. The fake cli.js prints `fake snote <v>`;
 * `--hold` prints `ready` and stays up until its stdin closes;
 * `--hold-hidden` does the same after renaming its process so that no
 * argument of /proc/<pid>/cmdline names cli.js.
 * `mode` 'broken': the build exits 1 without printing anything (fails its start
 * check). `mode` 'strict-env': each `--version` appends `<HOME>|<XDG_DATA_HOME>` to
 * <sandbox>/probe.log and the build prints `LEAK` instead of its version when
 * either is this sandbox's real one, so it passes the start check only when
 * setup ran it in an isolated environment.
 */
export type BuildMode = 'normal' | 'broken' | 'strict-env';

export function setBuild(sb: Sandbox, version: string, mode: BuildMode = 'normal'): void {
  const dist = join(sb.clone, 'plugin-dist');
  writeFileSync(
    join(dist, 'cli.js'),
    [
      '#!/usr/bin/env node',
      `const version = ${JSON.stringify(version)};`,
      `const mode = ${JSON.stringify(mode)};`,
      `const realHome = ${JSON.stringify(sb.home)};`,
      `const realData = ${JSON.stringify(sb.xdg)};`,
      `const probe = ${JSON.stringify(join(sb.root, 'probe.log'))};`,
      "if (process.argv[2] === '--hold' || process.argv[2] === '--hold-hidden') {",
      "  if (process.argv[2] === '--hold-hidden') process.title = 'x';",
      "  process.stdout.write('ready\\n');",
      '  process.stdin.resume();',
      "  process.stdin.on('end', () => process.exit(0));",
      "} else if (mode === 'broken') {",
      '  process.exit(1);',
      "} else if (mode === 'strict-env') {",
      "  require('node:fs').appendFileSync(probe, process.env.HOME + '|' + process.env.XDG_DATA_HOME + '\\n');",
      "  console.log(process.env.HOME === realHome || process.env.XDG_DATA_HOME === realData ? 'LEAK' : 'fake snote ' + version);",
      '} else {',
      "  console.log('fake snote ' + version);",
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dist, 'VERSION'), `${version}\n`);
}

export function env(sb: Sandbox): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    HOME: sb.home,
    XDG_DATA_HOME: sb.xdg,
    SNOTE_NODE: process.execPath,
  };
}

export function runSetup(sb: Sandbox, args: string[] = []) {
  return spawnSync('bash', [join(sb.clone, 'packaging', 'omarchy', 'setup'), ...args], {
    encoding: 'utf8',
    env: env(sb),
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

export function runUninstall(sb: Sandbox) {
  return spawnSync('bash', [join(sb.clone, 'packaging', 'omarchy', 'uninstall')], {
    encoding: 'utf8',
    env: env(sb),
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

export function runShim(sb: Sandbox, args: string[]) {
  return spawnSync(sb.shim, args, {
    encoding: 'utf8',
    env: env(sb),
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

export interface Held {
  stop: () => Promise<void>;
}

/** Start `cmd args` and resolve once it printed `ready`; `stop()` closes its stdin and waits for it to exit. */
export function startHold(sb: Sandbox, cmd: string, args: string[]): Promise<Held> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env(sb), stdio: ['pipe', 'pipe', 'ignore'] });
    let seen = '';
    let ready = false;
    const stop = (): Promise<void> =>
      new Promise((done) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          done();
          return;
        }
        child.once('exit', () => done());
        child.stdin?.end();
      });
    child.stdout?.on('data', (d: Buffer) => {
      seen += d.toString();
      if (!ready && seen.includes('ready')) {
        ready = true;
        resolve({ stop });
      }
    });
    child.once('error', reject);
    child.once('exit', () => {
      if (!ready) reject(new Error(`exited before ready: ${seen}`));
    });
  });
}

/** Every file under `dir`: relative path, mode, size, mtime and sha256 of the content, sorted. */
export function treeFingerprint(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(dir, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(`d ${rel} ${(st.mode & 0o777).toString(8)}`);
      for (const name of readdirSync(abs).sort()) walk(join(rel, name));
    } else {
      const sum = createHash('sha256').update(readFileSync(abs)).digest('hex');
      out.push(`f ${rel} ${(st.mode & 0o777).toString(8)} ${st.size} ${st.mtimeMs} ${sum}`);
    }
  };
  walk('');
  return out;
}

/** A non-empty stand-in for the user's snote data folder. */
export function fillDataFolder(sb: Sandbox): void {
  mkdirSync(join(sb.dataDir, 'notes'), { recursive: true });
  writeFileSync(join(sb.dataDir, 'auth.json'), '{"email":"a@b.c","token":"secret-token"}\n', { mode: 0o600 });
  writeFileSync(join(sb.dataDir, 'notes', 'n1.json'), '{"content":"my only copy"}\n');
  writeFileSync(join(sb.dataDir, 'status.json'), '{}\n');
}

/** Paths under `dir` that are group- or world-writable (files and directories). */
export function looseModes(dir: string): string[] {
  const bad: string[] = [];
  const walk = (abs: string): void => {
    const st = statSync(abs);
    if ((st.mode & 0o022) !== 0) bad.push(abs);
    if (st.isDirectory()) for (const name of readdirSync(abs)) walk(join(abs, name));
  };
  walk(dir);
  return bad;
}

export function cleanup(sb: Sandbox | undefined): void {
  if (sb) rmSync(sb.root, { recursive: true, force: true });
}
