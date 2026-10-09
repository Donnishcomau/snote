// T448 — end-to-end tests for `snote --check` and `snote --logout`:
// the bundled CLI runs as a child process against a temp HOME, temp XDG
// dirs and a temp --data-dir, so the real data dir is never touched.

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';

const tmp = join(
  '/tmp',
  'snote-cli-e2e-' + Date.now() + '-' + Math.floor(Math.random() * 1e9),
);
const home = join(tmp, 'home');
const data = join(tmp, 'data');
const account = join(data, 'a@b.co');
const keepFile = join(tmp, 'keep.txt');
const outfile = join(tmp, 'snote.js');

function env(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    XDG_DATA_HOME: join(tmp, 'xdg-data'),
    XDG_STATE_HOME: join(tmp, 'xdg-state'),
    XDG_CACHE_HOME: join(tmp, 'xdg-cache'),
    XDG_CONFIG_HOME: join(tmp, 'xdg-config'),
    SNOTE_UPDATE_CHECK: 'disabled',
    EDITOR: 'myed',
  };
}

function run(...args: string[]): ReturnType<typeof spawnSync> {
  // Run from the temp dir, where no node_modules can be found:
  // only the self-contained bundle starts.
  return spawnSync(process.execPath, [outfile, ...args], {
    encoding: 'utf8',
    env: env(),
    cwd: tmp,
  });
}

function sortedFiles(dir: string): string[] {
  return readdirSync(dir).sort();
}

function fillDataDir(): void {
  mkdirSync(account, { recursive: true });
  chmodSync(data, 0o700);
  writeFileSync(join(data, 'auth.json'), '{"email":"a@b.co","token":"t"}');
  writeFileSync(join(account, 'state.json'), '{}');
}

describe('snote --check and --logout (bundled CLI, temp dirs)', () => {
  beforeAll(async () => {
    mkdirSync(home, { recursive: true });
    fillDataDir();
    writeFileSync(keepFile, 'keep me\n');
    await bundle({ entry: 'src/cli/index.ts', outfile });
  }, 20000);

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN the bundle runs `--check --data-dir <tmp>/data` THEN it exits `0`, stdout contains `editor: myed` and `data dir: <tmp>/data`, and the sorted file list of the data dir is unchanged', () => {
    const before = sortedFiles(data);
    const r = run('--check', `--data-dir=${data}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('editor: myed');
    expect(r.stdout).toContain(`data dir: ${data}`);
    expect(sortedFiles(data)).toEqual(before);
  });

  it('2: WHEN the bundle runs `--logout --data-dir <tmp>/data` THEN it exits `0`, stdout is `logged out\\n`, the data dir exists and is empty, its mode `& 0o777` is `0o700`, and `<tmp>/keep.txt` still exists', () => {
    const r = run('--logout', `--data-dir=${data}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('logged out\n');
    expect(existsSync(data)).toBe(true);
    expect(readdirSync(data)).toEqual([]);
    expect(statSync(data).mode & 0o777).toBe(0o700);
    expect(existsSync(keepFile)).toBe(true);
  });

  it('3: WHEN `--logout` runs a second time on the now empty dir THEN it exits `0` and stdout is `logged out\\n`', () => {
    const r = run('--logout', `--data-dir=${data}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('logged out\n');
  });

  it('4: WHEN all runs are done THEN `<tmp>/home/.local/share/snote` does not exist (the real default data dir was never used)', () => {
    expect(existsSync(join(home, '.local', 'share', 'snote'))).toBe(false);
  });
});
