import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { writeLauncher } from '../../scripts/build.mjs';

vi.setConfig({ testTimeout: 15000 });

const MAIN_TEXT =
  "console.log('main ran ' + process.argv.slice(2).join(','));";

describe('launcher', () => {
  let dir: string;
  let launcher: string;
  let xdg: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-launcher-'));
    fs.writeFileSync(path.join(dir, 'main.mjs'), MAIN_TEXT);
    launcher = path.join(dir, 'cli.js');
    writeLauncher(launcher, 'main.mjs');
    xdg = path.join(dir, 'xdg');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN the launcher is run with the arguments a and b THEN the exit status is 0 and stdout is `main ran a,b` followed by a newline", () => {
    const result = spawnSync(process.execPath, [launcher, 'a', 'b'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: xdg },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('main ran a,b\n');
  });

  it('2: WHEN that run has finished THEN the folder <dir>/xdg/snote/compile-cache exists and holds at least 1 entry', () => {
    const result = spawnSync(process.execPath, [launcher, 'a', 'b'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: xdg },
    });
    expect(result.status).toBe(0);
    const cacheDir = path.join(xdg, 'snote', 'compile-cache');
    expect(fs.existsSync(cacheDir)).toBe(true);
    expect(fs.readdirSync(cacheDir).length).toBeGreaterThanOrEqual(1);
  });

  it("3: WHEN the launcher file is read THEN its first line is `#!/usr/bin/env node`, it contains `enableCompileCache?.(` and `await import('./main.mjs')`, it is shorter than 600 characters and its mode has the owner-execute bit", () => {
    const text = fs.readFileSync(launcher, 'utf8');
    expect(text.split('\n')[0]).toBe('#!/usr/bin/env node');
    expect(text).toContain('enableCompileCache?.(');
    expect(text).toContain("await import('./main.mjs')");
    expect(text.length).toBeLessThan(600);
    const mode = fs.statSync(launcher).mode;
    expect((mode & 0o100) !== 0).toBe(true);
  });

  it('4: WHEN the launcher is run with XDG_CACHE_HOME set to a path UNDER A REGULAR FILE (so the cache folder cannot be made) THEN the exit status is still 0 and stdout still contains `main ran`', () => {
    const regularFile = path.join(dir, 'not-a-dir');
    fs.writeFileSync(regularFile, 'stop');
    const result = spawnSync(process.execPath, [launcher, 'a', 'b'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: path.join(regularFile, 'c') },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('main ran');
  });

  it("5: WHEN scripts/build.mjs and scripts/bench.mjs are read THEN the first contains `dist/snote-main.js` and `writeLauncher('dist/cli.js', 'snote-main.js')`, and the second contains `writeLauncher(` and `XDG_CACHE_HOME` and still contains `150`", () => {
    const build = fs.readFileSync('scripts/build.mjs', 'utf8');
    const bench = fs.readFileSync('scripts/bench.mjs', 'utf8');
    expect(build).toContain('dist/snote-main.js');
    expect(build).toContain("writeLauncher('dist/cli.js', 'snote-main.js')");
    expect(bench).toContain('writeLauncher(');
    expect(bench).toContain('XDG_CACHE_HOME');
    expect(bench).toContain('150');
  });
});
