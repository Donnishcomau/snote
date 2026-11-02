/**
 * #214: a symlinked snote folder is refused, never
 * followed. secureMkdir throws before any mkdir or chmod, the start-up check in
 * main() refuses a symlinked data folder or bar plugin data folder, and a
 * real folder with a looser mode is still tightened to 0700.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { secureMkdir } from '../../src/core/secure-fs';
import { writeStatusFile } from '../../src/core/status-file';
import type { Status } from '../../src/core/status-file';
import { main } from '../../src/cli/main';

let root: string;
let victim: string;
const savedXdg = process.env.XDG_DATA_HOME;
const savedStatus = process.env.SNOTE_STATUS_DIR;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-symdir-'));
  victim = path.join(root, 'victim-dir');
  fs.mkdirSync(victim);
  fs.chmodSync(victim, 0o755);
});

afterEach(() => {
  if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = savedXdg;
  if (savedStatus === undefined) delete process.env.SNOTE_STATUS_DIR;
  else process.env.SNOTE_STATUS_DIR = savedStatus;
  fs.rmSync(root, { recursive: true, force: true });
});

const victimUntouched = (): boolean =>
  (fs.statSync(victim).mode & 0o777) === 0o755 && fs.readdirSync(victim).length === 0;

describe('#214 symlinked folders', () => {
  it('1: WHEN the snote data folder, or the bar plugin data folder, is a symlink to another directory THEN main prints `snote data folder is a symlink: remove it and start again`, returns `2`, the target mode is unchanged, no file is written into it and writeStatusFile on the link throws', async () => {
    const link = path.join(root, 'snote');
    fs.symlinkSync(victim, link);
    process.env.XDG_DATA_HOME = path.join(root, 'xdg');
    const lines: string[] = [];
    const code = await main(['--data-dir', link], { log: (t) => lines.push(t) });
    expect(code).toBe(2);
    expect(lines).toEqual(['snote data folder is a symlink: remove it and start again']);
    expect(victimUntouched()).toBe(true);

    // the bar plugin's data folder, through SNOTE_STATUS_DIR: the same refusal
    const xdg = path.join(root, 'xdg');
    fs.mkdirSync(xdg);
    const pluginLink = path.join(xdg, 'omarchy-snote-plugin');
    fs.symlinkSync(victim, pluginLink);
    process.env.XDG_DATA_HOME = xdg;
    process.env.SNOTE_STATUS_DIR = pluginLink;
    const pluginLines: string[] = [];
    const pluginCode = await main(['--data-dir', path.join(root, 'data')], { log: (t) => pluginLines.push(t) });
    expect(pluginCode).toBe(2);
    expect(pluginLines).toEqual(['snote data folder is a symlink: remove it and start again']);
    expect(() => writeStatusFile(pluginLink, { v: 1 } as unknown as Status)).toThrow(/symlink/);
    expect(victimUntouched()).toBe(true);
    expect(fs.existsSync(path.join(root, 'data'))).toBe(false);
  });

  it('2: WHEN an account sub-folder or the drafts folder is a symlink THEN secureMkdir throws and the target mode is unchanged and nothing is written into it, and WHEN a folder is a real directory with mode 0755 THEN secureMkdir tightens it to `0700`', () => {
    const data = path.join(root, 'data');
    fs.mkdirSync(data);
    for (const name of ['acct@example.invalid', 'drafts']) {
      fs.symlinkSync(victim, path.join(data, name));
      expect(() => secureMkdir(path.join(data, name)), name).toThrow(/symlink/);
      expect(victimUntouched(), name).toBe(true);
      fs.unlinkSync(path.join(data, name));
    }
    const real = path.join(root, 'real');
    fs.mkdirSync(real);
    fs.chmodSync(real, 0o755);
    secureMkdir(real);
    expect(fs.statSync(real).mode & 0o777).toBe(0o700);
    secureMkdir(path.join(real, 'a', 'b'));
    expect(fs.statSync(path.join(real, 'a', 'b')).mode & 0o777).toBe(0o700);
  });

});
