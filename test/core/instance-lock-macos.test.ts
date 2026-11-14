/**
 * #446: on macOS the instance lock takes the kernel lock with the Homebrew `flock` formula's program, by its fixed
 * absolute path (never PATH): /opt/homebrew on Apple silicon, /usr/local on Intel (x64). Tests 1 to 3 and 5 replace the
 * spawn of that program in-process with process.platform set to darwin and process.arch pinned; test 4 runs only on a
 * Mac with the formula installed and uses the real program.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acquireInstanceLock, flockBin } from '../../src/core/instance-lock';
import { hostileText } from '../fixtures/hostile';
import { restorePlatform, setPlatform } from '../helpers/platform';

const BREW_FLOCK = '/opt/homebrew/opt/flock/bin/flock';
const INTEL_FLOCK = '/usr/local/opt/flock/bin/flock';
type SpawnOpts = { stdio?: unknown[]; encoding?: string; env?: Record<string, string>; timeout?: number; killSignal?: string; maxBuffer?: number; shell?: boolean };
const fake = vi.hoisted(() => ({
  on: false,
  answers: [] as unknown[],
  calls: [] as { file: string; args: string[]; opts: SpawnOpts }[],
  ps: { status: 1 as number | null, stdout: '' },
}));

vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>();
  return {
    ...real,
    spawnSync: (file: string, ...rest: unknown[]) => {
      if (fake.on && (file === '/bin/ps' || file.endsWith('/ps'))) {
        fake.calls.push({ file, args: rest[0] as string[], opts: (rest[1] ?? {}) as SpawnOpts });
        return { status: fake.ps.status, signal: null, stdout: fake.ps.stdout, stderr: '' };
      }
      if (!fake.on || !file.endsWith('/flock')) return (real.spawnSync as (...a: unknown[]) => unknown)(file, ...rest);
      fake.calls.push({ file, args: rest[0] as string[], opts: (rest[1] ?? {}) as SpawnOpts });
      return fake.answers.shift() ?? { status: 0, signal: null };
    },
  };
});

// #446 review: the darwin row depends on the arch, so a darwin test pins it too (Linux CI runs on x64 and arm64)
const realArch = Object.getOwnPropertyDescriptor(process, 'arch') as PropertyDescriptor;
const setArch = (value: string): void => {
  Object.defineProperty(process, 'arch', { ...realArch, value });
};
const asDarwin = (arch = 'arm64'): void => {
  setPlatform('darwin');
  setArch(arch);
};
const dirs: string[] = [];
const releases: (() => void)[] = [];
const fresh = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-maclock-'));
  dirs.push(dir);
  return dir;
};
const acquire = (dir: string) => {
  const lock = acquireInstanceLock(dir);
  releases.push(lock.release);
  return lock;
};

afterEach(() => {
  restorePlatform();
  Object.defineProperty(process, 'arch', realArch);
  for (const r of releases.splice(0)) r();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  Object.assign(fake, { on: false, answers: [], calls: [], ps: { status: 1, stdout: '' } });
});

describe('#446 macOS kernel lock through the Homebrew flock formula', () => {
  it('1: WHEN flockBin is asked for `darwin` on `arm64`, `darwin` on `x64`, `linux` on `x64` and `arm64`, and `freebsd` on `x64` THEN it answers `/opt/homebrew/opt/flock/bin/flock`, `/usr/local/opt/flock/bin/flock`, and `/usr/bin/flock` three times', () => {
    expect([flockBin('darwin', 'arm64'), flockBin('darwin', 'x64'), flockBin('linux', 'x64'), flockBin('linux', 'arm64'), flockBin('freebsd', 'x64')]).toEqual([BREW_FLOCK, INTEL_FLOCK, '/usr/bin/flock', '/usr/bin/flock', '/usr/bin/flock']);
  });

  it('2: WHEN process.platform is `darwin`, process.arch is `arm64` and the replaced flock spawn answers `status` `0` THEN acquireInstanceLock spawned exactly `/opt/homebrew/opt/flock/bin/flock` once, with the arguments `-n` and `0` and a numeric fd as stdin, and the lock has no `unlocked` reason', () => {
    asDarwin();
    fake.on = true;
    const lock = acquire(fresh());
    expect([fake.calls.map((c) => c.file), fake.calls[0]?.args, typeof fake.calls[0]?.opts.stdio?.[0], lock.unlocked]).toEqual([[BREW_FLOCK], ['-n', '0'], 'number', undefined]);
  });

  it('3: WHEN process.platform is `darwin` and the flock spawn fails with `ENOENT` (formula not installed), and on another folder answers `status` `1` (held) THEN the first returns a lock with `unlocked` `missing` and the second throws a message containing `it holds the instance lock`', () => {
    asDarwin();
    fake.on = true;
    fake.answers = [{ status: null, signal: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }];
    expect(acquire(fresh()).unlocked).toBe('missing');
    fake.answers = [{ status: 1, signal: null }];
    expect(() => acquire(fresh())).toThrow('it holds the instance lock');
  });

  it.skipIf(process.platform !== 'darwin' || !fs.existsSync(flockBin()))('4: WHEN, on macOS with the flock formula installed, snote holds the instance lock of a folder THEN the lock has no `unlocked` reason, the real flock program run with `-n` on a new fd of that folder exits `1` (held by snote), and after release it exits `0`', async () => {
    const { spawnSync } = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    const dir = fresh();
    const probe = (): number | null => {
      const fd = fs.openSync(`${dir}/.`, 'r');
      try {
        return spawnSync(flockBin(), ['-n', '0'], { stdio: [fd, 'ignore', 'ignore'], timeout: 2000 }).status;
      } finally {
        fs.closeSync(fd);
      }
    };
    const lock = acquire(dir);
    const held = probe();
    lock.release();
    expect([lock.unlocked, held, probe()]).toEqual([undefined, 1, 0]);
  });

  it('5: WHEN process.platform is `darwin`, process.arch is `x64` (Intel) and the replaced flock spawn answers `status` `0` THEN acquireInstanceLock spawned exactly `/usr/local/opt/flock/bin/flock` once, with the arguments `-n` and `0` and a numeric fd as stdin, and the lock has no `unlocked` reason (#446 review)', () => {
    asDarwin('x64');
    fake.on = true;
    const lock = acquire(fresh());
    expect([fake.calls.map((c) => c.file), fake.calls[0]?.args, typeof fake.calls[0]?.opts.stdio?.[0], lock.unlocked]).toEqual([[INTEL_FLOCK], ['-n', '0'], 'number', undefined]);
  });

  it("6: WHEN darwin, ps status 1, lock is ppid plus hostileText('P') THEN the message contains `it holds the instance lock`, `(pid ` + ppid, and `instance.lock`, the file is unchanged, and hostileText('P') is absent", () => {
    asDarwin();
    fake.on = true;
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    const pid = String(process.ppid);
    const hostile = hostileText('P');
    const body = pid + hostile;
    fs.writeFileSync(lockPath, body);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    const psCalls = fake.calls.filter((c) => c.file === '/bin/ps');
    const psOpts = { encoding: 'utf8', env: { LC_ALL: 'C', TZ: 'UTC' }, timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 1048576, shell: false };
    expect(message).toContain('it holds the instance lock');
    expect(message).toContain(`(pid ${pid}`);
    expect(message).toContain(lockPath);
    expect(message).not.toContain(hostile);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(body);
    expect(psCalls.length).toBeGreaterThan(0);
    expect(psCalls.map((c) => c.args)).toEqual(psCalls.map(() => ['-o', 'lstart=', '-p', pid]));
    expect(psCalls.every((c) => !c.args[3]?.includes(hostile))).toBe(true);
    expect(psCalls.map((c) => c.opts)).toEqual(psCalls.map(() => psOpts));
  });

  it('7: WHEN darwin and ps stdout is a lstart the parser accepts with year 2020, and the lock holds `String(process.ppid)` written now THEN the throw does not contain `If that process is not snote, remove` and the file bytes are unchanged', () => {
    asDarwin();
    fake.on = true;
    fake.ps = { status: 0, stdout: 'Wed Jan  1 00:00:00 2020\n' };
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    const body = String(process.ppid);
    fs.writeFileSync(lockPath, body);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    expect(message).not.toContain('If that process is not snote, remove');
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(body);
  });

  it('8: WHEN this process already holds the lock, platform is darwin, and ps status is 1 THEN the throw contains `String(process.pid)` and does not contain `If that process is not snote, remove`', () => {
    asDarwin();
    fake.on = true;
    fake.ps = { status: 1, stdout: '' };
    const dir = fresh();
    acquire(dir);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    expect(message).toContain(String(process.pid));
    expect(message).not.toContain('If that process is not snote, remove');
  });

  it('9: WHEN darwin, the lock holds ppid with mtime Mon Jan 5 2026 10:00:00 UTC, and ps answers the lstart Mon Jan  5 11:00:00 2026 THEN acquire does not throw and the file holds String(process.pid)', () => {
    asDarwin();
    fake.on = true;
    fake.ps = { status: 0, stdout: 'Mon Jan  5 11:00:00 2026\n' };
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    fs.writeFileSync(lockPath, String(process.ppid));
    const mtime = new Date(Date.UTC(2026, 0, 5, 10, 0, 0));
    fs.utimesSync(lockPath, mtime, mtime);
    const lock = acquire(dir);
    expect(lock.unlocked).toBeUndefined();
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
  });

  it('10: WHEN darwin, the lock holds ppid with mtime Thu Jan 15 2026 10:00:00 UTC, and ps answers the lstart Thu Jan 15 11:00:00 2026 THEN acquire does not throw and the file holds String(process.pid)', () => {
    asDarwin();
    fake.on = true;
    fake.ps = { status: 0, stdout: 'Thu Jan 15 11:00:00 2026\n' };
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    fs.writeFileSync(lockPath, String(process.ppid));
    const mtime = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));
    fs.utimesSync(lockPath, mtime, mtime);
    const lock = acquire(dir);
    expect(lock.unlocked).toBeUndefined();
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
  });

  it('11: WHEN darwin, flock answers status 1 (held) and ps fails with status 1, and the lock holds ppid THEN the throw contains `it holds the instance lock` and `(pid ` + ppid and does not contain `If that process is not snote, remove`, and the file is unchanged', () => {
    asDarwin();
    fake.on = true;
    fake.answers = [{ status: 1, signal: null }];
    fake.ps = { status: 1, stdout: '' };
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    const body = String(process.ppid);
    fs.writeFileSync(lockPath, body);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    expect(message).toContain('it holds the instance lock');
    expect(message).toContain(`(pid ${body}`);
    expect(message).not.toContain('If that process is not snote, remove');
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(body);
  });

  it('12: WHEN darwin, the lock holds ppid written now and ps fails with status 1 THEN the throw contains `If that process is not snote, remove` and ps was run exactly 1 time', () => {
    asDarwin();
    fake.on = true;
    fake.ps = { status: 1, stdout: '' };
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    const body = String(process.ppid);
    fs.writeFileSync(lockPath, body);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    expect(message).toContain('If that process is not snote, remove');
    expect(fake.calls.filter((c) => c.file === '/bin/ps')).toHaveLength(1);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(body);
  });

  it('13: WHEN darwin, the lock holds String(process.pid) with a last write 3600 s before this process started, and this folder is not held in-process THEN acquire does not throw, the file holds String(process.pid), and /bin/ps was not run', () => {
    asDarwin();
    fake.on = true;
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    fs.writeFileSync(lockPath, String(process.pid));
    const mtime = new Date(Date.now() - process.uptime() * 1000 - 3600000);
    fs.utimesSync(lockPath, mtime, mtime);
    const lock = acquire(dir);
    expect(lock.unlocked).toBeUndefined();
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
    expect(fake.calls.filter((c) => c.file === '/bin/ps')).toHaveLength(0);
  });

  it('14: WHEN darwin, the lock holds String(process.pid) with a last write now, and this folder is not held in-process THEN the throw contains `it holds the instance lock` and does not contain `If that process is not snote, remove`, and the file is unchanged', () => {
    asDarwin();
    fake.on = true;
    const dir = fresh();
    const lockPath = path.join(dir, 'instance.lock');
    const body = String(process.pid);
    fs.writeFileSync(lockPath, body);
    let message = '';
    expect(() => {
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
        throw err;
      }
    }).toThrow(Error);
    expect(message).toContain('it holds the instance lock');
    expect(message).not.toContain('If that process is not snote, remove');
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(body);
  });

  it('15: WHEN darwin and ps status 0 answers a line the parser must reject (Feb 30, trailing text, a localised weekday, minute 60, second 60) THEN for each acquire throws `it holds the instance lock`, the message contains `If that process is not snote, remove`, and the file bytes are unchanged', () => {
    const rows = [
      'Mon Feb 30 11:00:00 2026',
      'Mon Jan  5 11:00:00 2026 extra',
      'lun. Jan  5 11:00:00 2026',
      'Mon Jan  5 10:60:00 2026',
      'Mon Jan  5 10:00:60 2026',
    ];
    const seen: [string, boolean, boolean, string][] = [];
    for (const row of rows) {
      asDarwin();
      fake.on = true;
      fake.ps = { status: 0, stdout: `${row}\n` };
      const dir = fresh();
      const lockPath = path.join(dir, 'instance.lock');
      const body = String(process.ppid);
      fs.writeFileSync(lockPath, body);
      const mtime = new Date(Date.UTC(2026, 0, 5, 10, 0, 0));
      fs.utimesSync(lockPath, mtime, mtime);
      let message = '';
      try {
        acquire(dir);
      } catch (err) {
        message = (err as Error).message;
      }
      seen.push([row, message.includes('it holds the instance lock'), message.includes('If that process is not snote, remove'), fs.readFileSync(lockPath, 'utf8')]);
    }
    expect(seen).toEqual(rows.map((row) => [row, true, true, String(process.ppid)]));
  });
});
