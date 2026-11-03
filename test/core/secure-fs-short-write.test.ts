/**
 * #606: secureExclusiveCreate writes the whole text even when the system
 * accepts only part of it per call, and a write that fails short throws and
 * leaves no partly written file. The tests inject the count writeSync returns
 * (the mock below); the files are real, on disk.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ cap: 0, bad: undefined as number | undefined, badAfter: 0, calls: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeSync: ((fd: number, buf: Buffer, off: number, len: number) => {
      fake.calls += 1;
      if (fake.calls > 50) throw new Error('mock: runaway write loop');
      if (fake.bad !== undefined && fake.calls > fake.badAfter) return fake.bad;
      return actual.writeSync(fd, buf, off, Math.min(len, fake.cap > 0 ? fake.cap : len));
    }) as typeof actual.writeSync,
  };
});

import { acquireInstanceLock } from '../../src/core/instance-lock';
import { exportNote } from '../../src/core/export-note';
import { secureExclusiveCreate } from '../../src/core/secure-fs';
import { exportSelectedNote } from '../../src/tui/app-actions';
import type { EntityId, Note, TagName } from '@vendor/types';

const TEXT = 'héllo wörld\n'; // 14 bytes, 12 characters

const mkNote = (content: string): Note =>
  ({
    content,
    tags: [] as TagName[],
    systemTags: [],
    creationDate: 1000,
    modificationDate: 1000,
    deleted: false,
  }) as Note;

let root: string;
beforeEach(() => {
  fake.cap = 0;
  fake.bad = undefined;
  fake.badAfter = 0;
  fake.calls = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-short-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('#606 secureExclusiveCreate short writes', () => {
  it('1: WHEN writeSync accepts only 3 bytes per call THEN the whole multi-byte text is written, the file holds exactly it and the call returns', () => {
    fake.cap = 3;
    const p = path.join(root, 'a.txt');
    secureExclusiveCreate(p, TEXT);
    expect(fs.readFileSync(p).equals(Buffer.from(TEXT, 'utf8'))).toBe(true);
    expect(fake.calls).toBeGreaterThanOrEqual(4);
  });

  it('2: WHEN a write after the first returns 0 or -1 THEN it throws `short write:` and the created file is gone', () => {
    for (const bad of [0, -1]) {
      fake.cap = 3;
      fake.bad = bad;
      fake.badAfter = 1;
      fake.calls = 0;
      const p = path.join(root, `b${bad}.txt`);
      expect(() => secureExclusiveCreate(p, TEXT)).toThrow(/^short write: 3 of 14 bytes written/);
      expect(fs.existsSync(p)).toBe(false);
    }
  });

  it('3: WHEN a file is already at the path THEN it throws EEXIST and leaves the file; WHEN the text is empty THEN an empty file is created without a write', () => {
    const planted = path.join(root, 'keep.txt');
    fs.writeFileSync(planted, 'keep');
    let code: unknown;
    try {
      secureExclusiveCreate(planted, TEXT);
    } catch (e) {
      code = (e as NodeJS.ErrnoException).code;
    }
    expect(code).toBe('EEXIST');
    expect(fs.readFileSync(planted, 'utf8')).toBe('keep');

    const empty = path.join(root, 'empty.txt');
    fake.calls = 0;
    secureExclusiveCreate(empty, '');
    expect(fs.existsSync(empty)).toBe(true);
    expect(fs.statSync(empty).size).toBe(0);
    expect(fake.calls).toBe(0);
  });

  it('4: WHEN the lock is written 1 byte per call THEN instance.lock holds the pid; WHEN the write fails short THEN acquireInstanceLock throws and leaves no lock', () => {
    const d1 = fs.mkdtempSync(path.join(root, 'lock-'));
    fake.cap = 1;
    const lock = acquireInstanceLock(d1);
    try {
      expect(fs.readFileSync(path.join(d1, 'instance.lock'), 'utf8')).toBe(String(process.pid));
    } finally {
      lock.release();
    }

    const d2 = fs.mkdtempSync(path.join(root, 'lock-'));
    fake.cap = 0;
    fake.bad = 0;
    fake.badAfter = 0;
    fake.calls = 0;
    expect(() => acquireInstanceLock(d2)).toThrow(/short write/);
    expect(fs.existsSync(path.join(d2, 'instance.lock'))).toBe(false);

    fake.bad = undefined;
    fake.calls = 0;
    const again = acquireInstanceLock(d2);
    again.release();
  });

  it('5: WHEN an export write fails short THEN exportNote rejects, the folder is empty and exportSelectedNote shows `export failed:` and never `exported:`', async () => {
    const dir = fs.mkdtempSync(path.join(root, 'out-'));
    const note = mkNote('héllo wörld');
    fake.cap = 3;
    fake.bad = 0;
    fake.badAfter = 1;
    await expect(exportNote(note, dir)).rejects.toThrow(/short write/);
    expect(fs.readdirSync(dir)).toEqual([]);

    fake.calls = 0;
    const ctx = {
      selectedEntry: { id: 'n1' as EntityId, note },
      value: path.join(dir, 'x.md'),
      setNotice: vi.fn(),
      setNoticeError: vi.fn(),
    };
    exportSelectedNote(ctx);
    await vi.waitFor(() => expect(ctx.setNoticeError).toHaveBeenCalledTimes(1));
    const msg = ctx.setNoticeError.mock.calls[0]?.[0] as string;
    expect(msg.startsWith('export failed:')).toBe(true);
    expect(msg).toContain('short write');
    expect(ctx.setNotice).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
