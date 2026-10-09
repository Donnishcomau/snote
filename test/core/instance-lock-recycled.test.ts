/**
 * T440: a recycled pid must not lock the user out. A lock file whose
 * still-alive pid started more than 2000 ms after the file was last written
 * cannot have been written by that process, so it is reclaimed; every other
 * refusal from T303 stays exactly as it was.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
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

// A live pid that never acquired the lock: `setsid` detaches the sleeper so
// it is not our child (spawnSync reaps its own children to zombies, which
// signal 0 still sees as alive). Every test that uses it kills it and
// asserts dead-ness before the rmSync below ever runs, so the sleeper can
// never outlive this file.
function spawnLivePid(): { pid: number; isAlive: () => boolean } {
  const out = spawnSync('sh', ['-c', 'setsid sleep 30 < /dev/null > /dev/null 2>&1 & echo $!'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).stdout.trim();
  const pid = Number(out);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('could not spawn a live pid for the lock test');
  }
  const isAlive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  return { pid, isAlive };
}

function killAndWaitDead(pid: number, isAlive: () => boolean): void {
  // A SIGKILL can land while the sleeper sits stopped (job control under a
  // controlling terminal), where signal 0 still reports it alive; the outer
  // shell is already gone and init reaps the sleeper once it is running
  // again, so KILL + CONT together finish the job.
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
  try {
    process.kill(pid, 'SIGCONT');
  } catch {
    // already gone
  }
  for (let i = 0; i < 60 && isAlive(); i++) {
    spawnSync('sleep', ['0.05']);
  }
}

// Locks acquired here, so the suite always unlinks what it created,
// whatever a test does with the rest of its body.
const held: { release: () => void }[] = [];
afterAll(() => {
  for (const lock of held) lock.release();
});

describe('instance-lock recycled pid', () => {
  it('1: WHEN instance.lock holds a live sleeper\'s pid and its mtime is set 3600 s in the past THEN acquireInstanceLock(dir) does not throw, the file content is `String(process.pid)` and the sleeper is still alive', () => {
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
      killAndWaitDead(sleeper.pid, sleeper.isAlive);
      expect(sleeper.isAlive()).toBe(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2: WHEN instance.lock holds a live sleeper\'s pid written after the sleeper started (mtime now) THEN acquireInstanceLock(dir) throws an Error containing the sleeper\'s pid and the file still holds that pid', () => {
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
      killAndWaitDead(sleeper.pid, sleeper.isAlive);
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
});
