/**
 * T402 — security fix, step 3 of 3 (#10063): snote writes to the terminal
 * through the output guard and never uses Ink's screen-reader renderer.
 *
 * The rig renders the real App through Ink's real `render` with a fake TTY
 * stdout wrapped in `guardOutputStream` (the same wrap main() installs),
 * opens the inline editor (`i`) on a note smuggling OSC sequences, types
 * `X`, and saves with Ctrl+S. No OSC byte and no C1 control may reach the
 * recorded stdout in either screen-reader mode, while the saved note keeps
 * its original bytes plus `X`.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { render } from 'ink';

import { makeStore } from '../../src/core/store';
import { guardOutputStream } from '../../src/core/output-guard';
import App from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const NOTE_ID = eid('osc-note');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `check()` holds or the deadline passes, then assert once.
 * Every value the test later asserts is either inside `check()` or read
 * after this resolves, so a slow render never races an assertion.
 */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (check()) return;
    if (Date.now() >= end) {
      expect(check()).toBe(true);
      return;
    }
    await wait(10);
  }
}

// `render`'s options want Node's WriteStream/ReadStream; the fakes below
// implement just the events Ink actually uses, so each is cast at the
// boundary where it enters the options object.
interface FakeStream {
  on(event: string, listener: (...args: never[]) => void): unknown;
  once(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(s: string): boolean;
  setEncoding?: () => void;
  setRawMode?: () => void;
  resume?: () => void;
  pause?: () => void;
  ref?: () => void;
  unref?: () => void;
  read?: () => string | null;
  [key: string]: unknown;
}

const asStream = (fake: object): never => fake as never;

/** Fake TTY stdout that records every write; the guard wraps this one. */
function makeStdout(): { stream: never; chunks: string[] } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const fake: FakeStream = {
    on: (e, l) => emitter.on(e, l as (...a: unknown[]) => void),
    once: (e, l) => emitter.once(e, l as (...a: unknown[]) => void),
    off: (e, l) => emitter.off(e, l as (...a: unknown[]) => void),
    emit: (e, ...a) => emitter.emit(e, ...a),
    isTTY: true,
    columns: 100,
    rows: 30,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  };
  return { stream: asStream(guardOutputStream(fake)), chunks };
}

/**
 * Fake TTY stdin feeding Ink's useInput, per the verified prototype:
 * a real EventEmitter carrying Ink's extras, so Ink's raw-mode plumbing
 * sees the same shape it does on a live terminal.
 */
function makeStdin(): { stream: never; send: (d: string) => void } {
  const emitter = new EventEmitter();
  let pending: string | null = null;
  const fake = emitter as unknown as FakeStream;
  fake.isTTY = true;
  fake.setEncoding = () => undefined;
  fake.setRawMode = () => undefined;
  fake.resume = () => undefined;
  fake.pause = () => undefined;
  fake.ref = () => undefined;
  fake.unref = () => undefined;
  fake.read = () => {
    const value = pending;
    pending = null;
    return value;
  };
  fake.write = (d: string) => {
    pending = d;
    emitter.emit('readable');
    emitter.emit('data', d);
    return true;
  };
  const send = (d: string): void => {
    fake.write!(d);
  };
  return { stream: asStream(fake), send };
}

type StoreT = ReturnType<typeof makeStore>;

function seedNote(content: string): StoreT {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: NOTE_ID,
    note: {
      content,
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: now,
      creationDate: now,
    },
  });
  return store;
}

const contentOf = (store: StoreT): string =>
  store.getState().data.notes.get(NOTE_ID)?.content ?? '';

interface RunResult {
  joined: string;
  saved: string;
}

/**
 * One full run: render App on the guarded stdout, press `i` to open the
 * inline editor, type `X`, save with Ctrl+S (keys 70 ms apart), wait for
 * the store to hold `original + 'X'`, then unmount.
 */
async function runEditorWithOSC(original: string, screenReader: boolean): Promise<RunResult> {
  const store = seedNote(original);

  const { stream: stdout, chunks } = makeStdout();
  const { stream: stdin, send } = makeStdin();

  const savedCi = process.env.CI;
  delete process.env.CI;
  const savedReader = process.env.INK_SCREEN_READER;
  if (screenReader) {
    process.env.INK_SCREEN_READER = 'true';
  } else {
    delete process.env.INK_SCREEN_READER;
  }

  const { unmount } = render(<App store={store} width={100} height={30} />, {
    stdout,
    stdin,
    patchConsole: false,
    exitOnCtrlC: false,
    interactive: true,
  });

  try {
    // useAppState fills its list model in an effect after mount; wait
    // until the note's own text is on screen before driving the keys.
    await until(() => chunks.join('').includes('body'));
    // Open the inline editor, type X, save — 70 ms apart.
    send('i');
    await wait(70);
    send('X');
    await wait(70);
    send('\x13');
    await until(() => contentOf(store) === original + 'X');
    // Let any final repaint land in `chunks` before they are joined.
    await wait(70);
    return { joined: chunks.join(''), saved: contentOf(store) };
  } finally {
    try {
      unmount();
    } catch {
      // Ink may throw when tearing a fake TTY down; nothing depends on it.
    }
    if (savedCi === undefined) delete process.env.CI;
    else process.env.CI = savedCi;
    if (savedReader === undefined) delete process.env.INK_SCREEN_READER;
    else process.env.INK_SCREEN_READER = savedReader;
  }
}

const C1 = /[\u0080-\u009f]/;
const hasC1 = (s: string): boolean => C1.test(s);

describe('T402 — guarded terminal output for the inline editor', () => {
  it("1: WHEN, with INK_SCREEN_READER unset, the editor is opened on `Title\\n\\nbody \\x1b]52;c;UFdORUQ=\\x07 end`, `X` typed and saved THEN the joined stdout contains `body`, contains no `\\x1b]` and no `\\x07`, and the saved content is the original plus `X`.", async () => {
    const original = 'Title\n\nbody \x1b]52;c;UFdORUQ=\x07 end';
    const { joined, saved } = await runEditorWithOSC(original, false);
    expect(joined).toContain('body');
    expect(joined).not.toContain('\x1b]');
    expect(joined).not.toContain('\x07');
    expect(saved).toBe(original + 'X');
  });

  it("2: WHEN the same runs with INK_SCREEN_READER set to `true` THEN the same holds.", async () => {
    const original = 'Title\n\nbody \x1b]52;c;UFdORUQ=\x07 end';
    const { joined, saved } = await runEditorWithOSC(original, true);
    expect(joined).toContain('body');
    expect(joined).not.toContain('\x1b]');
    expect(joined).not.toContain('\x07');
    expect(saved).toBe(original + 'X');
  });

  it("3: WHEN the note is `Title\\n\\nbody \\x1b]8;;http://evil\\x1b\\\\L\\x1b]8;;\\x1b\\\\ \\x9d52;c;AA\\x07 tail`, in both modes THEN stdout contains no `\\x1b]` and no character in U+0080-U+009F, and the saved content is the original plus `X`.", async () => {
    const original = 'Title\n\nbody \x1b]8;;http://evil\x1b\\L\x1b]8;;\x1b\\ \x9d52;c;AA\x07 tail';
    for (const screenReader of [false, true]) {
      const { joined, saved } = await runEditorWithOSC(original, screenReader);
      expect(joined).not.toContain('\x1b]');
      expect(hasC1(joined)).toBe(false);
      expect(saved).toBe(original + 'X');
    }
  });

  it("4: WHEN src/cli/main.tsx is read THEN it contains `guardOutputStream(process.stdout)` before `const { waitUntilExit, unmount, clear } = render(`, and contains `isScreenReaderEnabled: false`.", () => {
    const src = readFileSync(resolve(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const guardAt = src.indexOf('guardOutputStream(process.stdout)');
    const renderAt = src.indexOf('const { waitUntilExit, unmount, clear } = render(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(renderAt);
    expect(src).toContain('isScreenReaderEnabled: false');
  });
});
