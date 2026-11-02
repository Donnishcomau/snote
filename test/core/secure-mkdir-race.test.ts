/**
 * #214: secureMkdir chmods through a descriptor opened with O_NOFOLLOW, so a
 * link planted AFTER the lstat check (the race) is still refused. The lstat is
 * faked to report "not a symlink" for the link, which is what the race looks
 * like to the function.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ link: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    lstatSync: ((p: string, ...rest: unknown[]) =>
      p === fake.link
        ? { isSymbolicLink: () => false }
        : (actual.lstatSync as (...a: unknown[]) => unknown)(p, ...rest)) as typeof actual.lstatSync,
  };
});

import { secureMkdir } from '../../src/core/secure-fs';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-mkrace-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('#214 secureMkdir descriptor', () => {
  it('1: WHEN a symlink is planted after the lstat check (the lstat says "not a symlink") THEN secureMkdir throws from its O_NOFOLLOW open (`ELOOP` or `ENOTDIR`, whichever the system gives for a link opened as a directory) and the link target keeps mode `0755`', () => {
    const victim = path.join(root, 'victim-dir');
    fs.mkdirSync(victim);
    fs.chmodSync(victim, 0o755);
    const link = path.join(root, 'snote');
    fs.symlinkSync(victim, link);
    fake.link = link;
    let code: string | undefined;
    try {
      secureMkdir(link);
    } catch (e) {
      code = (e as NodeJS.ErrnoException).code;
    }
    expect(['ELOOP', 'ENOTDIR']).toContain(code);
    expect(fs.statSync(victim).mode & 0o777).toBe(0o755);
  });
});
