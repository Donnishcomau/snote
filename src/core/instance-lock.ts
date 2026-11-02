import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { secureExclusiveCreate, secureOpenForRead, secureUnlink } from './secure-fs';

/**
 * Per-directory single-instance lock.
 *
 * Two snote processes sharing one account dir last-write-wins the ghost and
 * state files (`FileGhostStore.persist` and `saveState` each overwrite the
 * whole file from their own memory), so a stale second process resurrects
 * deleted-forever notes. Upstream prevents that with Electron's
 * `app.requestSingleInstanceLock()`; this is the CLI equivalent: one
 * `<dir>/instance.lock` file holding the owning pid, created atomically with
 * `O_EXCL` (`fs.openSync(path, 'wx')`).
 *
 * A lock whose owning process no longer exists is reclaimed; a lock a live
 * process still holds makes `acquireInstanceLock` throw synchronously with a
 * message naming the pid. A live pid is not proof of an owner, though: when
 * the OS recycles a dead owner's number for an unrelated process, the
 * process start time gives it away (a process cannot have written the file
 * before it existed), so such a lock is reclaimed like a dead one.
 */

const LOCK_FILE = 'instance.lock';

/** #385: why a start runs without the kernel lock, and the notice line for each. */
export type Unlocked = 'missing' | 'refused' | 'timeout';
export const UNLOCKED_NOTICE: Record<Unlocked, string> = {
  missing: 'No kernel lock (flock not installed): two copies started at once may both run.',
  refused: 'No kernel lock (folder may refuse it): two copies started at once may both run.',
  timeout: 'No kernel lock (flock timed out): two copies started at once may both run.',
};

/**
 * Locks this process acquired and never released, keyed by resolved lock
 * file path. The pid file answers "is the owner alive", which a recycled pid
 * can lie about; this registry is what makes the check exact: our own
 * unreleased lock keeps refusing while we live — it is a second snote on the
 * same dir inside this process, and the second writer is exactly the bug —
 * and once the process dies every path in the set goes with it, so a crash
 * or kill -9 leaves nothing but the stale file, which the pid probe reclaims.
 */
const heldByProcess = new Set<string>();

/** True when `pid` names a live process we may signal. */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    // Signal 0 performs the error checks without sending anything:
    // throws ESRCH for a dead pid, succeeds for a live one.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: a live process we simply may not signal.
    return (err as { code?: string }).code === 'EPERM';
  }
}

/**
 * A live pid whose process started more than this many milliseconds after
 * the lock file's last write cannot have written that file: the OS recycled
 * the dead owner's pid, so the lock is stale and gets reclaimed.
 */
const START_MARGIN_MS = 2000;

/** Cached boot time in epoch milliseconds, or null when /proc says nothing. */
let bootTimeMs: number | null | undefined;

function systemBootTimeMs(): number | null {
  if (bootTimeMs === undefined) {
    bootTimeMs = readBootTimeMs();
  }
  return bootTimeMs;
}

function readBootTimeMs(): number | null {
  try {
    for (const line of readFileSync('/proc/stat', 'utf8').split('\n')) {
      if (line.startsWith('btime ')) {
        const seconds = Number.parseInt(line.slice('btime '.length).trim(), 10);
        return Number.isFinite(seconds) ? seconds * 1000 : null;
      }
    }
    return null;
  } catch {
    return null; // no /proc: the start-time rule must not answer at all
  }
}

/**
 * When the process `pid` started, in epoch milliseconds, or null when that
 * cannot be read (no /proc, EACCES, parse failure). Linux: field 22 of
 * `/proc/<pid>/stat` counts clock ticks since boot; fields are counted from
 * after the `)` that closes the command name, which may itself hold spaces.
 */
function processStartMs(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 1).trim().split(/\s+/);
    const ticks = Number.parseInt(fields[19] ?? '', 10); // field 22 overall
    if (!Number.isFinite(ticks)) {
      return null;
    }
    const boot = systemBootTimeMs();
    if (boot === null) {
      return null;
    }
    // CLK_TCK is 100 on every Linux target here (verified with getconf);
    // the POSIX default keeps the math honest without an untyped syscall.
    return boot + (ticks / 100) * 1000;
  } catch {
    return null;
  }
}

/**
 * True when the lock file cannot have been written by its still-alive pid
 * owner: that process started clearly after the last write, so the OS gave
 * a dead owner's pid to an unrelated process. Unknown start times and mtimes
 * keep the caller's answer (alive).
 */
function startedAfterLockWrite(pid: number, lockMtimeMs: number | null): boolean {
  if (lockMtimeMs === null) {
    return false;
  }
  const started = processStartMs(pid);
  return started !== null && started - lockMtimeMs > START_MARGIN_MS;
}

function lockMtimeMs(lockPath: string): number | null {
  try {
    return statSync(lockPath).mtimeMs;
  } catch {
    return null;
  }
}

function readLockPid(lockPath: string): string {
  try {
    return existsSync(lockPath) ? readFileSync(lockPath, 'utf8').trim() : '';
  } catch {
    return '';
  }
}

/**
 * Claim `<dir>/instance.lock` for this process.
 *
 * @returns `release()`, which removes the lock file. Synchronous, and safe
 * to call twice.
 * @throws Error naming the owning pid when a live process still holds it.
 */
export function acquireInstanceLock(dir: string): { release: () => void; unlocked?: Unlocked } {
  const lockPath = join(dir, LOCK_FILE);
  const writeLock = (): void => {
    // exclusive create (O_EXCL): throws EEXIST when the file exists,
    // creates it atomically otherwise.
    // proof: test/core/secure-fs-helpers.test.ts
    secureExclusiveCreate(lockPath, String(process.pid));
  };

  const sweep = `${lockPath}.sweep`;
  const live = (): string => {
    const owner = readLockPid(lockPath);
    const pid = Number.parseInt(owner, 10);
    return heldByProcess.has(lockPath) ? String(process.pid) : isPidAlive(pid) && !startedAfterLockWrite(pid, lockMtimeMs(lockPath)) ? String(pid) : !owner && young(lockPath) ? '?' : '';
  };
  const young = (path: string): boolean => Math.abs(Date.now() - (lockMtimeMs(path) ?? Date.now())) < 2000;
  const rm = (path: string): void => {
    try {
      secureUnlink(path);
    } catch {
      // already gone
    }
  };
  const refuse = (pid: string): never => {
    closeSync(fd);
    throw new Error(`another snote is already using ${dir}${pid ? ` (pid ${pid})` : ''} — it holds the instance lock`);
  };
  // #316: flock(1) locks the open file description of this dir fd, which we keep, so the lock is the kernel's and dies with us
  const fd = secureOpenForRead(`${dir}/.`);
  // #385: 0 locked, 1 held; ENOENT or another status: no kernel lock, said by the caller; a timeout, signal or spawn
  // error reruns only the flock on this same fd, once, with a longer bound
  // proof: test/core/instance-lock-unlocked.test.ts
  let unlocked: Unlocked | undefined;
  for (let retry = 0; ; retry++) {
    const r = spawnSync('/usr/bin/flock', ['-n', '0'], { stdio: [fd, 'ignore', 'ignore'], timeout: retry ? 5000 : 1000, killSignal: 'SIGKILL', maxBuffer: 1048576 });
    const code = (r.error as { code?: string } | undefined)?.code;
    if (r.status === 1) {
      refuse(live());
    }
    unlocked = r.status === 0 ? undefined : code === 'ENOENT' ? 'missing' : !code && typeof r.status === 'number' ? 'refused' : 'timeout';
    if (unlocked !== 'timeout' || retry) {
      break;
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      writeLock();
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') {
        closeSync(fd);
        throw err;
      }
      if (live() || attempt > 1) {
        refuse(live());
      }
      // stale: one sweeper at a time; it re-checks under the marker
      try {
        secureExclusiveCreate(sweep, '');
      } catch {
        if (!young(sweep)) {
          rm(sweep);
        }
        refuse('');
      }
      try {
        if (live()) {
          refuse(live());
        }
        rm(lockPath);
      } finally {
        rm(sweep);
      }
    }
  }
  rm(sweep); // a killed takeover's leftover marker
  heldByProcess.add(lockPath);

  let released = false;
  return {
    unlocked,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      heldByProcess.delete(lockPath);
      rm(lockPath); // already gone (e.g. a logout wiped the dir) is fine
      closeSync(fd);
    },
  };
}
