import { render } from 'ink-testing-library';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { crashReport } from '../../src/core/crash-report';
import type { CrashContext } from '../../src/core/crash-report';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { getKeyLog, resetKeyLog } from '../../src/tui/key-ring';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityId } from '@vendor/types';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const lastInputs = (n: number): string[] =>
  getKeyLog()
    .slice(-n)
    .map((e) => e.input);

const joinedInputs = (): string => getKeyLog().map((e) => e.input).join('');

describe('key ring stores text as <text> (T411)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-rt-1'),
      note: {
        content: 'hello',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
      },
    });
    resetKeyLog();
  });

  it("1: WHEN a note `hello` is selected, `i` is written and then `h`, `u`, `n`, `t`, `e`, `r`, `2` one by one THEN the last 7 ring entries all have input `<text>`, the entry before them has input `i`, and the joined inputs do not contain `hunter2`", async () => {
    // the note is selected only once the list has rendered it with the
    // cursor; writing `i` before that does nothing
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>hello');

    // `i` opens the inline editor for the `hello` note (list view with one
    // note keeps the selection on it), then each typed character of
    // `hunter2` is masked as it lands in the editor.
    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save');

    for (const ch of ['h', 'u', 'n', 't', 'e', 'r', '2']) {
      stdin.write(ch);
      // the editor echoes each character as it is typed; the ring write for
      // that same key is synchronous inside the handler, so once the echo
      // is on screen the mask has already been decided
      await waitForFrame(lastFrame, `hello${'hunter2'.slice(0, 'hunter2'.indexOf(ch) + 1)}`);
    }

    await vi.waitFor(
      () => {
        const log = getKeyLog();
        expect(log.length).toBeGreaterThanOrEqual(8);
        expect(log[log.length - 8].input).toBe('i');
        expect(lastInputs(7)).toEqual(['<text>', '<text>', '<text>', '<text>', '<text>', '<text>', '<text>']);
        expect(joinedInputs()).not.toContain('hunter2');
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it("2: WHEN, with no prompt or editor open, `\\x1b[200~my-password-123\\x1b[201~` is written THEN the joined ring inputs do not contain `my-password-123` and the last entry's input is `<text>`", async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);

    stdin.write('\x1b[200~my-password-123\x1b[201~');

    await vi.waitFor(
      () => {
        const log = getKeyLog();
        expect(log.length).toBeGreaterThan(0);
        expect(log[log.length - 1].input).toBe('<text>');
        expect(joinedInputs()).not.toContain('my-password-123');
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it("3: WHEN `j`, `k`, `j` are written in the list THEN the last three ring inputs are `j`, `k`, `j`", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);

    stdin.write('j');
    await waitForFrame(lastFrame, (frame) => lastInputs(1)[0] === 'j');

    stdin.write('k');
    await waitForFrame(lastFrame, (frame) => lastInputs(1)[0] === 'k');

    stdin.write('j');
    await waitForFrame(lastFrame, (frame) => lastInputs(1)[0] === 'j');

    expect(lastInputs(3)).toEqual(['j', 'k', 'j']);
  });

  it("4: WHEN `crashReport(new Error('x'), ctx)` runs THEN its message has 3 lines and the third is exactly `Hand that file to your coding agent, or read it before you attach it to an issue.`", () => {
    const ctx = {
      version: '0.0.1',
      when: new Date('2026-09-20T01:02:03.000Z'),
      columns: 120,
      rows: 32,
      home: '/home/someone',
    } satisfies CrashContext;

    const result = crashReport(new Error('x'), ctx);
    const lines = result.message.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe('Hand that file to your coding agent, or read it before you attach it to an issue.');
  });

  it("5: WHEN src/cli/main.tsx is read THEN it does not contain `no content` and contains `<text>`, and src/tui/App.tsx has exactly `247` lines and contains `inlineEditOpen))`", () => {
    const main = read('src/cli/main.tsx');
    expect(main).not.toContain('no content');
    expect(main).toContain('<text>');
    const app = read('src/tui/App.tsx');
    expect(app.trimEnd().split('\n').length).toBe(247);
    expect(app).toContain('inlineEditOpen))');
  });
});
