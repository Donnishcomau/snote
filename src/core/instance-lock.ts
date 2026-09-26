import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
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
 * message naming the pid.
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
    const fd = openSync(lockPath, 'wx');
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
      // one, whose pid file a recycled pid could misreport as dead) refuses
      // the second instance; a stale one — dead pid, leftover file, or one
      // whose owner crashed before writing anything — is swept and the
      // wx-open retried once.
      const fileOwner = Number.parseInt(readLockPid(lockPath), 10);
      const ownerAlive = heldByProcess.has(lockPath) || isPidAlive(fileOwner);
      if (ownerAlive) {
        const owner = heldByProcess.has(lockPath) ? String(process.pid) : String(fileOwner);
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
    const alive = /^\d+$/.test(owner) && isPidAlive(Number(owner));
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
