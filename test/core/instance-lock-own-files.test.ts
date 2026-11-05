/**
 * #634: without the kernel flock (the documented Known issue "two copies
 * started at the same moment"), a start removes the lock and the takeover
 * marker only while they are the files it created (rev2: the same device,
 * inode and change time its create returned; the path is never opened, so a
 * same-pid file, a symlink or a FIFO there stays and nothing blocks); another start's
 * lock or young marker stays. The other start is simulated by renaming a file
 * holding the pid `424242` onto the path, the way its exclusive create would
 * land there. The files are real, on disk.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ onSweep: null as null | ((p: string) => void), lstatFail: null as null | { path: string; code: string } }));

// rev3: lstat of one named path fails with a chosen code; every other call is the real one
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const lstatSync = ((p: fs.PathLike, o?: fs.StatSyncOptions) => {
    if (hook.lstatFail && String(p) === hook.lstatFail.path) throw Object.assign(new Error(`${hook.lstatFail.code}: injected, lstat '${String(p)}'`), { code: hook.lstatFail.code });
    return real.lstatSync(p, o);
  }) as typeof real.lstatSync;
  return { ...real, default: { ...real, lstatSync }, lstatSync };
});

vi.mock('../../src/core/secure-fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/secure-fs')>();
  return {
    ...real,
    secureExclusiveCreate: (p: string, data: string, mode?: number): string => {
      const id = real.secureExclusiveCreate(p, data, mode);
      if (p.endsWith('instance.lock.sweep') && hook.onSweep) hook.onSweep(p);
      return id;
    },
  };
});

import { acquireInstanceLock } from '../../src/core/instance-lock';

const OTHER = '424242';
const LOCK_TS = path.join(process.cwd(), 'src', 'core', 'instance-lock.ts');

/** The number of descriptors this process has open (Linux /proc). */
const openFds = (): number => fs.readdirSync('/proc/self/fd').length;

/** Put a file holding OTHER at `p`, as another start would. */
function other(p: string): void {
  fs.writeFileSync(`${p}.other`, OTHER);
  fs.renameSync(`${p}.other`, p);
}

describe('#634 a start removes only its own lock and marker', () => {
  let tmp: string;
  let dir: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-634-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    hook.onSweep = null;
    hook.lstatFail = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN this start holds the lock and another start\'s lock holding `424242` then takes its place THEN release() leaves `instance.lock` holding `424242`', () => {
    const lock = acquireInstanceLock(dir);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
    other(path.join(dir, 'instance.lock'));
    lock.release();
    expect(fs.existsSync(path.join(dir, 'instance.lock'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(OTHER);
  });

  it('2: WHEN this start holds the lock and releases it THEN the folder is empty', () => {
    acquireInstanceLock(dir).release();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('3: WHEN the folder holds no lock but a takeover marker written just now holding `424242` (another start mid-takeover) THEN acquireInstanceLock returns a lock and, after release(), `instance.lock.sweep` still holds `424242`', () => {
    other(path.join(dir, 'instance.lock.sweep'));
    const lock = acquireInstanceLock(dir);
    lock.release();
    expect(fs.readdirSync(dir)).toEqual(['instance.lock.sweep']);
    expect(fs.readFileSync(path.join(dir, 'instance.lock.sweep'), 'utf8')).toBe(OTHER);
  });

  it('4: WHEN the folder holds the stale lock `999999999` and, just after this start takes the takeover marker, another start\'s marker holding `424242` takes its place THEN acquireInstanceLock returns a lock holding this pid and `instance.lock.sweep` still holds `424242`', () => {
    fs.writeFileSync(path.join(dir, 'instance.lock'), '999999999');
    const old = (Date.now() - 10000) / 1000;
    fs.utimesSync(path.join(dir, 'instance.lock'), old, old);
    hook.onSweep = (p) => {
      hook.onSweep = null;
      other(p);
    };
    const lock = acquireInstanceLock(dir);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
    expect(fs.existsSync(path.join(dir, 'instance.lock.sweep'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'instance.lock.sweep'), 'utf8')).toBe(OTHER);
    lock.release();
  });

  it('6: WHEN the folder holds the stale lock `999999999`, 10 seconds old, and this start takes it over and later releases it THEN the folder is empty', () => {
    fs.writeFileSync(path.join(dir, 'instance.lock'), '999999999');
    const old = (Date.now() - 10000) / 1000;
    fs.utimesSync(path.join(dir, 'instance.lock'), old, old);
    const lock = acquireInstanceLock(dir);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
    lock.release();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('5: WHEN a takeover marker 10 seconds old is left by a killed takeover THEN acquireInstanceLock returns a lock and the marker is gone', () => {
    fs.writeFileSync(path.join(dir, 'instance.lock.sweep'), '');
    const old = (Date.now() - 10000) / 1000;
    fs.utimesSync(path.join(dir, 'instance.lock.sweep'), old, old);
    const lock = acquireInstanceLock(dir);
    expect(fs.existsSync(path.join(dir, 'instance.lock.sweep'))).toBe(false);
    lock.release();
  });

  it('7: WHEN this start holds the lock and another file holding this same pid (another pid namespace) takes its place THEN release() leaves that file and its text', () => {
    const lock = acquireInstanceLock(dir);
    fs.writeFileSync(path.join(dir, 'instance.lock.other'), String(process.pid));
    fs.renameSync(path.join(dir, 'instance.lock.other'), path.join(dir, 'instance.lock'));
    lock.release();
    expect(fs.existsSync(path.join(dir, 'instance.lock'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
  });

  it('8: WHEN this start holds the lock and a symlink to a file holding this pid takes its place THEN release() leaves the symlink, and the target keeps its text', () => {
    const lock = acquireInstanceLock(dir);
    const target = path.join(tmp, 'target');
    fs.writeFileSync(target, String(process.pid));
    fs.rmSync(path.join(dir, 'instance.lock'));
    fs.symlinkSync(target, path.join(dir, 'instance.lock'));
    lock.release();
    expect(fs.lstatSync(path.join(dir, 'instance.lock')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe(String(process.pid));
  });

  it('9: WHEN a child start holds the lock, a FIFO then takes the lock\'s place and the child releases THEN the child reports `released` within 2000 ms and the FIFO is still there', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', '-e', `const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)}); const l = acquireInstanceLock(${JSON.stringify(dir)}); console.log('held'); process.stdin.once('data', () => { l.release(); console.log('released'); process.exit(0); });`], { stdio: ['pipe', 'pipe', 'inherit'] });
    const seen: string[] = [];
    const heard = (word: string): Promise<boolean> =>
      new Promise((resolve) => {
        const check = (): void => {
          if (seen.join('').includes(word)) resolve(true);
        };
        child.stdout?.on('data', (b: Buffer) => {
          seen.push(String(b));
          check();
        });
        child.once('exit', () => resolve(seen.join('').includes(word)));
        check();
      });
    try {
      expect(await heard('held')).toBe(true);
      fs.rmSync(path.join(dir, 'instance.lock'));
      expect(spawnSync('mkfifo', [path.join(dir, 'instance.lock')]).status).toBe(0);
      child.stdin?.write('go\n');
      const released = await Promise.race([heard('released'), new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]);
      expect(released).toBe(true);
      expect(fs.lstatSync(path.join(dir, 'instance.lock')).isFIFO()).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
  }, 20000);

  it('10: WHEN this start holds the lock and lstat of `instance.lock` fails with EACCES, then EIO, then ENOTDIR at release() THEN release() does not throw, `instance.lock` still holds this pid, and the open descriptor count is back to its count before the acquire', () => {
    for (const code of ['EACCES', 'EIO', 'ENOTDIR']) {
      fs.rmSync(path.join(dir, 'instance.lock'), { force: true });
      const before = openFds();
      const lock = acquireInstanceLock(dir);
      hook.lstatFail = { path: path.join(dir, 'instance.lock'), code };
      expect(() => lock.release(), code).not.toThrow();
      hook.lstatFail = null;
      expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8'), code).toBe(String(process.pid));
      expect(openFds(), code).toBe(before);
    }
  });

  it('11: WHEN the folder holds the stale lock `999999999`, 10 seconds old, and lstat of `instance.lock.sweep` fails with EIO during the takeover THEN acquireInstanceLock returns a lock holding this pid, the marker stays, and after release() the open descriptor count is back to its count before the acquire', () => {
    fs.writeFileSync(path.join(dir, 'instance.lock'), '999999999');
    const old = (Date.now() - 10000) / 1000;
    fs.utimesSync(path.join(dir, 'instance.lock'), old, old);
    const before = openFds();
    hook.lstatFail = { path: path.join(dir, 'instance.lock.sweep'), code: 'EIO' };
    const lock = acquireInstanceLock(dir);
    hook.lstatFail = null;
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
    expect(fs.existsSync(path.join(dir, 'instance.lock.sweep'))).toBe(true);
    lock.release();
    expect(openFds()).toBe(before);
  });
});
