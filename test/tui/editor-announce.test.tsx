import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const GUI_EDITOR = 'test/fixtures/bin/omawrite';
const ANNOUNCE = 'Editing in Omawrite — save with Ctrl+S and close the window to return\n';

let store: ReturnType<typeof makeStore>;
let stdoutTTY: boolean | undefined;
let snoteEditor: string | undefined;
// vi.spyOn keeps the write slot restorable; the recorder on top of it is
// what the tests read. spyOn throws while an earlier recorder is still in
// the slot, so beforeEach and afterEach must pair exactly (see F273).
let writeSpy: { mockRestore: () => void };
let recorded: string[];

function chunks(): string[] {
  return recorded.slice();
}

function setStdoutProp(name: 'isTTY', value: boolean | undefined): void {
  Object.defineProperty(process.stdout, name, { value, writable: true, configurable: true });
}

async function settleRunEditor(runEditor: ReturnType<typeof vi.fn>): Promise<void> {
  // the announce and the editor call happen in the same synchronous run of
  // the action's suspend callback, so once runEditor has been called the
  // stdout writes of the editor start are all in.
  await vi.waitFor(() => {
    if (runEditor.mock.calls.length === 0) {
      throw new Error('runEditor has not been called yet');
    }
  }, { timeout: 2000, interval: 10 });
}

describe('editor announce only on a terminal', () => {
  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    testNotes.forEach((note, idx) => {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid(`note-${idx + 1}`),
        note: {
          content: note.content,
          systemTags: note.systemTags,
          tags: note.tags,
          deleted: note.deleted,
          modificationDate: note.modificationDate,
          creationDate: note.creationDate,
        },
      });
    });
    stdoutTTY = process.stdout.isTTY;
    snoteEditor = process.env.SNOTE_EDITOR;
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    recorded = [];
    const recorder = ((chunk: unknown): boolean => {
      recorded.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    Object.defineProperty(process.stdout, 'write', {
      value: recorder,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    setStdoutProp('isTTY', stdoutTTY);
    if (snoteEditor === undefined) {
      delete process.env.SNOTE_EDITOR;
    } else {
      process.env.SNOTE_EDITOR = snoteEditor;
    }
  });

  it("1: WHEN n is written in the App (runEditor resolving `null`) while process.stdout.isTTY is undefined THEN no chunk written to process.stdout contains `Editing in`", async () => {
    process.env.SNOTE_EDITOR = GUI_EDITOR;
    setStdoutProp('isTTY', undefined);
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin } = render(<App store={store} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);

    stdin.write('n');
    await settleRunEditor(runEditor);

    expect(chunks().filter((c) => c.includes('Editing in'))).toEqual([]);
  });

  it("2: WHEN the same runs with process.stdout.isTTY set to `true` THEN exactly `1` chunk contains `Editing in` and it equals `Editing in Omawrite — save with Ctrl+S and close the window to return\\n`", async () => {
    process.env.SNOTE_EDITOR = GUI_EDITOR;
    setStdoutProp('isTTY', true);
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin } = render(<App store={store} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);

    stdin.write('n');
    await settleRunEditor(runEditor);

    const announced = chunks().filter((c) => c.includes('Editing in'));
    expect(announced).toHaveLength(1);
    expect(announced[0]).toBe(ANNOUNCE);
  });

  it("3: WHEN e is written on a selected note with process.stdout.isTTY set to `true` THEN exactly `1` chunk equals `Editing in Omawrite — save with Ctrl+S and close the window to return\\n`", async () => {
    process.env.SNOTE_EDITOR = GUI_EDITOR;
    setStdoutProp('isTTY', true);
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Pinned note');

    stdin.write('e');
    await settleRunEditor(runEditor);

    const announced = chunks().filter((c) => c === ANNOUNCE);
    expect(announced).toHaveLength(1);
  });

  it("4: WHEN SNOTE_EDITOR is `nvim`, process.stdout.isTTY is `true` and `n` is written THEN no chunk contains `Editing in`", async () => {
    process.env.SNOTE_EDITOR = 'nvim';
    setStdoutProp('isTTY', true);
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin } = render(<App store={store} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);

    stdin.write('n');
    await settleRunEditor(runEditor);

    expect(chunks().filter((c) => c.includes('Editing in'))).toEqual([]);
  });
});
