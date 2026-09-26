import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import { secureMkdir, secureWriteFileSync } from './secure-fs';
import type { State } from './store';

const TOMBSTONE_FILE = 'tombstones.json';

export interface GhostVersions {
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
