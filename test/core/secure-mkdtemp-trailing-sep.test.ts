/**
 * #267: secureMkdtemp refuses a prefix whose holding folder is a symlink, however
 * the prefix spells that folder (trailing separators, `.` components).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { secureMkdtemp } from '../../src/core/secure-fs';

function withRoot(run: (b: string, target: string, link: string) => void): void {
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-267-'));
  try {
    const target = path.join(b, 'target');
    fs.mkdirSync(target);
    fs.mkdirSync(path.join(b, 'dir'));
    const link = path.join(b, 'dir', 'link');
    fs.symlinkSync(target, link);
    fs.mkdirSync(path.join(b, 'real'));
    run(b, target, link);
  } finally {
    fs.rmSync(b, { recursive: true, force: true });
  }
}

function refused(prefix: string, target: string): void {
  expect(() => secureMkdtemp(prefix)).toThrow(/symlink/);
  expect(fs.readdirSync(target)).toHaveLength(0);
}

describe('#267 secureMkdtemp trailing separator', () => {
  it('1: WHEN secureMkdtemp gets `<b>/dir/link/` and `link` is a symlink to `<b>/target` THEN it throws an error whose message contains `symlink` and `<b>/target` holds `0` entries', () => {
    withRoot((_b, target, link) => refused(link + path.sep, target));
  });

  it('2: WHEN it gets `<b>/dir/link//` (two trailing separators) and `link` is the same symlink THEN it throws an error containing `symlink` and `<b>/target` holds `0` entries', () => {
    withRoot((_b, target, link) => refused(link + '//', target));
  });

  it('3: WHEN it gets `<b>/real/` and `real` is a real folder THEN it returns a new folder directly inside `<b>/real` with mode `0700`, and `<b>/real` holds exactly `1` entry', () => {
    withRoot((b) => {
      const real = path.join(b, 'real');
      const made = secureMkdtemp(real + path.sep);
      expect(path.dirname(made)).toBe(real);
      expect(fs.statSync(made).mode & 0o777).toBe(0o700);
      expect(fs.readdirSync(real)).toHaveLength(1);
    });
  });

  it('4: WHEN it gets `<b>/real/snote-` THEN it returns a folder directly inside `<b>/real` whose name starts with `snote-`, mode `0700`, as before the change', () => {
    withRoot((b) => {
      const real = path.join(b, 'real');
      const made = secureMkdtemp(path.join(real, 'snote-'));
      expect(path.dirname(made)).toBe(real);
      expect(path.basename(made).startsWith('snote-')).toBe(true);
      expect(fs.statSync(made).mode & 0o777).toBe(0o700);
    });
  });

  it('5: WHEN secureMkdtemp gets `<b>/dir/link/./snote-` and `link` is a symlink to `<b>/target` THEN it throws an error containing `symlink` and `<b>/target` holds `0` entries', () => {
    withRoot((_b, target, link) => refused(`${link}${path.sep}.${path.sep}snote-`, target));
  });

  it('6: WHEN it gets `<b>/dir/link/./` and `link` is the same symlink THEN it throws an error containing `symlink` and `<b>/target` holds `0` entries', () => {
    withRoot((_b, target, link) => refused(`${link}${path.sep}.${path.sep}`, target));
  });

  it('7: WHEN it gets `<b>/dir/link/.` and `link` is the same symlink THEN it throws an error containing `symlink` and `<b>/target` holds `0` entries (refused on the base; this line pins that it stays refused)', () => {
    withRoot((_b, target, link) => refused(`${link}${path.sep}.`, target));
  });
});
