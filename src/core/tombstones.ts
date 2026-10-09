import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import type { EntityId } from '@vendor/types';
import { problemText, publishProblem } from './problem-signal';
import { secureMkdir, secureWriteFileSync } from './secure-fs';
import { saveState } from './persistence';
import type { State } from './store';

const TOMBSTONE_FILE = 'tombstones.json';

interface GhostVersions {
  get(id: string): Promise<{ version?: number }>;
}

export function loadTombstones(dir: string): string[] {
  const filePath = path.join(dir, TOMBSTONE_FILE);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    for (const item of parsed) {
      if (typeof item !== 'string') {
        return [];
      }
    }
    return parsed as string[];
  } catch {
    return [];
  }
}

export function saveTombstones(dir: string, ids: string[]): void {
  const filePath = path.join(dir, TOMBSTONE_FILE);
  const tmpPath = filePath + '.tmp';

  secureMkdir(dir);
  secureWriteFileSync(tmpPath, JSON.stringify(ids));
  fs.renameSync(tmpPath, filePath);
}

export function addTombstone(dir: string, id: string): void {
  const list = loadTombstones(dir);
  if (!list.includes(id)) {
    list.push(id);
  }
  saveTombstones(dir, list);
}

export async function tombstonesToResend(
  ids: string[],
  ghosts: GhostVersions
): Promise<string[]> {
  const result: string[] = [];
  for (const id of ids) {
    const info = await ghosts.get(id);
    if (info.version && info.version > 0) {
      result.push(id);
    }
  }
  return result;
}

export async function resendDeletions(
  store: Store<State, A.ActionType>,
  dir: string,
  ghosts: GhostVersions
): Promise<string[]> {
  const ids = loadTombstones(dir);

  if (ids.length === 0) {
    return [];
  }

  const keep = await tombstonesToResend(ids, ghosts);
  saveTombstones(dir, keep);

  for (const id of keep) {
    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: id } as A.ActionType);
  }

  return keep;
}

export function trackDeletions(
  store: Store<State, A.ActionType>,
  dir: string
): void {
  const originalDispatch = store.dispatch;

  store.dispatch = ((action: A.ActionType): A.ActionType => {
    if (action.type === 'DELETE_NOTE_FOREVER') {
      addTombstone(dir, (action as { noteId: string }).noteId);
    }
    return originalDispatch(action);
  }) as typeof store.dispatch;
}

/**
 * T488 — drop notes that a tombstone says were deleted forever.
 *
 * A "delete forever" removes the note from the server and the ghost file at
 * once, but state.json is only written 500 ms later. Killed inside that
 * window, the restart would load the stale state.json and re-create the note
 * on the server. Called while LOADING, before `resendDeletions` and
 * `requeueUnsynced` run, this removes every tombstoned note from the loaded
 * state; when anything was dropped the pruned state is written at once, so a
 * second kill cannot bring the note back either.
 *
 * With no tombstones, no match, or no state, the input comes back unchanged
 * and nothing is written.
 */
export function dropTombstonedNotes(
  dir: string,
  loaded: Partial<State> | undefined
): Partial<State> | undefined {
  const ids = loadTombstones(dir);
  const notes = loaded?.data?.notes;

  if (!loaded || !notes || !ids.some((id) => notes.has(id as EntityId))) {
    return loaded;
  }

  const kept = new Map(notes);
  for (const id of ids) {
    kept.delete(id as EntityId);
  }

  const next = {
    ...loaded,
    data: { ...loaded.data, notes: kept },
  } as Partial<State>;

  try {
    saveState(next as State, dir);
  } catch (err) {
    // T494 — a state.json that cannot be written (an EISDIR on the temp
    // file) must not stop snote from starting: show it on the notice line
    // like every other save failure does and carry on with the pruned
    // state in memory.
    publishProblem(problemText('could not save notes', err));
  }
  return next;
}
