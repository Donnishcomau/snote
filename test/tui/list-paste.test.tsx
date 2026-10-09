/**
 * T482 (carrying T463's six acceptance lines): the notes list claims
 * bracketed pastes through BottomArea's useListPaste, so a paste there
 * changes nothing and shows a notice — while pastes into prompts, search
 * and the inline editor keep working as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { getKeyLog, resetKeyLog } from '../../src/tui/key-ring';
import type { EntityId } from '@vendor/types';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;

const joinedInputs = (): string => getKeyLog().map((e) => e.input).join('');

const lastInput = (): string | undefined => {
  const log = getKeyLog();
  return log[log.length - 1]?.input;
};

/** TWO: note g 'Groceries\n- [ ] milk' (2000, selected first) and h 'Second' (1000). */
function makeTwo(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', 'Groceries\n- [ ] milk', { modificationDate: 2000, creationDate: 2000 }),
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('h'),
    note: makeNote('h', 'Second', { modificationDate: 1000, creationDate: 1000 }),
  });
  return store;
}

const liveNotes = (store: ReturnType<typeof makeStore>): EntityId[] =>
  [...store.getState().data.notes.entries()]
    .filter(([, n]) => !n.deleted)
    .map(([id]) => id);

/**
 * Poll every 10 ms up to 2000 ms with vi.waitFor; every assertion that the
 * wait depends on lives inside `cond`, so no value is asserted blind.
 */
async function waitFor(label: string, cond: () => void): Promise<void> {
  try {
    await vi.waitFor(cond, { timeout: 2000, interval: 10 });
  } catch {
    throw new Error(`timed out waiting for: ${label}`);
  }
}

describe('notes list uses the paste hook (T482)', () => {
  beforeEach(() => {
    resetKeyLog();
  });

  it("1: WHEN TWO is shown with an `onLogout` spy and `\\x1b[200~dDxL\\x1b[201~` is written in the list THEN `data.notes.size` stays `2`, no note is deleted, the spy has `0` calls and no frame has `log out`", async () => {
    const store = makeTwo();
    const onLogout = vi.fn();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} onLogout={onLogout} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('\x1b[200~dDxL\x1b[201~');

    // the paste lands as one ignored '<text>' ring entry; nothing else moved
    await waitFor('one masked ring entry', () => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      expect(lastInput()).toBe('<text>');
      expect(joinedInputs()).not.toContain('hunter2');
    });

    expect(store.getState().data.notes.size).toBe(2);
    expect(liveNotes(store)).toEqual([eid('g'), eid('h')]);
    expect(onLogout).toHaveBeenCalledTimes(0);
    expect(lastFrame()).not.toContain('log out');
  });

  it("2: WHEN `\\x1b[200~\\x1b]52;c;UFdORUQ=\\x07 note\\x1b[201~` is written in the list THEN the frame contains `Paste ignored — press / to search`, the last ring input is `<text>` and no input has `UFdORUQ`", async () => {
    const store = makeTwo();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('\x1b[200~\x1b]52;c;UFdORUQ=\x07 note\x1b[201~');

    await waitForFrame(
      lastFrame,
      (frame) =>
        frame.includes('Paste ignored — press / to search') &&
        lastInput() === '<text>' &&
        !joinedInputs().includes('UFdORUQ')
    );

    expect(lastFrame()).toContain('Paste ignored — press / to search');
  });

  it("3: WHEN `\\x1b[200~dd` and `dd\\x1b[201~` are written as two chunks and then `j` THEN no note is deleted, and after `j` the frame contains `>Second` and not `Paste ignored`", async () => {
    const store = makeTwo();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('\x1b[200~dd');
    stdin.write('dd\x1b[201~');

    // the split paste is refused: both notes stay live and it stays masked
    await waitFor('split paste refused', () => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      expect(lastInput()).toBe('<text>');
      expect(liveNotes(store)).toEqual([eid('g'), eid('h')]);
    });

    stdin.write('j');

    await waitForFrame(
      lastFrame,
      (frame) => frame.includes('>Second') && !frame.includes('Paste ignored')
    );

    expect(liveNotes(store)).toEqual([eid('g'), eid('h')]);
  });

  it("4: WHEN Tab and `a` open the checklist-item prompt and `\\x1b[200~soy\\x1b[201~` then `\\r` are written THEN note `g` content is `Groceries\\n- [ ] milk\\n- [ ] soy`", async () => {
    const store = makeTwo();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('\t');
    // the first Tab moves focus into the note pane (it shows 'focus:
    // preview'); the checklist prompt opens with `a` after that
    await waitForFrame(lastFrame, 'focus: preview');

    stdin.write('a');

    await waitForFrame(lastFrame, 'new check item');

    stdin.write('\x1b[200~soy\x1b[201~');

    // the prompt is open, so the hook is off and the paste types into it
    await waitForFrame(lastFrame, 'soy');

    stdin.write('\r');

    await waitFor('checklist item inserted', () => {
      expect(store.getState().data.notes.get(eid('g'))?.content).toBe(
        'Groceries\n- [ ] milk\n- [ ] soy'
      );
    });
  });

  it("5: WHEN `/` opens search and `\\x1b[200~Seco\\x1b[201~` is written THEN `ui.searchQuery` is `Seco` and the frame does not contain `Paste ignored`", async () => {
    const store = makeTwo();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('/');

    await waitForFrame(lastFrame, 'search:');

    stdin.write('\x1b[200~Seco\x1b[201~');

    await waitForFrame(
      lastFrame,
      (frame) => store.getState().ui.searchQuery === 'Seco' && !frame.includes('Paste ignored')
    );

    expect(store.getState().ui.searchQuery).toBe('Seco');
  });

  it("6: WHEN `i` opens the inline editor on `g` and `\\x1b[200~PASTED\\x1b[201~` is written THEN the frame contains `PASTED` and does not contain `Paste ignored`", async () => {
    const store = makeTwo();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Groceries');

    stdin.write('i');

    await waitForFrame(lastFrame, 'Ctrl+S save');

    stdin.write('\x1b[200~PASTED\x1b[201~');

    await waitForFrame(
      lastFrame,
      (frame) => frame.includes('PASTED') && !frame.includes('Paste ignored')
    );

    expect(lastFrame()).toContain('PASTED');
  });
});
