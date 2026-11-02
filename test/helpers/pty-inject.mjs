// #414: test preload for the pty hostile-corpus test (node --import). Loaded only by the injection run. When the
// driver sends SIGUSR2 (after the note-list marker is on the screen, so main has already wrapped stdout with the
// output guard) it writes the payload file once, with process.stdout.write, so the bytes take the layer-2 path
// that no note text reaches (the layer-1 sink sanitisers clean every note first).
import { readFileSync } from 'node:fs';

let done = false;
process.on('SIGUSR2', () => {
  if (done) return;
  done = true;
  const file = process.env.SNOTE_PTY_PAYLOAD;
  if (file) process.stdout.write(readFileSync(file));
});
