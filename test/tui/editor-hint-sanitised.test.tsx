// #221 (security build rule R4): the one line a suspended terminal shows while a GUI editor is open carries the
// editor's display name, which comes from the environment (SNOTE_EDITOR, EDITOR). Escape sequences in it never
// reach the terminal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForInput } from '../helpers/ink-waits';

let isTTY: boolean | undefined;
let snoteEditor: string | undefined;
let recorded: string[];
let spy: { mockRestore: () => void };

beforeEach(() => {
  isTTY = process.stdout.isTTY;
  snoteEditor = process.env.SNOTE_EDITOR;
  recorded = [];
  spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    recorded.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
});

afterEach(() => {
  spy.mockRestore();
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, writable: true, configurable: true });
  if (snoteEditor === undefined) delete process.env.SNOTE_EDITOR;
  else process.env.SNOTE_EDITOR = snoteEditor;
});

describe('#221 the editor hint is sanitised', () => {
  it('6: WHEN the editor display name holds `\\x1b]52;c;QUJD\\x07` and `n` starts a new note THEN no chunk written to process.stdout contains an ESC byte and exactly `1` chunk equals `Editing in Zed — save and close the editor to return\\n`', async () => {
    process.env.SNOTE_EDITOR = '/usr/bin/\x1b]52;c;QUJD\x07zed';
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin } = render(<App store={makeStore({ stubClient: {} })} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);
    stdin.write('n');
    await vi.waitFor(
      () => {
        expect(runEditor).toHaveBeenCalled();
        expect(recorded.filter((c) => c.includes('Editing in'))).toEqual(['Editing in Zed — save and close the editor to return\n']);
      },
      { timeout: 2000, interval: 10 },
    );
    expect(recorded.filter((c) => c.includes('\x1b'))).toEqual([]);
  });
});
