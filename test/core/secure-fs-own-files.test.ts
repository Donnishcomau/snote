/**
 * #630: secureMkdir closes the folder descriptor it opened also when the chmod
 * on it throws (an odd file system), and still throws that error.
 * #634: a short write makes secureExclusiveCreate
 * remove the file it created, and only that file: when another file has taken
 * the path meanwhile, that file stays. The files are real, on disk; the mock
 * below injects the failing call.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ failChmod: false, swap: '', opened: [] as number[], closed: [] as number[] }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: ((...a: Parameters<typeof actual.openSync>) => {
      const fd = actual.openSync(...a);
      fake.opened.push(fd);
      return fd;
    }) as typeof actual.openSync,
    fchmodSync: ((fd: number, mode: number) => {
      if (fake.failChmod) throw Object.assign(new Error('EPERM: operation not permitted, fchmod'), { code: 'EPERM' });
      actual.fchmodSync(fd, mode);
    }) as typeof actual.fchmodSync,
    closeSync: ((fd: number) => {
      fake.closed.push(fd);
      actual.closeSync(fd);
    }) as typeof actual.closeSync,
    writeSync: ((fd: number, buf: Buffer, off: number, len: number) => {
      if (fake.swap === '') return actual.writeSync(fd, buf, off, len);
      // another start takes the path while this write fails short
      actual.writeFileSync(`${fake.swap}.other`, '424242');
      actual.renameSync(`${fake.swap}.other`, fake.swap);
      return 0;
    }) as typeof actual.writeSync,
  };
});

import { secureExclusiveCreate, secureMkdir } from '../../src/core/secure-fs';

describe('#630 #634 secure-fs closes its descriptor and removes only its own file', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-630-'));
    fake.opened.length = 0;
    fake.closed.length = 0;
  });

  afterEach(() => {
    fake.failChmod = false;
    fake.swap = '';
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN fchmodSync throws EPERM inside secureMkdir THEN secureMkdir throws `EPERM` and the one descriptor it opened was closed exactly once', () => {
    fake.failChmod = true;
    expect(() => secureMkdir(path.join(tmp, 'data'))).toThrow('EPERM');
    expect(fake.opened).toHaveLength(1);
    expect(fake.closed.filter((fd) => fd === fake.opened[0])).toHaveLength(1);
  });

  it('2: WHEN fchmodSync works THEN secureMkdir leaves the folder at mode 0700 and closed its one descriptor exactly once', () => {
    secureMkdir(path.join(tmp, 'data'));
    expect(fs.statSync(path.join(tmp, 'data')).mode & 0o777).toBe(0o700);
    expect(fake.opened).toHaveLength(1);
    expect(fake.closed.filter((fd) => fd === fake.opened[0])).toHaveLength(1);
  });

  it('3: WHEN secureExclusiveCreate of `instance.lock` writes 0 bytes and another file holding `424242` has meanwhile been renamed onto that path THEN it throws `short write`, the path still holds `424242` and its descriptor was closed exactly once', () => {
    const lock = path.join(tmp, 'instance.lock');
    fake.swap = lock;
    expect(() => secureExclusiveCreate(lock, '1234')).toThrow('short write');
    fake.swap = '';
    expect(fs.existsSync(lock)).toBe(true);
    expect(fs.readFileSync(lock, 'utf8')).toBe('424242');
    expect(fake.opened).toHaveLength(1);
    expect(fake.closed.filter((fd) => fd === fake.opened[0])).toHaveLength(1);
  });

  it('4: WHEN secureExclusiveCreate writes 0 bytes and nothing else touched the path THEN it throws `short write` and the path does not exist', () => {
    const lock = path.join(tmp, 'instance.lock');
    fake.swap = path.join(tmp, 'elsewhere');
    expect(() => secureExclusiveCreate(lock, '1234')).toThrow('short write');
    fake.swap = '';
    expect(fs.existsSync(lock)).toBe(false);
  });
});
