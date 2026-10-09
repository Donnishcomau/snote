import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Per-directory single-instance lock (T303).
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
 * the dead owner's pid (F034), so the lock is stale and gets reclaimed.
 */
const RECLAIM_AFTER_START_MARGIN_MS = 2000;

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
  return started !== null && started - lockMtimeMs > RECLAIM_AFTER_START_MARGIN_MS;
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
export function acquireInstanceLock(dir: string): { release: () => void } {
  const lockPath = join(dir, LOCK_FILE);
  const writeLock = (): void => {
    // 'wx' = O_WRONLY|O_CREAT|O_EXCL: throws EEXIST when the file exists,
    // creates it atomically otherwise.
    const fd = openSync(lockPath, 'wx', 0o600);
    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
  };

  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeLock();
      acquired = true;
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') {
        throw err;
      }
      // Someone's lock is in the way: a live owner (or our own still-held
      // one, which always refuses even when the pid probe is right back at
      // it) blocks the second instance; a stale one — dead pid, leftover
      // file, one whose owner crashed before writing anything, or a live pid
      // that only got the number after the file was last written — is swept
      // and the wx-open retried once.
      const fileOwner = Number.parseInt(readLockPid(lockPath), 10);
      const heldByUs = heldByProcess.has(lockPath);
      const ownerAlive =
        heldByUs || (isPidAlive(fileOwner) && !startedAfterLockWrite(fileOwner, lockMtimeMs(lockPath)));
      if (ownerAlive) {
        const owner = heldByUs ? String(process.pid) : String(fileOwner);
        throw new Error(
          `another snote is already using ${dir} (pid ${owner}) — it holds the instance lock`
        );
      }
      try {
        unlinkSync(lockPath);
      } catch {
        // Already gone (raced with its owner); the retry below decides.
      }
    }
  }
  if (!acquired) {
    // The wx-open lost to another writer twice over: the live owner the
    // probes caught (or just slipped between them) is named when known.
    const owner = readLockPid(lockPath);
    const mtime = lockMtimeMs(lockPath);
    const alive =
      /^\d+$/.test(owner) && isPidAlive(Number(owner)) && !startedAfterLockWrite(Number(owner), mtime);
    throw new Error(
      `another snote is already using ${dir}${alive ? ` (pid ${owner})` : ''} — it holds the instance lock`
    );
  }
  heldByProcess.add(lockPath);

  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      heldByProcess.delete(lockPath);
      try {
        unlinkSync(lockPath);
      } catch {
        // Already gone (e.g. a logout wiped the dir); nothing to release.
      }
    },
  };
}
