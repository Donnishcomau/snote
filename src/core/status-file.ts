import * as fs from 'node:fs';
import * as path from 'node:path';

import noteTitleAndPreview from '@vendor/utils/note-utils';
import { sanitizeForTerminal } from './sanitize';
import { ensureDir, secureUnlink, secureWriteFileSync } from './secure-fs';
import { unsentCount } from './held-unsynced';
import { currentBanner, onBanner, runningIsNewestRelease } from './update-banner';
import { currentUpdate, onUpdate } from './update-signal';
import { secureOpenForRead } from './secure-fs';
import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import type { UpdateSignal } from './update-signal';

/**
 * Non-secret status document published for the bar widget.
 * The widget must never read the data directory (it holds the auth
 * token), so this file carries only: schema version, the count of
 * live notes, the newest live note's title, the last sync time, and
 * the update state (`update`, only while an update signal is active).
 * No token, no note body, no email — no other keys, ever (`alive` is a time).
 */
export interface Status {
  version: 1;
  count: number;
  last: { title: string; modified: number } | null;
  synced: string | null;
  update?: 'available' | 'restart';
  /** The release the update is for, as digits and dots only (#159). Present only with `update`. */
  updateVersion?: string;
  /** Heartbeat: ISO time of the last write while snote runs; it stops when snote stops. Added by the watcher, not buildStatus. */
  alive?: string;
}

const MAX_TITLE_CHARS = 40;

/** #159: the only shape of a release version the bar may show or link to. */
const RELEASE_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/**
 * The note title for the status file: the app's own title derivation,
 * terminal-sanitized, trimmed, and capped at 40 characters (39 plus an
 * ellipsis). Newline/tab folding is layout only and is not a guarded claim.
 * proof: test/core/status-file.test.ts
 */
function statusTitle(note: Note): string {
  let title = sanitizeForTerminal(noteTitleAndPreview(note).title);
  title = title.replace(/[\n\r\t]/g, ' ').trim();
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS - 1) + '…';
  }
  return title;
}

/**
 * Build the non-secret status document from the current state.
 *
 * `count` counts live notes (those with a falsy `deleted`). `last`
 * is the live note with the greatest `modificationDate` (ties broken
 * by the smaller id under `localeCompare`), or `null` when there is
 * no live note. `synced` is passed through untouched ( supplies
 * the ISO-8601 string, or `null`). `update` carries the signal's
 * `kind` and is present ONLY when a signal is given: never
 * `update: undefined`.
 */
export function buildStatus(
  state: State,
  synced: string | null,
  update?: UpdateSignal | null,
  updateVersion?: string | null
): Status {
  const live: [EntityId, Note][] = [];
  for (const [id, note] of state.data.notes) {
    if (!note.deleted) {
      live.push([id, note]);
    }
  }

  live.sort(([idA, a], [idB, b]) => {
    if (a.modificationDate !== b.modificationDate) {
      return b.modificationDate - a.modificationDate;
    }
    return idA.localeCompare(idB);
  });

  const lastEntry = live[0];

  const status: Status = {
    version: 1,
    count: live.length,
    last: lastEntry
      ? {
          title: statusTitle(lastEntry[1]),
          modified: lastEntry[1].modificationDate,
        }
      : null,
    synced,
  };

  if (update) {
    status.update = update.kind;
    if (typeof updateVersion === 'string' && RELEASE_VERSION.test(updateVersion)) {
      status.updateVersion = updateVersion;
    }
  }

  return status;
}

/**
 * Write the status file atomically into `dir`.
 *
 * The directory is created with `ensureDir` (a plain recursive mkdir; NOT
 * `secureMkdir`: that would chmod the plugin's data directory to
 * 0700). The payload lands in `status.json.tmp` via
 * `secureWriteFileSync` (mode 0600) and is renamed over
 * `status.json`, so readers never see a partial file.
 * proof: test/core/status-file.test.ts
 */
export function writeStatusFile(dir: string, status: Status): void {
  ensureDir(dir);
  const filePath = path.join(dir, 'status.json');
  secureWriteFileSync(filePath, JSON.stringify(status) + '\n');
}

/**
 * Where the status file lives: `SNOTE_STATUS_DIR` when set and
 * non-empty; else the bar plugin's data directory,
 * `<XDG_DATA_HOME or <HOME>/.local/share>/omarchy-snote-plugin`.
 * This function only computes the path; it never creates anything.
 */
export function statusDir(env: NodeJS.ProcessEnv): string {
  const override = env.SNOTE_STATUS_DIR;
  if (override) {
    return override;
  }
  const base = env.XDG_DATA_HOME || path.join(env.HOME ?? '', '.local', 'share');
  return path.join(base, 'omarchy-snote-plugin');
}

/**
 * Delete `status.json` and its temp sibling from `dir` (, logout).
 * A missing file is not an error.
 */
export function removeStatusFile(dir: string): void {
  for (const name of ['status.json', 'status.json.tmp']) {
    try {
      secureUnlink(path.join(dir, name));
    } catch {
      // a missing file is fine
    }
  }
}

/**
 * the epoch `alive` a clean quit writes into `status.json`.
 * `Date.parse` of it is 0, so every widget version reads the file as
 * "snote is not running" the moment snote ends, instead of waiting for
 * the 120 s heartbeat rule.
 */
export const STOPPED_ALIVE = '1970-01-01T00:00:00.000Z';

/**
 * Rewrite `status.json` in `dir` at quit: the `update`
 * key is dropped so the bar tooltip stops saying "Update available", and
 * `alive` becomes the epoch so the tooltip says "snote is not running"
 * at once instead of "Synced …" for up to 120 s. The file is read without
 * following a link and rewritten from the Status keys only. Missing, unreadable
 * or malformed files are left untouched (a crash or kill never marks
 * the file: the 120 s heartbeat rule still decides those).
 * proof: test/core/status-file-clear-safety.test.ts
 */
export function clearUpdateStatusFile(dir: string): void {
  let fd: number | undefined;
  try {
    // A link fails to open here, so nothing is read or written.
    fd = secureOpenForRead(path.join(dir, 'status.json'), { nonBlock: true });
    const r: unknown = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      return;
    }
    const o = r as Record<string, unknown>;
    const l = o.last as { title?: unknown; modified?: unknown } | null;
    const clean = {
      version: 1,
      count: typeof o.count === 'number' ? o.count : 0,
      last:
        l && typeof l.title === 'string' && typeof l.modified === 'number'
          ? { title: l.title, modified: l.modified }
          : null,
      synced: typeof o.synced === 'string' ? o.synced : null,
      alive: STOPPED_ALIVE,
    };
    writeStatusFile(dir, clean as unknown as Status);
  } catch {
    /* best-effort: no file, a link, or nothing to clear */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Keep `status.json` in `dir` up to date while the app runs.
 *
 * One write is scheduled at start; after that a single debounced write
 * (default 1000 ms) follows whenever `state.data.notes` changed by
 * reference or the state became "synced" (`simperium.connected` with
 * `pendingCount` 0) after not being synced. The moment it becomes
 * synced, `synced` is set to `new Date(now()).toISOString()` and kept
 * in every later file. Every write carries the current update signal
 *; publishing a new signal schedules a normal debounced write.
 * `stop()` unsubscribes from the store and the update signal, clears
 * the timer and flushes a pending write synchronously.
 */
export function watchStatus(
  store: {
    getState: () => State;
    subscribe: (listener: () => void) => () => void;
  },
  dir: string,
  opts?: { delayMs?: number; now?: () => number; heartbeatMs?: number }
): () => void {
  const delayMs = opts?.delayMs ?? 1000;
  const now = opts?.now ?? Date.now;
  const heartbeatMs = opts?.heartbeatMs ?? 30_000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastNotes: State['data']['notes'] | null = null;
  let lastSynced = false;
  let synced: string | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      // Best-effort: the bar status is optional, so a write that fails
      // (unreadable state, missing directory, read-only disk) is ignored.
      // A running snote that is the newest release never announces `available`
      // (the HEAD check can differ from the release tag): the file loses a stale one.
      const signal = currentUpdate();
      const update = signal !== null && signal.kind === 'available' && runningIsNewestRelease() ? null : signal;
      const version = update === null ? null : update.kind === 'restart' ? update.available : (currentBanner()?.available ?? null);
      const status = buildStatus(store.getState(), synced, update, version);
      status.alive = new Date(now()).toISOString();
      writeStatusFile(dir, status);
    } catch {
      /* best-effort: the bar status is optional */
    }
  };

  const schedule = () => {
    const state = store.getState();
    const notesChanged = state.data.notes !== lastNotes;
    lastNotes = state.data.notes;
    const isSynced = state.simperium.connected && unsentCount(store) === 0;
    const justSynced = isSynced && !lastSynced;
    lastSynced = isSynced;
    if (justSynced) {
      synced = new Date(now()).toISOString();
    }
    if (!notesChanged && !justSynced) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };

  const unsubscribe = store.subscribe(schedule);
  // A published signal is an external event: always schedule the
  // debounced write that carries it.
  const scheduleSignalWrite = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };
  const unsubscribeUpdate = onUpdate(scheduleSignalWrite);
  const unsubscribeBanner = onBanner(scheduleSignalWrite);
  schedule();

  // while snote runs, an idle session still refreshes `alive` (and
  // `synced`, while it is in sync) so the bar can tell "not running" apart.
  const heartbeat = setInterval(() => {
    if (lastSynced) {
      synced = new Date(now()).toISOString();
    }
    flush();
  }, heartbeatMs);
  heartbeat.unref();

  return () => {
    clearInterval(heartbeat);
    unsubscribe();
    unsubscribeUpdate();
    unsubscribeBanner();
    // Flush only a write that is still pending; never write on its own.
    if (timer !== null) {
      flush();
    }
  };
}
