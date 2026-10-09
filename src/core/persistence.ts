import * as fs from 'node:fs';
import * as path from 'node:path';

import { problemText, publishProblem } from './problem-signal';
import { secureMkdir, secureWriteFileSync } from './secure-fs';
import type { State } from './store';

/**
 * Encoded representation of the data slice (Maps and Sets serialised as JSON).
 */
interface EncodedData {
  [key: string]: unknown;
}

/**
 * On-disk file format.
 */
interface StateFile {
  version: number;
  data: EncodedData;
}

/**
 * Reviver for JSON.parse that converts encoded Maps and Sets back.
 */
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('__map' in value) {
      const entries = (value as { __map: [string, unknown][] }).__map;
      const map = new Map<string, unknown>();
      for (const [k, v] of entries) {
        map.set(k, reviver('', v));
      }
      return map;
    }
    if ('__set' in value) {
      return new Set((value as { __set: unknown[] }).__set);
    }
  }
  return value;
}

/**
 * Replacer for JSON.stringify that encodes Maps and Sets.
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    const entries: [string, unknown][] = [];
    value.forEach((v, k) => {
      // Convert keys to strings for JSON compatibility
      entries.push([String(k), v]);
    });
    return { __map: entries };
  }
  if (value instanceof Set) {
    return { __set: [...value] };
  }
  return value;
}

/**
 * Save the data slice to disk as JSON.
 * Only saves `state.data` minus `noteRevisions` (which is rebuilt from sync).
 *
 * @param state - The current Redux state
 * @param dir   - Directory to write to
 */
export function saveState(state: State, dir: string): void {
  const data = state.data;
  const toSave: EncodedData = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip noteRevisions - it's rebuilt from sync
    if (key === 'noteRevisions') {
      continue;
    }
    toSave[key] = value;
  }

  const file: StateFile = { version: 1, data: toSave };
  const filePath = path.join(dir, 'state.json');
  const tmpPath = filePath + '.tmp';

  secureMkdir(dir);
  secureWriteFileSync(tmpPath, JSON.stringify(file, replacer));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load the data slice from disk.
 *
 * @param dir - Directory to read from
 * @returns Decoded partial state, or undefined if file is missing/invalid
 */
export function loadState(dir: string): Partial<State> | undefined {
  const filePath = path.join(dir, 'state.json');

  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }

  let file: StateFile;
  try {
    file = JSON.parse(raw) as StateFile;
  } catch {
    return undefined;
  }

  if (file.version !== 1) {
    return undefined;
  }

  // Reconstruct the data slice with Maps and Sets revived
  const revivedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file.data)) {
    revivedData[key] = reviver(key, value);
  }

  return { data: revivedData as unknown as State['data'] } as unknown as Partial<State>;
}

/**
 * Subscribe to the store and persist changes with trailing debounce.
 *
 * @param store     - The Redux store
 * @param dir       - Directory to write to
 * @param delayMs   - Debounce delay in milliseconds (default 500)
 * @returns An unsubscribe function that also flushes the current state
 */
export function persistOnChange(
  store: {
    getState: () => State;
    subscribe: (listener: () => void) => () => void;
  },
  dir: string,
  delayMs: number = 500
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: State | null = null;

  const flush = () => {
    if (lastState) {
      try {
        // A failed write (EACCES, ENOSPC, EISDIR) must not crash the app
        // through the timer: show it on the notice line instead and keep
        // the pending state so the next save tries again.
        saveState(lastState, dir);
        lastState = null;
      } catch (err) {
        publishProblem(problemText('could not save notes', err));
      }
    }
    timer = null;
  };

  const schedule = () => {
    const state = store.getState();
    // Only persist when state.data changed by reference
    if (lastState && lastState.data === state.data) {
      return;
    }
    lastState = state;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };

  const unsubscribe = store.subscribe(schedule);

  // Also flush on unsubscribe
  const unsubscribeAndFlush = () => {
    unsubscribe();
    flush();
  };

  return unsubscribeAndFlush;
}
