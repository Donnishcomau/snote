/**
 * a recycled pid must not lock the user out. A lock file whose
 * still-alive pid started more than 2000 ms after the file was last written
 * cannot have been written by that process, so it is reclaimed; every other
 * refusal from stays exactly as it was.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireInstanceLock } from '../../src/core/instance-lock';

// A live pid that never acquired the lock: a detached /bin/sleep is alive for
// signal 0. Every test that uses it kills it and waits for the child exit
// event before the rmSync below ever runs, so the sleeper can never outlive
// this file.
function spawnLivePid(): { pid: number; isAlive: () => boolean; dead: Promise<void> } {
  const child = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' });
  const pid = child.pid ?? 0;
  const dead = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('could not spawn a live pid for the lock test');
  }
  const isAlive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as { code?: string }).code === 'EPERM';
    }
  };
  if (!isAlive()) {
    throw new Error('sleeper is not alive for signal 0');
  }
  return { pid, isAlive, dead };
}

async function killAndWaitDead(sleeper: { pid: number; isAlive: () => boolean; dead: Promise<void> }): Promise<void> {
  if (!sleeper.isAlive()) {
    throw new Error('sleeper is not alive for signal 0');
  }
  try {
    process.kill(sleeper.pid, 'SIGKILL');
  } catch {
    // already gone
  }
  await sleeper.dead;
}

// Locks acquired here, so the suite always unlinks what it created,
// whatever a test does with the rest of its body.
const held: { release: () => void }[] = [];
afterAll(() => {
  for (const lock of held) lock.release();
});

describe('instance-lock recycled pid', () => {
  it('1: WHEN instance.lock holds a live sleeper\'s pid and its mtime is set 3600 s in the past THEN acquireInstanceLock(dir) does not throw, the file content is `String(process.pid)` and the sleeper is still alive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    const lockPath = join(dir, 'instance.lock');
    const sleeper = spawnLivePid();
    try {
      writeFileSync(lockPath, String(sleeper.pid));
      const past = Date.now() / 1000 - 3600;
      utimesSync(lockPath, past, past);
      const lock = acquireInstanceLock(dir);
      try {
        expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
        expect(sleeper.isAlive()).toBe(true);
      } finally {
        lock.release();
      }
    } finally {
      await killAndWaitDead(sleeper);
      expect(sleeper.isAlive()).toBe(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2: WHEN instance.lock holds a live sleeper\'s pid written after the sleeper started (mtime now) THEN acquireInstanceLock(dir) throws an Error containing the sleeper\'s pid and the file still holds that pid', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    const lockPath = join(dir, 'instance.lock');
    const sleeper = spawnLivePid();
    try {
      writeFileSync(lockPath, String(sleeper.pid));
      expect(() => acquireInstanceLock(dir)).toThrow(Error);
      let message = '';
      try {
        acquireInstanceLock(dir);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(String(sleeper.pid));
      expect(readFileSync(lockPath, 'utf8')).toBe(String(sleeper.pid));
    } finally {
      await killAndWaitDead(sleeper);
      expect(sleeper.isAlive()).toBe(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3: WHEN this process acquired the lock, then the file\'s mtime is set 3600 s in the past and acquireInstanceLock(dir) is called again THEN it throws an Error containing `String(process.pid)`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    try {
      const first = acquireInstanceLock(dir);
      held.push(first);
      const lockPath = join(dir, 'instance.lock');
      const past = Date.now() / 1000 - 3600;
      utimesSync(lockPath, past, past);
      let message = '';
      try {
        acquireInstanceLock(dir);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(String(process.pid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4: WHEN instance.lock holds `1` (init, alive since boot) with mtime now THEN acquireInstanceLock(dir) throws and the file still holds `1`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    const lockPath = join(dir, 'instance.lock');
    try {
      writeFileSync(lockPath, '1');
      expect(() => acquireInstanceLock(dir)).toThrow(Error);
      expect(readFileSync(lockPath, 'utf8')).toBe('1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5: WHEN the lock mtime is now and the sleeper is alive THEN acquireInstanceLock(dir) throws and the message does not contain `If that process is not snote, remove`', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    const lockPath = join(dir, 'instance.lock');
    const sleeper = spawnLivePid();
    try {
      writeFileSync(lockPath, String(sleeper.pid));
      expect(sleeper.isAlive()).toBe(true);
      let message = '';
      expect(() => {
        try {
          acquireInstanceLock(dir);
        } catch (err) {
          message = (err as Error).message;
          throw err;
        }
      }).toThrow(Error);
      expect(message).not.toContain('If that process is not snote, remove');
    } finally {
      await killAndWaitDead(sleeper);
      expect(sleeper.isAlive()).toBe(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('6: WHEN this process holds the lock THEN the throw does not contain `If that process is not snote, remove`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t440-'));
    try {
      const first = acquireInstanceLock(dir);
      held.push(first);
      let message = '';
      expect(() => {
        try {
          acquireInstanceLock(dir);
        } catch (err) {
          message = (err as Error).message;
          throw err;
        }
      }).toThrow(Error);
      expect(message).toContain(String(process.pid));
      expect(message).not.toContain('If that process is not snote, remove');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
