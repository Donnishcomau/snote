/**
 * T414 — security hardening, step 2 of 2 (F068 / S4-05, wiring part):
 * snote also writes to stderr through the output guard.
 *
 * Ink's `patchConsole` routes `console.error`/`console.warn` to stderr,
 * and `debug` writes server-supplied ids there, so stderr needs the same
 * `guardOutputStream` wrap main() installs on stdout. Line 1 proves the
 * guard drops an OSC 52 smuggled through Ink's patched `console.error`
 * while the plain words still get through; line 2 pins the wiring in
 * src/cli/main.tsx.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { render } from 'ink';

import { guardOutputStream } from '../../src/core/output-guard';

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
  [key: string]: unknown;
}

const asStream = (fake: object): never => fake as never;

/** Recording stream wrapped in the guard — the main() wrap under test. */
function makeGuardedStream(): { stream: never; chunks: string[] } {
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

/** Fake TTY stdin so Ink's plumbing starts normally; nothing is typed. */
function makeStdin(): never {
  const emitter = new EventEmitter();
  const fake = emitter as unknown as FakeStream;
  fake.isTTY = true;
  fake.setEncoding = () => undefined;
  fake.setRawMode = () => undefined;
  fake.resume = () => undefined;
  fake.pause = () => undefined;
  fake.ref = () => undefined;
  fake.unref = () => undefined;
  fake.read = () => null;
  fake.write = () => true;
  return asStream(fake);
}

/**
 * Poll until `check()` holds or the deadline passes, then assert once.
 * Every value the test asserts is inside `check()`, so a slow console
 * patch never races an assertion.
 */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (check()) return;
    if (Date.now() >= end) {
      expect(check()).toBe(true);
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

const SMUGGLE = 'note says \x1b]52;c;UFdORUQ=\x07 \x1bc end';

describe('T414 — stderr passes through the output guard', () => {
  it("1: WHEN an Ink component calls `console.error('note says \\x1b]52;c;UFdORUQ=\\x07 \\x1bc end')` in an effect, rendered with `patchConsole: true` and fake stdout and stderr both wrapped by `guardOutputStream` THEN the stderr text contains `note says` and `end` and contains no `\\x1b]`, no `\\x1bc` and no `\\x07`.", async () => {
    const { stream: stdout, chunks: outChunks } = makeGuardedStream();
    const { stream: stderr, chunks: errChunks } = makeGuardedStream();

    const Smuggler = (): React.ReactElement | null => {
      React.useEffect(() => {
        console.error(SMUGGLE);
      }, []);
      return null;
    };

    const { unmount } = render(React.createElement(Smuggler), {
      stdout,
      stderr,
      stdin: makeStdin(),
      patchConsole: true,
      exitOnCtrlC: false,
    });

    try {
      // Everything asserted lives inside the polling condition, so a
      // late console write cannot race the expectations.
      await until(() => {
        const err = errChunks.join('');
        return (
          err.includes('note says') &&
          err.includes('end') &&
          !err.includes('\x1b]') &&
          !err.includes('\x1bc') &&
          !err.includes('\x07')
        );
      });
      const err = errChunks.join('');
      expect(err).toContain('note says');
      expect(err).toContain('end');
      expect(err).not.toContain('\x1b]');
      expect(err).not.toContain('\x1bc');
      expect(err).not.toContain('\x07');
      // stdout got Ink's frames; the OSC bytes never reached it either.
      expect(outChunks.join('')).not.toContain('\x1b]');
    } finally {
      try {
        unmount();
      } catch {
        // Ink may throw when tearing a fake TTY down; nothing depends on it.
      }
    }
  });

  it('2: WHEN src/cli/main.tsx is read THEN `guardOutputStream(process.stderr)` comes after `guardOutputStream(process.stdout)` and before `const { waitUntilExit, unmount, clear } = render(`, and exactly `3` lines contain `OMARCHY`.', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const stdoutAt = src.indexOf('guardOutputStream(process.stdout)');
    const stderrAt = src.indexOf('guardOutputStream(process.stderr)');
    const renderAt = src.indexOf('const { waitUntilExit, unmount, clear } = render(');
    expect(stdoutAt).toBeGreaterThan(-1);
    expect(stderrAt).toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(-1);
    expect(stdoutAt).toBeLessThan(stderrAt);
    expect(stderrAt).toBeLessThan(renderAt);
    const markerLines = src.split('\n').filter((line) => line.includes('OMARCHY'));
    expect(markerLines).toHaveLength(3);
  });
});
