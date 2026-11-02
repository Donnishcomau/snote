// #17 — like crash-entry.ts, but the mode is screen-reader (`--screen-reader`)
// and the thrown error carries the hostile corpus in its message.
import React from 'react';
import { render } from 'ink';

import { main } from '../../src/cli/main';
import { hostileText } from './hostile';

function Boom(): React.ReactElement {
  throw new Error(hostileText('CRASHMSG'));
}

const rawModeNoise = /Raw mode is not supported/;

const dataDir = process.argv[2];
const running = main(['--screen-reader', ...(dataDir ? ['--data-dir', dataDir] : [])]);

process.on('uncaughtException', (err: unknown) => {
  const message = String((err as Error | undefined)?.message ?? err);
  if (rawModeNoise.test(message)) return;
  process.stderr.write('FATAL (handler missed)\n');
  process.exit(1);
});

setTimeout(() => {
  try {
    render(React.createElement(Boom));
  } catch (err) {
    if (rawModeNoise.test(String((err as Error | undefined)?.message ?? err))) return;
    process.emit('uncaughtException', err as Error);
  }
}, 0);

await running;
