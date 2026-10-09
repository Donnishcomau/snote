// T214 — a real entry that renders a component throwing `new Error('boom CONTENTMARK hunter2')`
// on its first render, proving main()'s crash handler catches a React render
// error in the BUNDLE and exits 1 with calm lines instead of a stack trace.
// Bundled with scripts/build.mjs, then run as: node <outfile> <state-dir> —
// the state dir arrives as process.argv[2] and is forwarded to main() as
// --data-dir (harmless here: Boom throws before the app reads any state),
// while XDG_STATE_HOME in the env decides where the crash file lands.
//
// Two ordering facts this fixture relies on:
// - A render throw in a component React has already committed (here Root
//   renders, then Boom mounts) is reported asynchronously through React's
//   global error reporter, which on modern Node runs it in a MACROTASK as a
//   real `uncaughtException` — it never propagates out of render().
// - With a piped stdin, Root's own useInput throws its raw-mode error in a
//   passive effect on the FIRST synchronous pass, escaping render() itself.
// The fixture's Boom render sits inside a macrotask scheduled before that
// first pass, so the boom CONTENTMARK hunter2 uncaughtException is queued first and wins the
// once-only handler race; the raw-mode error escaping render() is known
// noise the fixture swallows.

import React from 'react';
import { render } from 'ink';

import { main } from '../../src/cli/main';

function Boom(): React.ReactElement {
  throw new Error('boom CONTENTMARK hunter2');
}

const rawModeNoise = /Raw mode is not supported/;

const dataDir = process.argv[2];
const running = main(dataDir ? ['--data-dir', dataDir] : []);

process.on('uncaughtException', (err: unknown) => {
  const message = String((err as Error | undefined)?.message ?? err);
  if (rawModeNoise.test(message)) return; // piped-stdin noise from Root's useInput
  process.stderr.write('FATAL (handler missed): ' + message + '\n');
  process.exit(1);
});

setTimeout(() => {
  try {
    render(React.createElement(Boom));
  } catch (err) {
    if (rawModeNoise.test(String((err as Error | undefined)?.message ?? err))) {
      return; // the raw-mode error escaping render(): known noise
    }
    // Any other propagation goes through the same handler React's own
    // fallback reporter would use.
    process.emit('uncaughtException', err as Error);
  }
}, 0);

await running;
