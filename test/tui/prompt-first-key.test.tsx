/**
 * T464 (F110): the FIRST key typed into the checklist-item (`a`) or export
 * (`w`) prompt must go only into the prompt. App used to read BottomArea's
 * prompt cells once per render, so on the first key after `a`/`w` its
 * text-mode flag and prompt guard still said "no prompt" and the key ran as
 * a list command (`s` re-sorted, `d` trashed the note) and was stored raw in
 * the crash ring. App now reads the cells at key time.
 */
import { render } from 'ink-testing-library';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const sortType = (store: ReturnType<typeof makeStore>): unknown =>
  store.getState().settings.sortType;

const anyDeleted = (store: ReturnType<typeof makeStore>): boolean => {
  for (const note of store.getState().data.notes.values()) {
    if (Boolean(note.deleted)) return true;
  }
  return false;
};

const lastInputs = (n: number): string[] =>
  getKeyLog()
    .slice(-n)
    .map((e) => e.input);

/** TWO: note `g` (Groceries checklist, newest) and note `h` (Second). */
function setupTwo(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', 'Groceries\n- [ ] milk', {
      modificationDate: 2000,
      creationDate: 2000,
    }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('h'),
    note: makeNote('h', 'Second', {
      modificationDate: 1000,
      creationDate: 1000,
    }) as never,
  });
  return store;
}

/** Render TWO at 80x24 and wait until the list shows the first note. */
async function renderTwo(store: ReturnType<typeof makeStore>) {
  const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
  await waitForInput(stdin);
  await waitForFrame(lastFrame, 'Groceries');
  return { stdin, lastFrame };
}

/** Tab focuses the note pane; `a` opens the checklist-item prompt. */
async function openItemPrompt(
  stdin: { write(data: string): unknown },
  lastFrame: () => string | undefined
): Promise<void> {
  stdin.write('\t');
  await waitForFrame(lastFrame, 'Second');
  stdin.write('a');
  await waitForFrame(lastFrame, 'new check item');
}

/** `w` opens the export prompt on the selected note's suggested path. */
async function openExportPrompt(
  stdin: { write(data: string): unknown },
  lastFrame: () => string | undefined
): Promise<void> {
  stdin.write('w');
  await waitForFrame(lastFrame, 'Groceries.md');
}

/** Type `s` then `d` into the open checklist-item prompt, frame by frame. */
async function typeIntoItemPrompt(
  stdin: { write(data: string): unknown },
  lastFrame: () => string | undefined
): Promise<void> {
  stdin.write('s');
  await waitForFrame(lastFrame, (f) => /new check item.*s/.test(f));
  stdin.write('d');
  await waitForFrame(lastFrame, (f) => /new check item.*sd/.test(f));
}

describe('prompt first key (T464)', () => {
  beforeEach(() => {
    resetKeyLog();
  });

  it('1: WHEN TWO is shown and Tab, a, s, d are written THEN settings.sortType is still modificationDate and no note has deleted true', async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    await openItemPrompt(stdin, lastFrame);
    await typeIntoItemPrompt(stdin, lastFrame);
    await vi.waitFor(() => {
      expect(sortType(store)).toBe('modificationDate');
      expect(anyDeleted(store)).toBe(false);
    });
  });

  it("2: WHEN after line 1's keys Enter is written THEN note g content is Groceries\\n- [ ] milk\\n- [ ] sd", async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    await openItemPrompt(stdin, lastFrame);
    await typeIntoItemPrompt(stdin, lastFrame);
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(store.getState().data.notes.get(eid('g'))?.content).toBe(
        'Groceries\n- [ ] milk\n- [ ] sd'
      );
    });
  });

  it("3: WHEN TWO is shown and Tab, a, s, d are written THEN the last two ring inputs are <text> and <text>, and no ring input after the a is s or d", async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    await openItemPrompt(stdin, lastFrame);
    await typeIntoItemPrompt(stdin, lastFrame);
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      let lastA = -1;
      getKeyLog().forEach((e, i) => {
        if (e.input === 'a') lastA = i;
      });
      const afterA = getKeyLog().slice(lastA + 1);
      expect(afterA.length).toBeGreaterThan(0);
      expect(afterA).not.toContain('s');
      expect(afterA).not.toContain('d');
      expect(lastInputs(2)).toEqual(['<text>', '<text>']);
    });
  });

  it('4: WHEN TWO is shown and w, s, d are written THEN settings.sortType is still modificationDate, no note is deleted, and the frame contains Groceries.mdsd', async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    await openExportPrompt(stdin, lastFrame);
    stdin.write('s');
    await waitForFrame(lastFrame, 'Groceries.mds');
    stdin.write('d');
    await waitForFrame(lastFrame, 'Groceries.mdsd');
    await vi.waitFor(() => {
      expect(sortType(store)).toBe('modificationDate');
      expect(anyDeleted(store)).toBe(false);
      expect(lastFrame() ?? '').toContain('Groceries.mdsd');
    });
  });

  it('5: WHEN TWO is shown and w, s, d are written THEN the last two ring inputs are <text> and <text>', async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    await openExportPrompt(stdin, lastFrame);
    stdin.write('s');
    await waitForFrame(lastFrame, 'Groceries.mds');
    stdin.write('d');
    await waitForFrame(lastFrame, 'Groceries.mdsd');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      expect(lastInputs(2)).toEqual(['<text>', '<text>']);
    });
  });

  it("6: WHEN TWO is shown and s is written with no prompt open THEN settings.sortType is creationDate and the last ring input is s", async () => {
    const store = setupTwo();
    const { stdin, lastFrame } = await renderTwo(store);
    stdin.write('s');
    await waitForFrame(lastFrame, 'sort: created');
    await vi.waitFor(() => {
      expect(sortType(store)).toBe('creationDate');
      expect(lastInputs(1)).toEqual(['s']);
    });
  });
});
