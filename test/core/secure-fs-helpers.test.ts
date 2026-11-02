/**
 * #194: every raw write, mkdir, chmod and write-mode open lives
 * in src/core/secure-fs.ts. These are the behaviour tests of its helpers: the
 * exclusive create (instance lock, note export), the no-follow read open
 * (account id, drafts), the plain folder helper, and the write helper under a
 * process that keeps re-planting a symlink at its temp name.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { acquireInstanceLock } from '../../src/core/instance-lock';
import {
  ensureDir,
  secureExclusiveCreate,
  secureOpenForRead,
  secureWriteFileSync,
} from '../../src/core/secure-fs';

let root: string;
let victim: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-sfs-'));
  victim = path.join(root, 'victim.txt');
  fs.writeFileSync(victim, 'victim-original');
  fs.chmodSync(victim, 0o644);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const victimIntact = (): boolean =>
  fs.readFileSync(victim, 'utf8') === 'victim-original' && (fs.statSync(victim).mode & 0o777) === 0o644;

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as NodeJS.ErrnoException).code;
  }
  return undefined;
};

describe('#194 secure-fs helpers', () => {
  it('1: WHEN a file, a symlink to a file, or a dangling symlink sits at the path THEN secureExclusiveCreate throws `EEXIST`, the link target is unchanged and the dangling target is not created, and WHEN the path is free it writes the text with mode `0600`, or 0666 narrowed by the umask when asked', () => {
    const plain = path.join(root, 'plain.txt');
    fs.writeFileSync(plain, 'keep');
    expect(codeOf(() => secureExclusiveCreate(plain, 'new'))).toBe('EEXIST');
    expect(fs.readFileSync(plain, 'utf8')).toBe('keep');

    const link = path.join(root, 'link.txt');
    fs.symlinkSync(victim, link);
    expect(codeOf(() => secureExclusiveCreate(link, 'new'))).toBe('EEXIST');
    expect(victimIntact()).toBe(true);

    const missing = path.join(root, 'not-there.txt');
    const dangling = path.join(root, 'dangling.txt');
    fs.symlinkSync(missing, dangling);
    expect(codeOf(() => secureExclusiveCreate(dangling, 'new'))).toBe('EEXIST');
    expect(fs.existsSync(missing)).toBe(false);

    const fresh = path.join(root, 'fresh.txt');
    secureExclusiveCreate(fresh, 'hello');
    expect(fs.readFileSync(fresh, 'utf8')).toBe('hello');
    expect(fs.statSync(fresh).mode & 0o777).toBe(0o600);

    const umask = process.umask();
    const open = path.join(root, 'open.txt');
    secureExclusiveCreate(open, 'hello', 0o666);
    expect(fs.statSync(open).mode & 0o777).toBe(0o666 & ~umask);
  });

  it('2: WHEN a symlink sits at instance.lock THEN acquireInstanceLock replaces it with a regular `0600` lock holding this pid and the link target is unchanged, and a second acquire while it is held throws `it holds the instance lock`', () => {
    const dir = path.join(root, 'data');
    fs.mkdirSync(dir);
    const lock = path.join(dir, 'instance.lock');
    fs.symlinkSync(victim, lock);
    const held = acquireInstanceLock(dir);
    try {
      expect(victimIntact()).toBe(true);
      const st = fs.lstatSync(lock);
      expect(st.isFile() && (st.mode & 0o777) === 0o600).toBe(true);
      expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.pid));
      expect(() => acquireInstanceLock(dir)).toThrow('it holds the instance lock');
    } finally {
      held.release();
    }
  });

  it('3: WHEN secureOpenForRead opens a symlink THEN it throws, WHEN it opens a regular file THEN the descriptor reads the text, and ensureDir creates nested folders without changing the mode of an existing one', () => {
    const link = path.join(root, 'read-link.txt');
    fs.symlinkSync(victim, link);
    expect(codeOf(() => secureOpenForRead(link))).toBe('ELOOP');
    expect(codeOf(() => secureOpenForRead(link, { nonBlock: true }))).toBe('ELOOP');
    const fd = secureOpenForRead(victim, { nonBlock: true });
    try {
      expect(fs.readFileSync(fd, 'utf8')).toBe('victim-original');
    } finally {
      fs.closeSync(fd);
    }
    const existing = path.join(root, 'existing');
    fs.mkdirSync(existing);
    fs.chmodSync(existing, 0o755);
    ensureDir(path.join(existing, 'a', 'b'));
    expect(fs.statSync(path.join(existing, 'a', 'b')).isDirectory()).toBe(true);
    expect(fs.statSync(existing).mode & 0o777).toBe(0o755);
  });

  it('4: WHEN another process keeps re-planting a symlink at the temp name for 1.5 s while secureWriteFileSync runs in a loop THEN the link target keeps its text and mode', async () => {
    const target = path.join(root, 'state.json');
    const planter = spawn(process.execPath, [
      '-e',
      `const fs=require('fs');const t=${JSON.stringify(target + '.tmp')};const v=${JSON.stringify(victim)};const end=Date.now()+2500;while(Date.now()<end){try{fs.symlinkSync(v,t)}catch{}}`,
    ]);
    await new Promise((r) => setTimeout(r, 150));
    const end = Date.now() + 1500;
    while (Date.now() < end) {
      try {
        secureWriteFileSync(target, 'NEW');
      } catch {
        // losing the race to the planter fails the write; it must never write through
      }
    }
    planter.kill();
    expect(victimIntact()).toBe(true);
  }, 15000);
});
