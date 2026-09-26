/**
 * T303: per-account-dir single-instance lock.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireInstanceLock } from '../../src/core/instance-lock';

// A live pid that never acquired the lock: `setsid` detaches the sleeper so
// it is not our child (spawnSync reaps its own children to zombies, which
// signal 0 still sees as alive). Row 5 kills it and asserts dead-ness before
// the rmSync below ever runs, so the sleeper can never outlive this file.
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

// Locks acquired here, so the suite always unlinks what it created,
// whatever a test does with the rest of its body.
const held: { release: () => void }[] = [];
afterAll(() => {
  for (const lock of held) lock.release();
});

describe('instance-lock', () => {
  it('1: WHEN acquireInstanceLock(dir) runs on an empty dir THEN <dir>/instance.lock exists and its content is String(process.pid)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t303-'));
    try {
      const lock = acquireInstanceLock(dir);
      held.push(lock);
      const lockPath = join(dir, 'instance.lock');
      expect(existsSync(lockPath)).toBe(true);
      expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2: WHEN acquireInstanceLock(dir) has already succeeded once and is called again on the same dir without releasing THEN it throws an Error whose message contains String(process.pid)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t303-'));
    try {
      const first = acquireInstanceLock(dir);
      held.push(first);
      expect(() => acquireInstanceLock(dir)).toThrow(Error);
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

  it('3: WHEN the first lock\'s returned release() is called and acquireInstanceLock(dir) is called again on the same dir THEN it does not throw and <dir>/instance.lock still exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t303-'));
    try {
      const first = acquireInstanceLock(dir);
      first.release();
      const second = acquireInstanceLock(dir);
      held.push(second);
      expect(existsSync(join(dir, 'instance.lock'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4: WHEN <dir>/instance.lock is pre-written with the text `999999999` (a pid that is not alive) and acquireInstanceLock(dir) is called THEN it does not throw and <dir>/instance.lock\'s content is String(process.pid)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snote-t303-'));
    try {
      const lockPath = join(dir, 'instance.lock');
      writeFileSync(lockPath, '999999999');
      const lock = acquireInstanceLock(dir);
      held.push(lock);
      expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5: WHEN <dir>/instance.lock holds the pid of a live process that never acquired the lock and acquireInstanceLock(dir) is called THEN it throws an Error naming that pid', () => {
    // Row 4 proves a dead pid is reclaimed; row 5 proves the other side of
    // the same rule — a live pid blocks acquisition and is named in the
    // error — and ends with the same pid reclaimed once the holder dies.
    // The sleeper is killed and its dead-ness asserted before the rmSync
    // below ever runs, so it can never outlive this file.
    const dir = mkdtempSync(join(tmpdir(), 'snote-t303-'));
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
      // The lock file survives the refusal, still naming the holder.
      expect(readFileSync(lockPath, 'utf8')).toBe(String(sleeper.pid));
      // Once the holder is dead its pid is stale: a fresh acquire reclaims
      // it. Done here, before the finally block's cleanup ever runs.
      try {
        process.kill(sleeper.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      for (let i = 0; i < 60 && sleeper.isAlive(); i++) {
        spawnSync('sleep', ['0.05']);
      }
      expect(sleeper.isAlive()).toBe(false);
      const reclaimed = acquireInstanceLock(dir);
      try {
        expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid));
      } finally {
        reclaimed.release();
      }
    } finally {
      // A SIGKILL can land while the sleeper sits stopped (job control under
      // a controlling terminal), where signal 0 still reports it alive; the
      // outer shell is already gone and init reaps the sleeper once it is
      // running again, so KILL + CONT together finish the job.
      try {
        process.kill(sleeper.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      try {
        process.kill(sleeper.pid, 'SIGCONT');
      } catch {
        // already gone
      }
      for (let i = 0; i < 60 && sleeper.isAlive(); i++) {
        spawnSync('sleep', ['0.05']);
      }
      expect(sleeper.isAlive()).toBe(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
