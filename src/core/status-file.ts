import * as fs from 'node:fs';
import * as path from 'node:path';

import noteTitleAndPreview from '@vendor/utils/note-utils';
import { sanitizeForTerminal } from './sanitize';
import { secureWriteFileSync } from './secure-fs';
import { pendingCount } from './simperium-reducer';
import { currentUpdate, onUpdate } from './update-signal';

import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import type { UpdateSignal } from './update-signal';

/**
 * Non-secret status document published for the bar widget (T357).
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
  /** Heartbeat (F134): ISO time of the last write while snote runs; it stops when snote stops. Added by the watcher, not buildStatus. */
  alive?: string;
}

const MAX_TITLE_CHARS = 40;

/**
 * The note title for the status file: the app's own title derivation,
 * terminal-sanitized, with every newline/tab folded to a space,
 * trimmed, and capped at 40 characters (39 plus an ellipsis).
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
 * no live note. `synced` is passed through untouched (T358 supplies
 * the ISO-8601 string, or `null`). `update` carries the signal's
 * `kind` (T388) and is present ONLY when a signal is given: never
 * `update: undefined`.
 */
export function buildStatus(
  state: State,
  synced: string | null,
  update?: UpdateSignal | null
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
  }

  return status;
}

/**
 * Write the status file atomically into `dir`.
 *
 * The directory is created with plain recursive `mkdir` (NOT
 * `secureMkdir`: that would chmod the plugin's data directory to
 * 0700). The payload lands in `status.json.tmp` via
 * `secureWriteFileSync` (mode 0600) and is renamed over
 * `status.json`, so readers never see a partial file.
 */
export function writeStatusFile(dir: string, status: Status): void {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'status.json');
  const tmpPath = filePath + '.tmp';
  secureWriteFileSync(tmpPath, JSON.stringify(status) + '\n');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Where the status file lives (T358): `SNOTE_STATUS_DIR` when set and
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
 * Delete `status.json` and its temp sibling from `dir` (T358, logout).
 * A missing file is not an error.
 */
export function removeStatusFile(dir: string): void {
  for (const name of ['status.json', 'status.json.tmp']) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch {
      // a missing file is fine
    }
  }
}

/**
 * Rewrite `status.json` in `dir` without the `update` key (T417, quit).
 * Quitting clears the on-screen notice, so the bar tooltip must not keep
 * saying "Update available" until snote starts again. Read-modify-write:
 * every other key stays byte-for-byte as written; the `update` key is
 * dropped only when the file is valid JSON that carries it. Missing,
 * unreadable or malformed files are left untouched.
 */
export function clearUpdateStatusFile(dir: string): void {
  try {
    const file = path.join(dir, 'status.json');
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    const record = parsed as Record<string, unknown>;
    if (!('update' in record)) {
      return;
    }
    delete record.update;
    writeStatusFile(dir, record as unknown as Status);
  } catch {
    /* best-effort: no file, or nothing to clear */
  }
}

/**
 * Keep `status.json` in `dir` up to date while the app runs (T358).
 *
 * One write is scheduled at start; after that a single debounced write
 * (default 1000 ms) follows whenever `state.data.notes` changed by
 * reference or the state became "synced" (`simperium.connected` with
 * `pendingCount` 0) after not being synced. The moment it becomes
 * synced, `synced` is set to `new Date(now()).toISOString()` and kept
 * in every later file. Every write carries the current update signal
 * (T388); publishing a new signal schedules a normal debounced write.
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
      const status = buildStatus(store.getState(), synced, currentUpdate());
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
    const isSynced = state.simperium.connected && pendingCount(state.simperium) === 0;
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
  // debounced write that carries it (T388).
  const unsubscribeUpdate = onUpdate(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  });
  schedule();

  // F134: while snote runs, an idle session still refreshes `alive` (and
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
    // Flush only a write that is still pending; never write on its own.
    if (timer !== null) {
      flush();
    }
  };
}
