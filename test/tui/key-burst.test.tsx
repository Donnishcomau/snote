import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { waitForFrame } from '../helpers/ink-waits';
import { SEVERAL_KEYS as SEVERAL } from '../../src/tui/read-gate';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function make2NoteStore() {
  const store = makeStore({ stubClient: {} });

  // Seed 2 notes via IMPORT_NOTE_WITH_ID
  // k1: Alpha note, modificationDate: 2000
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('k1'),
    note: makeNote('k1', 'Alpha note', {
      modificationDate: 2000,
    }),
  } as never);

  // k2: Beta note, modificationDate: 1000
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('k2'),
    note: makeNote('k2', 'Beta note', {
      modificationDate: 1000,
    }),
  } as never);

  return store;
}

function make4NoteStore() {
  const store = makeStore({ stubClient: {} });

  // Seed 4 notes: q1..q4 titled Note A..Note D
  // modificationDate 4000/3000/2000/1000 so default order is Note A, B, C, D
  // with Note A selected first (modificationDate descending)
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('q1'),
    note: makeNote('q1', 'Note A', {
      modificationDate: 4000,
    }),
  } as never);

  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('q2'),
    note: makeNote('q2', 'Note B', {
      modificationDate: 3000,
    }),
  } as never);

  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('q3'),
    note: makeNote('q3', 'Note C', {
      modificationDate: 2000,
    }),
  } as never);

  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('q4'),
    note: makeNote('q4', 'Note D', {
      modificationDate: 1000,
    }),
  } as never);

  return store;
}

describe('T241 key burst', () => {
  it('1: WHEN the 2-note store renders at 80x24 and s is written once THEN the frame contains sort: created and store.getState().settings.sortType is creationDate', async () => {
    const store = make2NoteStore();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('s');
    await new Promise((r) => setTimeout(r, 0));

    const frame = lastFrame();
    expect(frame).toContain('sort: created');
    expect(store.getState().settings.sortType).toBe('creationDate');
  });

  it('2: WHEN the 2-note store renders at 80x24 and ss (two characters in one stdin.write call) is written THEN the frame contains sort: created and `Several keys at once: only the first was used`, and store.getState().settings.sortType is creationDate (T538R-3: only the first key of a read acts)', async () => {
    const store = make2NoteStore();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('ss');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('sort: created') && f.includes(SEVERAL) && store.getState().settings.sortType === 'creationDate');
    expect(frame).toContain('sort: created');
    expect(frame).toContain(SEVERAL);
    expect(store.getState().settings.sortType).toBe('creationDate');
  });

  it('3: WHEN the 2-note store renders at 80x24 and sss (three characters in one stdin.write call) is written THEN store.getState().settings.sortType is creationDate, and the frame contains sort: created and not sort: a-z (T538R-3)', async () => {
    const store = make2NoteStore();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('sss');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('sort: created') && f.includes(SEVERAL) && !f.includes('sort: a-z') && store.getState().settings.sortType === 'creationDate');
    expect(store.getState().settings.sortType).toBe('creationDate');
    expect(frame).toContain('sort: created');
    expect(frame).not.toContain('sort: a-z');
  });

  it('4: WHEN the 4-note store renders at 80x24 and jj (two characters in one stdin.write call) is written THEN the frame contains >Note B and does not contain >Note C (T538R-3)', async () => {
    const store = make4NoteStore();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toMatch(/>Note A/);

    stdin.write('jj');
    frame = await waitForFrame(lastFrame, (f) => />Note B/.test(f) && f.includes(SEVERAL));
    expect(frame).toMatch(/>Note B/);
    expect(frame).not.toMatch(/>Note C/);
  });
});
