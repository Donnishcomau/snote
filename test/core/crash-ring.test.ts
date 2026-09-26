import { describe, expect, it } from 'vitest';

import { makeStore } from '../../src/core/store';
import {
  MAX_KEY_EVENTS,
  pushKeyEvent,
  sessionSnapshot,
  type KeyEvent,
} from '../../src/core/crash-ring';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

function makeTestStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n1'),
    note: { content: 'Hello', systemTags: [], tags: [], deleted: false, modificationDate: Date.now(), creationDate: Date.now() },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n2'),
    note: { content: 'Hi there', systemTags: [], tags: [], deleted: false, modificationDate: Date.now(), creationDate: Date.now() },
  });
  store.dispatch({ type: 'ADD_NOTE_TAG' as const, noteId: eid('n1'), tagName: 'work' as any });
  store.dispatch({ type: 'OPEN_TAG', tagName: 'work' as any });
  return store;
}

describe('crash-ring', () => {
  it('1: WHEN pushKeyEvent([], { input: j, key: {} }) is called THEN the result has length 1 and result[0].input is j', () => {
    const result = pushKeyEvent([], { input: 'j', key: {} });
    expect(result.length).toBe(1);
    expect(result[0].input).toBe('j');
  });

  it('2: WHEN pushKeyEvent is folded 25 times with input String(i) for i 0 to 24 (key: {} each time), keeping the array returned after the 1st push as firstRing THEN the final ring has length 20, ring[0].input is 5, ring[19].input is 24, and firstRing is still length 1', () => {
    let ring: KeyEvent[] = [];
    let firstRing: KeyEvent[] | undefined;
    for (let i = 0; i < 25; i++) {
      ring = pushKeyEvent(ring, { input: String(i), key: {} });
      if (i === 0) firstRing = ring;
    }
    expect(ring.length).toBe(20);
    expect(ring[0].input).toBe('5');
    expect(ring[19].input).toBe('24');
    expect(firstRing!.length).toBe(1);
  });

  it('3: WHEN sessionSnapshot is called on a store seeded with note n1 content Hello and note n2 content Hi there, tag work added via ADD_NOTE_TAG, collection opened to work via OPEN_TAG, keys [{input:j,key:{}},{input:,key:{return:true}}], term {columns:100,rows:30,version:0.0.1} THEN noteCount is 2, noteLengths is [5, 8], tagCount is 1, collectionType is tag, terminal is 100x30, version is 0.0.1, and keys has length 2', () => {
    const store = makeTestStore();
    const state = store.getState();
    const keys: KeyEvent[] = [
      { input: 'j', key: {} },
      { input: '', key: { return: true } },
    ];
    const term = { columns: 100, rows: 30, version: '0.0.1' };
    const result = sessionSnapshot(state, keys, term);
    expect(result.noteCount).toBe(2);
    expect(result.noteLengths).toEqual([5, 8]);
    expect(result.tagCount).toBe(1);
    expect(result.collectionType).toBe('tag');
    expect(result.terminal).toBe('100x30');
    expect(result.version).toBe('0.0.1');
    expect(result.keys.length).toBe(2);
  });

  it('4: WHEN the same call as line 3 is made THEN JSON.stringify(result) does not contain Hello, does not contain Hi there, and does not contain work', () => {
    const store = makeTestStore();
    const state = store.getState();
    const keys: KeyEvent[] = [
      { input: 'j', key: {} },
      { input: '', key: { return: true } },
    ];
    const term = { columns: 100, rows: 30, version: '0.0.1' };
    const result = sessionSnapshot(state, keys, term);
    const json = JSON.stringify(result);
    expect(json).not.toContain('Hello');
    expect(json).not.toContain('Hi there');
    expect(json).not.toContain('work');
  });

  it('5: WHEN sessionSnapshot is called on a fresh makeStore({ stubClient: {} }) with no dispatches, keys [], the same term THEN noteCount is 0, noteLengths is [], tagCount is 0, and collectionType is all', () => {
    const store = makeStore({ stubClient: {} });
    const state = store.getState();
    const keys: KeyEvent[] = [];
    const term = { columns: 100, rows: 30, version: '0.0.1' };
    const result = sessionSnapshot(state, keys, term);
    expect(result.noteCount).toBe(0);
    expect(result.noteLengths).toEqual([]);
    expect(result.tagCount).toBe(0);
    expect(result.collectionType).toBe('all');
  });

  it('6: WHEN sessionSnapshot is given keys [{input:j,key:{}},{input:,key:{return:true}}] THEN result.keys.map(k => k.input) is [j, ] in that exact order', () => {
    const store = makeStore({ stubClient: {} });
    const state = store.getState();
    const keys: KeyEvent[] = [
      { input: 'j', key: {} },
      { input: '', key: { return: true } },
    ];
    const term = { columns: 100, rows: 30, version: '0.0.1' };
    const result = sessionSnapshot(state, keys, term);
    expect(result.keys.map((k) => k.input)).toEqual(['j', '']);
  });
});
