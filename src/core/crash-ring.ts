import type { Key } from 'ink';

import type { State } from './store';

export const MAX_KEY_EVENTS = 20;

export type KeyEvent = { input: string; key: Partial<Key> };

export function pushKeyEvent(ring: KeyEvent[], event: KeyEvent): KeyEvent[] {
  const newRing = [...ring, event];
  if (newRing.length > MAX_KEY_EVENTS) {
    return newRing.slice(newRing.length - MAX_KEY_EVENTS);
  }
  return newRing;
}

export type SessionSnapshot = {
  version: string;
  terminal: string;
  noteCount: number;
  noteLengths: number[];
  tagCount: number;
  collectionType: string;
  keys: KeyEvent[];
};

export function sessionSnapshot(
  state: State,
  keys: KeyEvent[],
  term: { columns: number; rows: number; version: string },
): SessionSnapshot {
  const noteLengths: number[] = [];
  state.data.notes.forEach((note) => {
    noteLengths.push((note.content ?? '').length);
  });

  return {
    version: term.version,
    terminal: `${term.columns}x${term.rows}`,
    noteCount: state.data.notes.size,
    noteLengths,
    tagCount: state.data.tags.size,
    collectionType: state.ui.collection.type,
    keys,
  };
}
