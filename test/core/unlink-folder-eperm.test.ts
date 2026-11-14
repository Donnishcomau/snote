/**
 * #871: on macOS `unlink(2)` of a folder fails with EPERM, where Linux gives
 * EISDIR. secureUnlink maps that case to EISDIR, so a `*.tmp` folder in the
 * data folder no longer aborts the start sweep or logout, and a save over it
 * reports `EISDIR` on both platforms. Any other EPERM (a file that cannot be
 * removed) still throws EPERM. The mock below makes unlinkSync act as macOS
 * does on this Linux runner; the files and folders are real, on disk.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ mac: false, epermFile: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const eperm = (p: string): Error =>
    Object.assign(new Error(`EPERM: operation not permitted, unlink '${p}'`), { code: 'EPERM', errno: -1, syscall: 'unlink', path: p });
  return {
    ...actual,
    unlinkSync: ((p: fs.PathLike) => {
      const s = String(p);
      if (fake.mac && actual.lstatSync(s, { throwIfNoEntry: false })?.isDirectory()) throw eperm(s);
      if (fake.epermFile !== '' && s === fake.epermFile) throw eperm(s);
      actual.unlinkSync(p);
    }) as typeof actual.unlinkSync,
  };
});

import { problemText } from '../../src/core/problem-signal';
import { secureUnlink, secureWriteFileSync } from '../../src/core/secure-fs';
import { logout, sweepStaleTemps } from '../../src/core/token';

let dir: string;
const code = (f: () => void): string | undefined => {
  try {
    f();
  } catch (e) {
    return (e as NodeJS.ErrnoException).code;
  }
  return undefined;
};
const folderWithKeep = (name: string): string => {
  const sub = path.join(dir, name);
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, 'keep.txt'), 'mine');
  return sub;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-871-'));
  fake.mac = true;
  fake.epermFile = '';
});

afterEach(() => {
  fake.mac = false;
  fake.epermFile = '';
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('#871 a folder where a file is unlinked gives EISDIR on macOS too', () => {
  it('1: WHEN unlinkSync gives EPERM for a folder (macOS) and secureUnlink runs on folder `x.tmp` holding `keep.txt` THEN it throws code `EISDIR` and `x.tmp/keep.txt` still holds `mine`', () => {
    const sub = folderWithKeep('x.tmp');
    expect([code(() => secureUnlink(sub)), fs.readFileSync(path.join(sub, 'keep.txt'), 'utf8')]).toEqual(['EISDIR', 'mine']);
  });

  it('2: WHEN unlinkSync gives EPERM for the regular file `auth.json` (a file that cannot be removed) and secureUnlink runs on it THEN it throws code `EPERM` and the file is still there', () => {
    const f = path.join(dir, 'auth.json');
    fs.writeFileSync(f, '{}');
    fake.epermFile = f;
    expect([code(() => secureUnlink(f)), fs.existsSync(f)]).toEqual(['EPERM', true]);
  });

  it('3: WHEN `ghosts-note.json.tmp` is a folder holding `keep.txt` and sweepStaleTemps(dir) runs with the macOS EPERM THEN it does not throw and `keep.txt` still holds `mine`', () => {
    const sub = folderWithKeep('ghosts-note.json.tmp');
    expect([code(() => sweepStaleTemps(dir)), fs.readFileSync(path.join(sub, 'keep.txt'), 'utf8')]).toEqual([undefined, 'mine']);
  });

  it('4: WHEN `blog.json.tmp` is a folder holding `keep.txt` beside `auth.json` and logout(dir) runs with the macOS EPERM THEN it resolves, `auth.json` is gone and `keep.txt` still holds `mine`', async () => {
    const sub = folderWithKeep('blog.json.tmp');
    fs.writeFileSync(path.join(dir, 'auth.json'), '{}');
    await expect(logout(dir)).resolves.toBeUndefined();
    expect([fs.existsSync(path.join(dir, 'auth.json')), fs.readFileSync(path.join(sub, 'keep.txt'), 'utf8')]).toEqual([false, 'mine']);
  });

  it('5: WHEN unlinkSync gives EPERM for the file `auth.json` and logout(dir) runs THEN logout rejects with code `EPERM` and `auth.json` is still there (the token is never left behind silently)', async () => {
    const f = path.join(dir, 'auth.json');
    fs.writeFileSync(f, '{}');
    fake.epermFile = f;
    await expect(logout(dir)).rejects.toMatchObject({ code: 'EPERM' });
    expect(fs.existsSync(f)).toBe(true);
  });

  it('6: WHEN `state.json.tmp` is a folder and secureWriteFileSync(`state.json`) runs with the macOS EPERM THEN it throws, problemText gives `could not save notes: EISDIR`, and no `state.json` is written', () => {
    fs.mkdirSync(path.join(dir, 'state.json.tmp'));
    let err: unknown;
    try {
      secureWriteFileSync(path.join(dir, 'state.json'), '{}');
    } catch (e) {
      err = e;
    }
    expect([problemText('could not save notes', err), fs.existsSync(path.join(dir, 'state.json'))]).toEqual(['could not save notes: EISDIR', false]);
  });
});
