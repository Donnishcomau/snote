import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EntityId } from '@vendor/types';

import { saveState } from './persistence';
import { secureMkdir, secureWriteFileSync } from './secure-fs';
import type { State } from './store';

const UNSYNCED_FILE = 'unsynced.json';
const UNSYNCED_NOTES_FILE = 'unsynced-notes.json';

// #336a: the pending notes themselves (a write costs the pending count, not the library). proof: test/core/unsynced-notes.test.ts
export type UnsyncedNotes = Record<string, { modificationDate?: number | string }>;

/**
 * the record of local changes the server has not confirmed:
 * noteId → the modificationDate the note had when the change went out.
 * `saveState` only ever writes `state.data`, and the sync engine's
 * `pendingNotes` lives in memory, so without this file a restart cannot
 * tell an unconfirmed local edit from a stale copy of a confirmed one:
 * both are a state.json note older than a newer ghost.
 */
export type UnsyncedRecord = Record<string, number>;

/**
 * Read the record from disk. A missing or corrupt file is an empty record.
 */
export function loadUnsynced(dir: string): UnsyncedRecord {
  const filePath = path.join(dir, UNSYNCED_FILE);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const record: UnsyncedRecord = {};
    for (const [id, date] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof date !== 'number' || !Number.isFinite(date)) {
        return {};
      }
      record[id] = date;
    }
    return record;
  } catch {
    return {};
  }
}

export function loadUnsyncedNotes(dir: string): UnsyncedNotes {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, UNSYNCED_NOTES_FILE), 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof (v as { content?: unknown } | null)?.content === 'string' && Number.isFinite(Number((v as { modificationDate?: unknown }).modificationDate)) && (v as { modificationDate?: unknown }).modificationDate !== '' && (v as { modificationDate?: unknown }).modificationDate !== null)) as UnsyncedNotes) : {}; // only entries with string content and a finite date
  } catch {
    return {};
  }
}

// Lay each saved copy (unrecorded, or not older than the record: a kill can fall between the two writes) over an older or missing state.json copy; `preloaded` itself when nothing changes.
export function overlayUnsyncedNotes<T extends { data?: { notes?: Map<EntityId, unknown> } }>(
  preloaded: T | undefined,
  record: UnsyncedRecord,
  saved: UnsyncedNotes
): T | undefined {
  const notes = preloaded?.data?.notes;
  if (!preloaded || !notes) {
    return preloaded;
  }
  let next: Map<EntityId, unknown> | undefined;
  for (const [id, note] of Object.entries(saved)) {
    const recorded = record[id];
    const date = Number(note?.modificationDate);
    if (recorded !== undefined && date < Number(recorded)) {
      continue;
    }
    const have = notes.get(id as EntityId) as { modificationDate?: number | string } | undefined;
    if (have !== undefined && Number(have.modificationDate) >= date) {
      continue;
    }
    next ??= new Map(notes);
    next.set(id as EntityId, note);
  }
  return next ? { ...preloaded, data: { ...preloaded.data, notes: next } } : preloaded;
}

const writeJson = (dir: string, name: string, value: unknown): void => {
  const filePath = path.join(dir, name);
  try {
    secureMkdir(dir);
    secureWriteFileSync(filePath, JSON.stringify(value));
  } catch {
    // A failed write (EACCES, ENOSPC, EISDIR) must not crash the app;
    // the record is a safety net, the notes themselves live in state.json.
  }
};

/**
 * Snapshot the pending ids with each note's current modificationDate.
 * A note no longer in the store has no entry (undefined).
 */
const snapshot = (state: State): Map<string, number | undefined> => {
  const found = new Map<string, number | undefined>();
  for (const id of Object.keys(state.simperium.pendingNotes)) {
    found.set(id, state.data.notes.get(id as EntityId)?.modificationDate);
  }
  return found;
};

const recordEquals = (a: UnsyncedRecord, b: UnsyncedRecord): boolean => {
  const aIds = Object.keys(a);
  if (aIds.length !== Object.keys(b).length) {
    return false;
  }
  return aIds.every((id) => Object.prototype.hasOwnProperty.call(b, id) && a[id] === b[id]);
};

/** The tracker `trackUnsynced` returns: `stop` unsubscribes; `settle` runs once the start-up re-send is over. */
export interface UnsyncedTracker {
  stop: () => void;
  /**
   * Drop carried entries that never went pending while the start-up
   * re-send ran: the re-send found those notes equal to their ghost.
   */
  settle: () => void;
}

/**
 * Keep `unsynced.json` — local changes the server has not confirmed —
 * current while the app runs. It starts as the file loaded at start-up;
 * an entry loaded from it stays until it was pending this session and has
 * left `pendingNotes` (the server confirmed it), the note is no longer in
 * `state.data.notes`, or `settle` finds it not pending once the start-up
 * re-send has finished. A note held back while offline (it differs from
 * its ghost but is not in `pendingNotes` yet) never loses its entry to
 * another note going pending. Current pending ids are recorded too, at
 * the date each note carries now. The file is rewritten at once when the
 * record changes, never by the 500 ms state.json save.
 */
export function trackUnsynced(
  store: {
    getState: () => State;
    subscribe: (listener: () => void) => () => void;
  },
  dir: string,
  stateBroken = false
): UnsyncedTracker {
  let stateGood = !stateBroken;
  let lastNotes = store.getState().data.notes;
  let carried: UnsyncedRecord = loadUnsynced(dir);
  let written: UnsyncedRecord = { ...carried };
  let savedNotes: UnsyncedNotes = loadUnsyncedNotes(dir);
  // Carried ids seen in `pendingNotes` this session: leaving it confirmed.
  const seenPending = new Set<string>();

  const build = (snap: Map<string, number | undefined>): UnsyncedRecord => {
    const next: UnsyncedRecord = {};
    for (const [id, date] of Object.entries(carried)) {
      if (snap.has(id)) {
        seenPending.add(id);
        next[id] = snap.get(id);
      } else if (
        !seenPending.has(id) &&
        store.getState().data.notes.has(id as EntityId)
      ) {
        next[id] = date;
      }
    }
    for (const [id, date] of snap) {
      if (date !== undefined) {
        next[id] = date;
      }
    }
    return next;
  };

  const onStoreChange = () => {
    const prevNotes = lastNotes;
    lastNotes = store.getState().data.notes;
    const next = build(snapshot(store.getState()));
    if (recordEquals(next, written)) {
      return;
    }
    written = next;
    //, #336a: the pending notes go to unsynced-notes.json before the record (a kill inside the 500 ms save window keeps them). proof: test/core/unsynced-notes.test.ts
    const notesNow = store.getState().data.notes;
    const keep: UnsyncedNotes = {};
    for (const [id, date] of Object.entries(written)) {
      const note = notesNow.get(id as EntityId);
      if (note !== undefined && Number(note.modificationDate) === date) {
        keep[id] = note;
      } else if (savedNotes[id] !== undefined && Number(savedNotes[id].modificationDate) === date) {
        keep[id] = savedNotes[id];
      }
    }
    savedNotes = keep;
    // a full save while state.json is missing or was not loadable, and when a pending note's date goes back (a history restore keeps the revision's older date)
    const back = Object.keys(written).some((id) => Number(notesNow.get(id as EntityId)?.modificationDate) < Number(prevNotes.get(id as EntityId)?.modificationDate));
    if (!stateGood || back || !fs.existsSync(path.join(dir, 'state.json'))) {
      try {
        saveState(store.getState(), dir);
        stateGood = true;
      } catch {
        // the debounced saver retries
      }
    }
    writeJson(dir, UNSYNCED_NOTES_FILE, savedNotes);
    writeJson(dir, UNSYNCED_FILE, written);
  };

  const unsubscribe = store.subscribe(onStoreChange);

  const settle = () => {
    const pending = new Set(snapshot(store.getState()).keys());
    for (const id of Object.keys(carried)) {
      if (!pending.has(id)) {
        delete carried[id];
      }
    }
    onStoreChange();
  };

  return { stop: unsubscribe, settle };
}

/**
 * True when the note as the store holds it IS the unconfirmed change the
 * record speaks of: its id is present and the note still carries exactly
 * the recorded modificationDate. A confirmed edit whose state.json copy
 * was never updated carries an older date, so it is not mistaken for an
 * unconfirmed change and the ghost adoption stays correct.
 */
export function isUnsyncedCopy(
  record: UnsyncedRecord,
  id: string,
  note: { modificationDate?: number | string }
): boolean {
  const recorded = record[id];
  return (
    recorded !== undefined && Number(note?.modificationDate) === Number(recorded)
  );
}
