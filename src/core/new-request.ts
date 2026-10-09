import {
  existsSync,
  watch,
  lstatSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { secureWriteFileSync } from './secure-fs';

/**
 * Cross-process "open a new note" request (T373).
 *
 * The bar's middle-click cannot start a second snote: one process per
 * account folder holds `instance.lock`. Instead of a signal (a reused pid
 * would kill the wrong process), the sender drops a request file the running
 * instance watches for: `<dir>/new-note.request`, written atomically through
 * a temp file with mode 0600.
 *
 * Same-process delivery goes through `emitNewRequest`/`onNewRequest`: a
 * request emitted before the TUI has subscribed is remembered (one pending
 * timestamp) and delivered to the next subscriber while still fresh.
 */

const REQUEST_FILE = 'new-note.request';
const LOCK_FILE = 'instance.lock';

const DEFAULT_STALE_MS = 10_000;
const DEFAULT_POLL_MS = 1_000;

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
 * Ask the snote already holding `dir`'s instance lock to open a new note.
 *
 * Writes `<dir>/new-note.request` (0600, atomic via rename) only when a
 * live process other than ourselves owns the lock; writes nothing
 * otherwise.
 */
export function requestNewNote(dir: string): 'sent' | 'no-instance' {
  const lockPath = join(dir, LOCK_FILE);
  let owner = '';
  try {
    owner = existsSync(lockPath) ? readFileSync(lockPath, 'utf8').trim() : '';
  } catch {
    owner = '';
  }
  if (!/^\d+$/.test(owner)) {
    // Missing lock, or content we cannot parse as a pid.
    return 'no-instance';
  }
  const pid = Number.parseInt(owner, 10);
  if (pid === process.pid || !isPidAlive(pid)) {
    return 'no-instance';
  }

  const requestPath = join(dir, REQUEST_FILE);
  const tmpPath = join(dir, `${REQUEST_FILE}.tmp`);
  secureWriteFileSync(tmpPath, JSON.stringify({ v: 1, t: Date.now() }));
  renameSync(tmpPath, requestPath);
  return 'sent';
}

/**
 * Consume `<dir>/new-note.request` on behalf of the running instance.
 *
 * Runs `onRequest()` for each request file that is not older than
 * `staleMs`; a request that is too old on startup is deleted silently.
 * Consume runs both from `fs.watch` events and a `pollMs` interval
 * (unref'd, so it never keeps the process alive). Deleting the file is the
 * claim: a racer's `unlinkSync` hits ENOENT and ignores it.
 *
 * @returns `stop()`, which closes the watcher and clears the timer.
 */
export function watchNewRequests(
  dir: string,
  onRequest: () => void,
  opts?: { pollMs?: number; staleMs?: number }
): () => void {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const requestPath = join(dir, REQUEST_FILE);

  const mtimeMs = (): number | null => {
    try {
      return lstatSync(requestPath).mtimeMs;
    } catch {
      return null;
    }
  };

  const claim = (): boolean => {
    try {
      unlinkSync(requestPath);
      return true;
    } catch {
      // ENOENT: another consume already claimed this request.
      return false;
    }
  };

  // Sweep a request left over from a dead sender before we start listening.
  const born = mtimeMs();
  if (born !== null && Date.now() - born > staleMs) {
    claim();
  }

  const consume = (): void => {
    const when = mtimeMs();
    if (when === null) {
      return;
    }
    if (!claim()) {
      return;
    }
    if (Date.now() - when > staleMs) {
      return;
    }
    onRequest();
  };

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(dir, (_event, filename) => {
      if (filename === REQUEST_FILE || filename === `${REQUEST_FILE}.tmp`) {
        consume();
      }
    });
  } catch {
    watcher = undefined;
  }

  const timer = setInterval(consume, pollMs);
  timer.unref();

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
    watcher?.close();
  };
}

/** One remembered request emitted while nobody was listening (its mtime). */
let pendingAt: number | null = null;
let listener: (() => void) | null = null;

/**
 * Same-process request: hand it to the current listener, or — with nobody
 * `onNewRequest`. A request is handed out once: an emit with a listener
 * attached and nothing pending calls it, an emit that only queued a request
 * goes to the next subscriber instead.
 */
export function emitNewRequest(): void {
  if (listener) {
    if (pendingAt === null) {
      listener();
    }
  } else {
    pendingAt = Date.now();
  }
}

/**
 * Receive same-process requests. A request emitted while nobody was
 * listening fires `l` once at subscribe time (if younger than 10 s) and is
 * then cleared; that pending request belongs to `l` and is never redelivered
 * to a later subscriber. While a listener is attached, emits go to it
 * directly and never queue a second pending request. A later subscribe
 * replaces the previous listener.
 *
 * @returns unsubscribe, which detaches `l` (later emits go pending again).
 */
export function onNewRequest(l: () => void): () => void {
  listener = l;
  if (pendingAt !== null) {
    const fresh = Date.now() - pendingAt < DEFAULT_STALE_MS;
    pendingAt = null;
    if (fresh) {
      l();
    }
  }
  return () => {
    if (listener === l) {
      listener = null;
    }
  };
}

