import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('session recording (key ring)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed a single note via CREATE_NOTE_WITH_ID
    const noteId = eid('note-session-1');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'session note',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
      },
    });

    resetKeyLog();
  });

  it('1: WHEN j, k, j are written to stdin in order (each followed by the 50 ms wait) THEN getKeyLog() has length 3 and getKeyLog()[2].input is j', async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    // Press j
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press k
    stdin.write('k');
    await new Promise(r => setTimeout(r, 50));

    // Press j
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    const log = getKeyLog();
    expect(log.length).toBe(3);
    expect(log[2].input).toBe('j');
  });

  it('2: WHEN nothing is written and resetKeyLog() is called THEN getKeyLog() has length 0', async () => {
    render(<App store={store} width={80} height={24} />);

    await new Promise(r => setTimeout(r, 50));

    resetKeyLog();

    const log = getKeyLog();
    expect(log.length).toBe(0);
  });

  it('3: WHEN the character x is written to stdin 25 times in a row (each with the 50 ms wait) THEN getKeyLog() has length 20', async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    for (let i = 0; i < 25; i++) {
      stdin.write('x');
      await new Promise(r => setTimeout(r, 50));
    }

    const log = getKeyLog();
    expect(log.length).toBe(20);
  });

  it('4: WHEN j is written and the wait finishes THEN store.getState().data.notes is the same Map reference (toBe) as it was right after render', async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    await new Promise(r => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    const notesAfter = store.getState().data.notes;
    expect(notesAfter).toBe(notesBefore);
  });

  it('5: WHEN stdin.write(\'\\u001b\') (Escape) is sent and the wait finishes THEN getKeyLog()\'s last entry has key.escape equal to true', async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    const log = getKeyLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].key.escape).toBe(true);
  });

  it('6: WHEN a, b, c are written to stdin in order (each with the 50 ms wait) THEN getKeyLog().map(e => e.input) is [\'a\', \'b\', \'c\']', async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    stdin.write('a');
    await new Promise(r => setTimeout(r, 50));

    stdin.write('b');
    await new Promise(r => setTimeout(r, 50));

    stdin.write('c');
    await new Promise(r => setTimeout(r, 50));

    const log = getKeyLog();
    const inputs = log.map(e => e.input);
    expect(inputs).toEqual(['a', 'b', 'c']);
  });
});
