/**
 * #475: noteWriter when the store's dispatch throws AFTER the reducer applied the edit (a middleware or
 * subscriber error). The note then holds the write, so base() follows it; a dispatch that throws before the
 * reducer (editor-write-restart.test.tsx line 6, #439) still leaves base as it was.
 * The store here is a stub: dispatch sets the note's content, then throws.
 */
import { describe, it, expect } from 'vitest';

import { noteWriter } from '../../src/core/held-lines';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

function stubStore(start: string) {
  const notes = new Map([[eid('n1'), { content: start }]]);
  const mode = { applyThenThrow: true, throwBeforeApply: false };
  return {
    notes,
    mode,
    getState: () => ({ data: { notes } }),
    dispatch: (action: { changes?: { content?: string } }): unknown => {
      if (mode.throwBeforeApply) throw new Error('before the reducer');
      notes.set(eid('n1'), { content: action.changes?.content ?? '' });
      if (mode.applyThenThrow) throw new Error('after the reducer');
      return undefined;
    },
  };
}

describe('#475 the writer follows the note when a dispatch throws after the reducer applied the write', () => {
  it('1: WHEN the dispatch of `first write` throws after the note was set to it THEN the write throws `after the reducer` and base() holds `first write`', () => {
    const store = stubStore('old note');
    const w = noteWriter(store as never, eid('n1'), 'old note');
    expect(() => w.write('first write')).toThrow('after the reducer');
    expect({ held: store.notes.get(eid('n1'))?.content, base: w.base() }).toEqual({ held: 'first write', base: 'first write' });
  });

  it('2: WHEN the dispatch of `top\\nbody` throws after the reducer, another device then adds `remote` at the end of the note and the editor writes `local\\ntop\\nbody` THEN the note holds `local`, `top`, `body` and `remote` and the writer reports no conflict', () => {
    const store = stubStore('body');
    const w = noteWriter(store as never, eid('n1'), 'body');
    expect(() => w.write('top\nbody')).toThrow('after the reducer');
    store.mode.applyThenThrow = false;
    store.notes.set(eid('n1'), { content: 'top\nbody\nremote' });
    w.write('local\ntop\nbody');
    expect({ held: store.notes.get(eid('n1'))?.content, conflicted: w.conflicted() }).toEqual({ held: 'local\ntop\nbody\nremote', conflicted: false });
  });

  it('3: WHEN the dispatch of `merged write` throws after the reducer and the merge kept both versions THEN conflicted() is true', () => {
    const store = stubStore('one\ntwo');
    const w = noteWriter(store as never, eid('n1'), 'one\ntwo');
    store.notes.set(eid('n1'), { content: 'one\nREMOTE' });
    expect(() => w.write('one\nLOCAL')).toThrow('after the reducer');
    expect({ conflicted: w.conflicted(), held: store.notes.get(eid('n1'))?.content?.includes('LOCAL') }).toEqual({ conflicted: true, held: true });
  });

  it('4: WHEN the dispatch of `lost write` throws before the reducer touched the note THEN base() still holds `old note`, and the next write that goes through moves it to `next write`', () => {
    const store = stubStore('old note');
    store.mode.throwBeforeApply = true;
    const w = noteWriter(store as never, eid('n1'), 'old note');
    expect(() => w.write('lost write')).toThrow('before the reducer');
    const afterThrow = w.base();
    store.mode.throwBeforeApply = false;
    store.mode.applyThenThrow = false;
    w.write('next write');
    expect({ afterThrow, after: w.base(), held: store.notes.get(eid('n1'))?.content }).toEqual({ afterThrow: 'old note', after: 'next write', held: 'next write' });
  });
});
