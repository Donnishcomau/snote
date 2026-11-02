import { render as inkRender } from 'ink';
import { EventEmitter } from 'node:events';
import type React from 'react';

// A fake terminal that Ink treats as interactive (stdout.isTTY), unlike
// ink-testing-library's: only then does suspendTerminal() pause Ink's input.
class FakeOut extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  frames: string[] = [];
  write = (f: string) => {
    this.frames.push(f);
    return true;
  };
}
class FakeIn extends EventEmitter {
  isTTY = true;
  pending: string | null = null;
  write = (d: string) => {
    this.pending = d;
    this.emit('readable');
  };
  read = () => {
    const d = this.pending;
    this.pending = null;
    return d;
  };
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}
export function renderOnFakeTty(tree: React.ReactElement) {
  const stdout = new FakeOut();
  const stdin = new FakeIn();
  const app = inkRender(tree, {
    stdout: stdout as never,
    stderr: new FakeOut() as never,
    stdin: stdin as never,
    debug: true,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  return { unmount: app.unmount, stdin, frames: stdout.frames, lastFrame: () => stdout.frames[stdout.frames.length - 1] };
}
