/**
 * T509: the compile-cache folder is created 0700 and `instance.lock` 0600,
 * whatever the umask (F156, F157).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeLauncher } from '../../scripts/build.mjs';
import { acquireInstanceLock } from '../../src/core/instance-lock';

vi.setConfig({ testTimeout: 15000 });

const MAIN_TEXT = "console.log('main ran');";

const modeOf = (p: string): number => fs.statSync(p).mode & 0o777;

describe('private modes', () => {
  let dir: string;
  let launcher: string;
  let xdg: string;
  let prevUmask: number;

  beforeEach(() => {
    prevUmask = process.umask(0o022);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-private-modes-'));
    fs.writeFileSync(path.join(dir, 'main.mjs'), MAIN_TEXT);
    launcher = path.join(dir, 'cli.js');
    writeLauncher(launcher, 'main.mjs');
    xdg = path.join(dir, 'xdg');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.umask(prevUmask);
  });

  it('1: WHEN the launcher runs under umask 022 with `XDG_CACHE_HOME` at a folder that does not exist yet THEN stdout is `main ran`, `<xdg>/snote/compile-cache` holds at least 1 entry and its mode is `0o700`', () => {
    const result = spawnSync(process.execPath, [launcher], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: xdg },
    });
    expect(result.stdout).toBe('main ran\n');
    const cacheDir = path.join(xdg, 'snote', 'compile-cache');
    expect(fs.readdirSync(cacheDir).length).toBeGreaterThanOrEqual(1);
    expect(modeOf(cacheDir)).toBe(0o700);
  });

  it('2: WHEN `<xdg>/snote/compile-cache` already exists with mode `0o755` and holds the file `old.bin` THEN after the launcher runs its mode is `0o700` and `old.bin` still exists', () => {
    const cacheDir = path.join(xdg, 'snote', 'compile-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.chmodSync(cacheDir, 0o755);
    const oldBin = path.join(cacheDir, 'old.bin');
    fs.writeFileSync(oldBin, 'old');
    const result = spawnSync(process.execPath, [launcher], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: xdg },
    });
    expect(result.stdout).toContain('main ran');
    expect(modeOf(cacheDir)).toBe(0o700);
    expect(fs.existsSync(oldBin)).toBe(true);
  });

  it('3: WHEN `XDG_CACHE_HOME` is a path under a regular file THEN the launcher exits `0` and stdout contains `main ran`, and the launcher text is shorter than 600 characters', () => {
    const regularFile = path.join(dir, 'not-a-dir');
    fs.writeFileSync(regularFile, 'stop');
    const result = spawnSync(process.execPath, [launcher], {
      encoding: 'utf8',
      env: { ...process.env, XDG_CACHE_HOME: path.join(regularFile, 'c') },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('main ran');
    expect(fs.readFileSync(launcher, 'utf8').length).toBeLessThan(600);
  });

  it("4: WHEN `acquireInstanceLock(d)` runs under umask 022 on an empty folder `d` THEN `d/instance.lock` has mode `0o600` and holds this process's pid", () => {
    const d = path.join(dir, 'acct');
    fs.mkdirSync(d);
    const lock = acquireInstanceLock(d);
    try {
      const lockPath = path.join(d, 'instance.lock');
      expect(modeOf(lockPath)).toBe(0o600);
      expect(fs.readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
    } finally {
      lock.release();
    }
  });

  it("5: WHEN `d/instance.lock` is a leftover from a dead pid with mode `0o644` THEN after `acquireInstanceLock(d)` it has mode `0o600` and holds this process's pid, and `release()` removes it", () => {
    const d = path.join(dir, 'acct');
    fs.mkdirSync(d);
    const lockPath = path.join(d, 'instance.lock');
    fs.writeFileSync(lockPath, '999999');
    fs.chmodSync(lockPath, 0o644);
    const lock = acquireInstanceLock(d);
    expect(modeOf(lockPath)).toBe(0o600);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
    lock.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
