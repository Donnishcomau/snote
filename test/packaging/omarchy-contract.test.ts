// #461: the Omarchy contract tier. The REAL, pinned Omarchy plugin scripts (test/fixtures/omarchy-pin.json) run
// against a clean copy of the plugin in a fresh HOME. The only stubs are the display commands (omarchy-shell and
// friends), which record their argv; a missing pin or jq throws from the helper, nothing here skips on absence.
// Linux only (bash, GNU find, the pinned scripts).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PIN, pinDir, sha256, sharedTier, type OmarchyTier } from '../helpers/omarchy-pin';

const SPAWN_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);
const ID = 'io.github.donnishcomau.snote-simplenote';
const FILES = [
  'manifest.json', 'BarWidget.qml', 'preview.png', 'snote-icon.png',
  'README.md', 'LICENSE', 'packaging/omarchy', 'plugin-dist',
];

let tier: OmarchyTier;
const dirs: string[] = [];

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-omarchy-contract-'));
  dirs.push(d);
  return d;
}

/** A clean copy of the plugin files (the repo root holds node_modules symlinks, which validate rejects). */
function cleanCopy(): string {
  const dir = join(scratch(), 'plugin');
  mkdirSync(dir);
  for (const f of FILES) {
    const src = join(process.cwd(), f);
    if (existsSync(src)) cpSync(src, join(dir, f), { recursive: true });
  }
  return dir;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, {
    cwd, encoding: 'utf8', timeout: SPAWN_MS, killSignal: 'SIGKILL',
    env: { PATH: process.env.PATH ?? '', HOME: cwd, ...GIT_ENV },
  });
  expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
  return r;
}

/** The setup-test scripts: none of them may invoke an Omarchy script (test 7), so their sandbox needs no pinned tier. */
const SETUP_SCRIPTS = ['setup', 'uninstall', 'bar-update', 'install.sh'];
/** A shell line (comments dropped) that invokes a pinned Omarchy script, `omarchy plugin` or `omarchy-shell`. */
const OMARCHY_CALL = /(?:^|[\s;|&(`])(?:omarchy-plugin-[a-z]+|omarchy-cmd-present|omarchy-git-url-check|omarchy-shell|omarchy\s+plugin)\b/;

function omarchy(home: string, args: string[]) {
  return spawnSync('omarchy', ['plugin', ...args], {
    encoding: 'utf8', timeout: SPAWN_MS, killSignal: 'SIGKILL', input: '',
    env: { ...tier.env(home), ...GIT_ENV, HOME: home },
  });
}

function freshHome(): string {
  const h = join(scratch(), 'home');
  mkdirSync(h);
  return h;
}

const installed = (home: string) => join(home, '.config', 'omarchy', 'plugins', ID);
const rescans = () => tier.calls().filter((c) => c === 'omarchy-shell shell rescanPlugins');

describe.skipIf(process.platform !== 'linux')('#461 the Omarchy plugin contract, pinned scripts', () => {
  // Every origin repo, fresh home and install is built in a beforeAll hook (each hook stays far under the 3 s hook limit),
  // so no test chains spawns toward the 3 s test limit: a test runs at most 2 omarchy spawns.
  let origin: string; // a local git repo of the plugin, one commit; tests 3, 5, 6 and 8 read it
  let validateDir: string; // a clean plugin copy for test 2
  let homeAdd: string; // test 3 adds into it
  let homeUpdate: string; // tests 5 and 8: already installed from origin
  let homeRemove: string; // test 6: already installed from origin
  let homeEnable: string; // test 4
  let addRun: ReturnType<typeof omarchy>; // test 3: the add into homeAdd, and the stub calls it recorded
  let addCalls: string[] = [];
  let addUpdate: ReturnType<typeof omarchy>; // tests 5 and 8: the add that installed homeUpdate (asserted in the test, so a failure turns the test red)
  let addRemove: ReturnType<typeof omarchy>; // test 6: the add that installed homeRemove
  let validOk: ReturnType<typeof omarchy>; // test 2: validate on the clean copy, run before the manifest is changed

  beforeAll(() => {
    tier = sharedTier();
  });
  // the origin repo (one commit) is built one spawn per hook
  beforeAll(() => {
    origin = cleanCopy();
    git(origin, 'init', '-q');
  });
  beforeAll(() => {
    git(origin, 'add', '.');
  });
  beforeAll(() => {
    git(origin, 'commit', '-q', '-m', 'one');
  });
  beforeAll(() => {
    validateDir = cleanCopy();
    homeAdd = freshHome();
    homeEnable = freshHome();
  });
  beforeAll(() => {
    validOk = omarchy(homeEnable, ['validate', validateDir]);
  });
  beforeAll(() => {
    const before = tier.calls().length;
    addRun = omarchy(homeAdd, ['add', '--yes', `file://${origin}`]);
    addCalls = tier.calls().slice(before);
  });
  beforeAll(() => {
    homeUpdate = freshHome();
    addUpdate = omarchy(homeUpdate, ['add', '--yes', `file://${origin}`]);
  });
  beforeAll(() => {
    homeRemove = freshHome();
    addRemove = omarchy(homeRemove, ['add', '--yes', `file://${origin}`]);
  });
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('1: WHEN every mapped script in the pinned clone is hashed THEN each sha256 equals the one in test/fixtures/omarchy-pin.json, and so does the copy in the curated bin dir', () => {
    expect(Object.keys(PIN.scripts).length).toBeGreaterThanOrEqual(9);
    for (const [name, want] of Object.entries(PIN.scripts)) {
      expect(sha256(join(pinDir(), 'bin', name)), name).toBe(want);
      expect(sha256(join(tier.bin, name)), `curated ${name}`).toBe(want);
    }
  });

  it('2: WHEN `omarchy plugin validate` runs on a clean copy of the plugin THEN it exits 0, and once schemaVersion is removed from the copied manifest it exits non-zero naming schemaVersion', () => {
    const dir = validateDir;
    expect(validOk.status, validOk.stderr).toBe(0);
    const file = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    delete manifest.schemaVersion;
    writeFileSync(file, JSON.stringify(manifest));
    const bad = omarchy(homeEnable, ['validate', dir]);
    expect(bad.status).not.toBe(0);
    expect(bad.stdout + bad.stderr).toContain('schemaVersion');
  });

  it('3: WHEN `omarchy plugin add --yes file://<local repo>` runs in a fresh HOME THEN the plugin sits at ~/.config/omarchy/plugins/<id> with a manifest whose id matches, and the stub log holds exactly the one rescanPlugins call', () => {
    expect(addRun.status, addRun.stderr).toBe(0);
    expect(existsSync(join(installed(homeAdd), 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(installed(homeAdd), 'manifest.json'), 'utf8')) as { id: string };
    expect(manifest.id).toBe(ID);
    expect(addCalls).toEqual(['omarchy-shell shell rescanPlugins']);
  });

  it('4: WHEN `omarchy plugin enable <id>` runs THEN the stub log holds `omarchy-shell shell enablePlugin <id> {}` (argument contract only: the shell registry that really enables it is QML and is stubbed)', () => {
    const before = tier.calls().length;
    const r = omarchy(homeEnable, ['enable', ID]);
    expect(r.status, r.stderr).toBe(0);
    expect(tier.calls().slice(before).filter((c) => c.includes('enablePlugin'))).toEqual([
      `omarchy-shell shell enablePlugin ${ID} {}`,
    ]);
  });

  it('5: WHEN nothing new is on the local origin THEN `omarchy plugin update --yes` exits 0, prints `up to date` and records no rescan', () => {
    expect(addUpdate.status, addUpdate.stderr).toBe(0);
    const idle = rescans().length;
    const none = omarchy(homeUpdate, ['update', '--yes']);
    expect(none.status, none.stderr).toBe(0);
    expect(none.stdout).toContain('up to date');
    expect(rescans().length).toBe(idle);
  });

  it('6: WHEN `omarchy plugin remove --yes <id>` runs on an installed plugin THEN the plugin dir is gone and it exits 0', () => {
    expect(addRemove.status, addRemove.stderr).toBe(0);
    expect(existsSync(installed(homeRemove))).toBe(true);
    const r = omarchy(homeRemove, ['remove', '--yes', ID]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(installed(homeRemove))).toBe(false);
  });

  it('7: WHEN packaging/omarchy/setup, uninstall, bar-update and install.sh are read, comment lines dropped THEN no line invokes a pinned Omarchy script, `omarchy plugin` or `omarchy-shell` (so the setup tests\' sandbox PATH needs no pinned tier; one that does turns this red)', () => {
    const calls = SETUP_SCRIPTS.flatMap((f) =>
      readFileSync(join(process.cwd(), 'packaging', 'omarchy', f), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*#/.test(line) && OMARCHY_CALL.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(calls).toEqual([]);
    expect(Object.keys(PIN.scripts).filter((n) => n.startsWith('omarchy-plugin-') && !OMARCHY_CALL.test(` ${n}`))).toEqual([]);
  });

  describe('after test 5: a second commit lands on the origin', () => {
    // one or two spawns per hook; the test itself spawns nothing
    const head = (d: string) => git(d, 'rev-parse', 'HEAD').stdout.trim();
    let was = '';
    let idle = 0;
    let up: ReturnType<typeof omarchy>;
    let now = '';
    let tip = '';
    beforeAll(() => {
      writeFileSync(join(origin, 'CHANGELOG-probe.txt'), 'two\n');
      git(origin, 'add', 'CHANGELOG-probe.txt');
    });
    beforeAll(() => {
      git(origin, 'commit', '-q', '-m', 'two');
    });
    beforeAll(() => {
      was = head(installed(homeUpdate));
      idle = rescans().length;
    });
    beforeAll(() => {
      up = omarchy(homeUpdate, ['update', '--yes']);
    });
    beforeAll(() => {
      now = head(installed(homeUpdate));
    });
    beforeAll(() => {
      tip = head(origin);
    });

    it('8: WHEN a new commit lands on the local origin THEN `omarchy plugin update --yes` fast-forwards the installed clone and records exactly one rescan', () => {
      expect(addUpdate.status, addUpdate.stderr).toBe(0);
      expect(up.status, up.stderr).toBe(0);
      expect(now).toBe(tip);
      expect(now).not.toBe(was);
      expect(rescans().length).toBe(idle + 1);
    });
  });

  it('9: WHEN the tier is made THEN its root sits inside the per-file test home (process.env.HOME), whose name starts with snote-test-home-, so setup.ts removes it and the #310 leak guard sees it', () => {
    const home = process.env.HOME ?? '';
    expect(basename(home).startsWith('snote-test-home-'), home).toBe(true);
    expect(dirname(home)).toBe(tmpdir());
    expect(dirname(tier.root)).toBe(home);
  });
});
