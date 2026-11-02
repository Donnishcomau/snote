/**
 * #214: the delivered plugin cli.js refuses a symlinked plugin data folder
 * before any write, and starts without its compile cache (touching nothing)
 * when the cache folder is a symlink.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

describe('#214 plugin cli.js', () => {
  let dist: string;
  let root: string;

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-dist-sym-'));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-sym-home-'));
    await buildPluginDist(dist);
  }, 30000);

  afterAll(() => {
    fs.rmSync(dist, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  });

  const victimIn = (name: string): string => {
    const victim = path.join(root, name);
    fs.mkdirSync(victim);
    fs.chmodSync(victim, 0o755);
    return victim;
  };

  it('1: WHEN cli.js starts with a symlinked plugin data folder THEN it exits `2`, prints `snote data folder is a symlink: remove it and start again`, leaves the target mode unchanged and writes nothing into it', () => {
    const victim = victimIn('victim-plugin');
    const xdg = path.join(root, 'xdg');
    fs.mkdirSync(xdg);
    fs.symlinkSync(victim, path.join(xdg, 'omarchy-snote-plugin'));
    const run = spawnSync(process.execPath, [path.join(dist, 'cli.js')], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: root, XDG_DATA_HOME: xdg, XDG_CACHE_HOME: path.join(root, 'cache1'), SNOTE_UPDATE_CHECK: 'disabled' },
    });
    expect(run.status).toBe(2);
    expect(run.stdout).toContain('snote data folder is a symlink: remove it and start again');
    expect(fs.statSync(victim).mode & 0o777).toBe(0o755);
    expect(fs.readdirSync(victim)).toEqual([]);
    expect(fs.existsSync(path.join(xdg, 'snote'))).toBe(false);
  });

  it('2: WHEN the compile-cache folder is a symlink to another directory THEN cli.js still starts (`--version` exits `0`), the target mode is unchanged and nothing is written into it', () => {
    const victim = victimIn('victim-cache');
    const cache = path.join(root, 'cache2');
    fs.mkdirSync(path.join(cache, 'snote'), { recursive: true });
    fs.symlinkSync(victim, path.join(cache, 'snote', 'compile-cache'));
    const run = spawnSync(process.execPath, [path.join(dist, 'cli.js'), '--version'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: root, XDG_DATA_HOME: path.join(root, 'xdg2'), XDG_CACHE_HOME: cache },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^snote \d/);
    expect(fs.statSync(victim).mode & 0o777).toBe(0o755);
    expect(fs.readdirSync(victim)).toEqual([]);
  });
});
