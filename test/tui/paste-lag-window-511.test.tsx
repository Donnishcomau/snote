/**
 * #511 part 3 (#499): the one-render lag window. A bracketed paste that
 * waits in the read gate while the notes list leaves is handed by
 * src/tui/read-gate.ts (`em.listenerCount('paste') === 0 ? 'input' : ev`)
 * to the input channel, into the text mode then on screen. The crash key
 * ring must hold that text only as '<text>' entries, never verbatim.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { getKeyLog, resetKeyLog } from '../../src/tui/key-ring';
import type { EntityId } from '@vendor/types';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;
const SECRET = 'hunter2-secret';

const ringInputs = (): string[] => getKeyLog().map((e) => e.input);

function makeOne(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', 'Groceries\n- [ ] milk', { modificationDate: 2000, creationDate: 2000 }),
  });
  return store;
}

describe('a paste left in the read gate when the list leaves (#511 part 3)', () => {
  beforeEach(() => {
    resetKeyLog();
  });

  it('1: WHEN `/` and `\\x1b[200~hunter2-secret\\x1b[201~` arrive in one read THEN the search box holds the text, no ring entry contains it and the ring has `<text>` entries', async () => {
    const store = makeOne();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    // one read: `/` opens search, the paste waits in the gate and the list's
    // paste listener is gone when the gate delivers it
    stdin.write(`/\x1b[200~${SECRET}\x1b[201~`);

    // every positive value is inside the wait: the frame, the store and the ring's `<text>` entries
    await waitForFrame(
      lastFrame,
      (frame) =>
        frame.includes(`search: ${SECRET}`) &&
        store.getState().ui.searchQuery === SECRET &&
        ringInputs().some((i) => i === '<text>') &&
        ringInputs().every((i) => i === '/' || i === '<text>')
    );

    const inputs = ringInputs();
    expect(inputs.join('')).not.toContain('hunter2');
    expect(inputs.join('')).not.toContain('secret');
  });
});
