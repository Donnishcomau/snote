/**
 * T470 — the output guard keeps Ink's own output byte-identical and drops
 * every other escape, across writes, Buffers and encodings (corrects T413).
 *
 * Lines 1-2 pin what `stripUnsafeOutput` keeps and drops, lines 3-5 the
 * per-stream state of `guardOutputStream` (split sequences, Buffers, other
 * encodings, ArrayBuffer views), and line 6 replays Ink's real output for a
 * tour of the App through a fresh guard and requires it unchanged.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import React from 'react';
import { render } from 'ink';

import { makeStore } from '../../src/core/store';
import { stripUnsafeOutput, guardOutputStream } from '../../src/core/output-guard';
import App from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A plain object whose `write` records its arguments, wrapped by the guard. */
function wrappedRecorder(): { write: (...args: unknown[]) => unknown; calls: unknown[][]; text: () => string } {
  const calls: unknown[][] = [];
  const stream = {
    write(...args: unknown[]): boolean {
      calls.push(args);
      return true;
    },
  };
  guardOutputStream(stream);
  return {
    write: (...args) => stream.write(...args),
    calls,
    text: () => calls.map((args) => String(args[0])).join(''),
  };
}

// `render`'s options want Node's WriteStream/ReadStream; the fakes below
// implement just what Ink uses, so each is cast where it enters the options.
const asStream = (fake: object): never => fake as never;

/** Unguarded fake TTY stdout that records each write (rig of osc-editor.test.tsx). */
function makeStdout(): { stream: never; chunks: string[] } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const fake = Object.assign(emitter, {
    isTTY: true,
    columns: 100,
    rows: 30,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  });
  return { stream: asStream(fake), chunks };
}

/** Fake TTY stdin feeding Ink's useInput. */
function makeStdin(): { stream: never; send: (d: string) => void } {
  const emitter = new EventEmitter();
  let pending: string | null = null;
  const fake = Object.assign(emitter, {
    isTTY: true,
    setEncoding: () => undefined,
    setRawMode: () => undefined,
    resume: () => undefined,
    pause: () => undefined,
    ref: () => undefined,
    unref: () => undefined,
    read: () => {
      const value = pending;
      pending = null;
      return value;
    },
    write: (d: string) => {
      pending = d;
      emitter.emit('readable');
      emitter.emit('data', d);
      return true;
    },
  });
  return { stream: asStream(fake), send: (d) => void fake.write(d) };
}

function seedTwoPlainNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  ['First note\n\nfirst body', 'Second note\n\nsecond body'].forEach((content, i) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: `plain-${i}` as unknown as EntityId,
      note: { content, systemTags: [], tags: [], deleted: false, modificationDate: now - i * 1000, creationDate: now - i * 1000 },
    });
  });
  return store;
}

describe('T470 — output guard v2', () => {
  it('1: WHEN `stripUnsafeOutput` gets each of `a\\x1bcb`, `a\\x1b7b`, `a\\x1b=b`, `a\\x1b(0b`, `a\\x1b[6nb`, `a\\x1b[cb`, `a\\x1b[21tb`, `a\\x1b[?ub`, `a\\x1b[>1ub`, `a\\x1b[>4;2mb` and `a\\x1b[\\x9d52;;00\\x07mb` THEN each of the first ten returns `ab`, and `a\\x1b[\\x9d52;;00\\x07mb` returns `amb` (the C1 introducer ends the CSI, the OSC is dropped through BEL, `m` is text).', () => {
    const firstTen = ['a\x1bcb', 'a\x1b7b', 'a\x1b=b', 'a\x1b(0b', 'a\x1b[6nb', 'a\x1b[cb', 'a\x1b[21tb', 'a\x1b[?ub', 'a\x1b[>1ub', 'a\x1b[>4;2mb'];
    expect(firstTen.map((s) => [s, stripUnsafeOutput(s)])).toEqual(firstTen.map((s) => [s, 'ab']));
    expect(stripUnsafeOutput('a\x1b[\x9d52;;00\x07mb')).toBe('amb');
  });

  it('2: WHEN it gets `\\x1b[31mred\\x1b[0m\\x1b[2K\\x1b[1A\\x1b[G\\x1b[?25l\\x1b[?25h\\x1b[?2026h\\x1b[?2026l\\x1b[?1049h\\x1b[H\\x1b[J\\x1b[?2004h\\x1b[?2004l` THEN it returns it unchanged.', () => {
    const ink = '\x1b[31mred\x1b[0m\x1b[2K\x1b[1A\x1b[G\x1b[?25l\x1b[?25h\x1b[?2026h\x1b[?2026l\x1b[?1049h\x1b[H\x1b[J\x1b[?2004h\x1b[?2004l';
    expect(stripUnsafeOutput(ink)).toBe(ink);
  });

  it("3: WHEN a wrapped recorder gets `write('x\\x1b')` then `write(']52;c;AAAA\\x07y')`, and a second wrapped recorder gets `write('a\\u0085b')`, `write('a\\x1b]52;c;AA\\x1b')`, `write('\\\\c')` and `write('d')` THEN the first records join to `xy` and the second's join to `abacd`.", () => {
    const first = wrappedRecorder();
    first.write('x\x1b');
    first.write(']52;c;AAAA\x07y');
    const second = wrappedRecorder();
    second.write('a\u0085b');
    second.write('a\x1b]52;c;AA\x1b');
    second.write('\\c');
    second.write('d');
    expect([first.text(), second.text()]).toEqual(['xy', 'abacd']);
  });

  it('4: WHEN, for every k from 0 to its length, `a\\x1b]8;;http://e\\x1b\\\\L\\x1b]8;;\\x1b\\\\b\\x9d52;c;AA\\x9cc\\x1b[31md\\x1b[0m\\x1bce` is written to a freshly wrapped recorder as two writes split at k THEN the recorded text is `aLbc\\x1b[31md\\x1b[0me` for every k.', () => {
    const input = 'a\x1b]8;;http://e\x1b\\L\x1b]8;;\x1b\\b\x9d52;c;AA\x9cc\x1b[31md\x1b[0m\x1bce';
    const results: [number, string][] = [];
    for (let k = 0; k <= input.length; k += 1) {
      const rec = wrappedRecorder();
      rec.write(input.slice(0, k));
      rec.write(input.slice(k));
      results.push([k, rec.text()]);
    }
    expect(results).toHaveLength(input.length + 1);
    expect(results).toEqual(results.map(([k]) => [k, 'aLbc\x1b[31md\x1b[0me']));
  });

  it("5: WHEN a wrapped recorder gets `Buffer.from('café')` split inside the `é`, then `Buffer.from('a\\u009d52;c;QQ\\u009cb')`, then `write(Buffer.from('\\x1b]52;c;QQ\\x07z').toString('hex'), 'hex')`, then a `Uint16Array` over a fresh `ArrayBuffer` holding the 8 bytes of `q\\x1b]0;t\\x07r` THEN every recorded first argument is a string and they join to `caféabzqr`.", () => {
    const rec = wrappedRecorder();
    const cafe = Buffer.from('café');
    const insideE = cafe.length - 1; // `é` is the last two bytes
    rec.write(cafe.subarray(0, insideE));
    rec.write(cafe.subarray(insideE));
    rec.write(Buffer.from('a\u009d52;c;QQ\u009cb'));
    rec.write(Buffer.from('\x1b]52;c;QQ\x07z').toString('hex'), 'hex');
    const bytes = Buffer.from('q\x1b]0;t\x07r');
    expect(bytes.length).toBe(8);
    const fresh = new ArrayBuffer(bytes.length);
    new Uint8Array(fresh).set(bytes);
    rec.write(new Uint16Array(fresh));
    expect(rec.calls.map((args) => typeof args[0])).toEqual(['string', 'string', 'string', 'string', 'string']);
    expect(rec.text()).toBe('caféabzqr');
  });

  it('6: WHEN the App with two plain notes is rendered unguarded through Ink\'s real render (`isScreenReaderEnabled: false`) and `\\r`, `v`, Escape, `t`, `j`, Escape, `?`, `?`, `/`, `o`, Escape, `i`, `Z`, Escape, `y` are written 45 ms apart and then the App is unmounted THEN replaying the recorded chunks through a newly wrapped recorder gives text identical to the unguarded joined text.', async () => {
    const store = seedTwoPlainNotes();
    const { stream: stdout, chunks } = makeStdout();
    const { stream: stdin, send } = makeStdin();
    const savedCi = process.env.CI;
    delete process.env.CI;
    const { unmount } = render(<App store={store} width={100} height={30} />, {
      stdout,
      stdin,
      patchConsole: false,
      exitOnCtrlC: false,
      isScreenReaderEnabled: false,
      interactive: true,
    });
    try {
      for (let n = 0; n < 100 && !chunks.join('').includes('first body'); n += 1) await wait(10);
      for (const key of ['\r', 'v', '\x1b', 't', 'j', '\x1b', '?', '?', '/', 'o', '\x1b', 'i', 'Z', '\x1b', 'y']) {
        send(key);
        await wait(45);
      }
    } finally {
      unmount();
      if (savedCi === undefined) delete process.env.CI;
      else process.env.CI = savedCi;
    }
    await wait(20);
    const unguarded = chunks.join('');
    const replay = wrappedRecorder();
    for (const chunk of chunks) replay.write(chunk);
    expect(unguarded).toContain('first body');
    expect(unguarded).toContain('\x1b[?25h');
    expect(replay.text()).toBe(unguarded);
  }, 3000);
});
