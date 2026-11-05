// #461: the Omarchy contract tier runs the REAL Omarchy plugin scripts (validate, add, enable, update, remove and
// what they call), pinned by test/fixtures/omarchy-pin.json (tag, commit, sha256 per script). This helper finds the
// pinned clone, verifies every mapped script and builds a curated bin dir holding only those scripts plus recording
// stubs for the display commands. It never skips: a missing clone, a hash mismatch or a missing jq throws with the fix.
// Linux only (the scripts need bash, find -printf, GNU userland).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { basename, dirname, join } from 'node:path';

export interface OmarchyPin {
  repo: string;
  tag: string;
  commit: string;
  /** script name (file in bin/) -> sha256 */
  scripts: Record<string, string>;
}

export const PIN: OmarchyPin = JSON.parse(
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'omarchy-pin.json'), 'utf8'),
) as OmarchyPin;

/** Display commands that are recorded, never run. `omarchy-shell` is also stubbed: it needs a live quickshell. */
export const STUBS = ['omarchy-shell', 'omarchy-restart-shell', 'hyprctl', 'qs', 'uwsm', 'notify-send', 'walker'] as const;

// test/setup.ts points HOME at a throwaway dir, so the default comes from the passwd entry, not $HOME.
const DEFAULT_DIR = join(userInfo().homedir, '.cache', 'omarchy-pin', 'omarchy');

export function pinDir(): string {
  return process.env.OMARCHY_PIN_DIR || DEFAULT_DIR;
}

function fetchHint(): string {
  return (
    `fetch the pin as the check.yml step "Fetch the pinned Omarchy" does (git init <dir>, a depth-1 fetch of ${PIN.commit} from https://github.com/${PIN.repo}.git, then checkout FETCH_HEAD; tag ${PIN.tag}), then set OMARCHY_PIN_DIR=<dir> (default ${DEFAULT_DIR})`
  );
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Throws (never skips) unless the clone exists, every mapped script matches its sha256 and jq is on PATH. */
export function verifyPin(): string {
  const dir = pinDir();
  if (!existsSync(join(dir, 'bin'))) throw new Error(`omarchy pin missing at ${dir}: ${fetchHint()}`);
  for (const [name, want] of Object.entries(PIN.scripts)) {
    const file = join(dir, 'bin', name);
    if (!existsSync(file)) throw new Error(`omarchy pin: ${name} is missing from ${dir}: ${fetchHint()}`);
    const got = sha256(file);
    if (got !== want) throw new Error(`omarchy pin: ${name} sha256 ${got} is not the pinned ${want}: ${fetchHint()}`);
  }
  if (spawnSync('sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).status !== 0) {
    throw new Error('omarchy pin: jq is not on PATH: install jq');
  }
  return dir;
}

export interface OmarchyTier {
  /** The tier's own dir, made inside the per-file test home (test/setup.ts removes that home after the file). */
  root: string;
  /** The pinned clone (OMARCHY_PATH). */
  dir: string;
  /** Curated bin dir: only the mapped scripts. */
  bin: string;
  /** Stub dir: recording stubs. */
  stubs: string;
  /** Every recorded display call, one argv per line: `<command> <args...>`. */
  log: string;
  /** Env for a spawn: PATH = stubs : bin : process PATH, OMARCHY_PATH, HOME. */
  env: (home: string) => Record<string, string>;
  /** The recorded calls so far, in order. */
  calls: () => string[];
}

export function makeTier(): OmarchyTier {
  const dir = verifyPin();
  // #310: the tier lives INSIDE the per-file test home (run-tagged, in the leak guard's PREFIXES, removed by setup.ts), so it never leaks.
  const home = process.env.HOME ?? '';
  if (dirname(home) !== tmpdir() || !basename(home).startsWith('snote-test-home-')) {
    throw new Error(`omarchy tier: HOME must be a snote-test-home-* dir directly inside ${tmpdir()} (test/setup.ts), got ${home}`);
  }
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(home, 'omarchy-tier-'));
  const bin = join(root, 'bin');
  const stubs = join(root, 'stubs');
  const log = join(root, 'calls.log');
  mkdirSync(bin);
  mkdirSync(stubs);
  writeFileSync(log, '');
  for (const name of Object.keys(PIN.scripts)) {
    const dest = join(bin, name);
    copyFileSync(join(dir, 'bin', name), dest);
    chmodSync(dest, 0o755);
  }
  for (const name of STUBS) {
    const body =
      name === 'omarchy-shell'
        ? 'case "$*" in\n  "shell listPlugins") echo "[]";;\n  "shell enablePlugin "*) echo ok;;\nesac\n'
        : '';
    writeFileSync(join(stubs, name), `#!/bin/bash\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}exit 0\n`);
    chmodSync(join(stubs, name), 0o755);
  }
  return {
    root,
    dir,
    bin,
    stubs,
    log,
    env: (home) => ({
      PATH: `${stubs}:${bin}:${process.env.PATH ?? ''}`,
      OMARCHY_PATH: dir,
      HOME: home,
    }),
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

let shared: OmarchyTier | undefined;
/** One tier per test file (module instance): verified once, reused; made again if its root was removed. */
export function sharedTier(): OmarchyTier {
  if (!shared || !existsSync(shared.root)) shared = makeTier();
  return shared;
}
