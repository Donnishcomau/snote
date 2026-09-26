// T162 — a real repo file (so the repo's "type": "module" rule applies to
// its imports) proving the BUNDLED sync path works against the fake server.
// Bundled with scripts/build.mjs, then run as: node <outfile> <serverUrl> <dataDir>

import { mkdirSync } from 'node:fs';

import { buildStore } from '../../src/cli/main';
import { waitForNotes } from '../../src/core/store';

const url = process.argv[2];
const dataDir = process.argv[3];

try {
  mkdirSync(dataDir, { recursive: true });
  const { store, stopSaving } = buildStore(
    { dataDir, appId: 'test-app', server: url, noteEditDelayMs: 10 },
    { email: 'test@example.com', token: 'test-token' },
    () => {}
  );
  await waitForNotes(store, 5000);
  console.log(`notes=${store.getState().data.notes.size}`);
  stopSaving();
  process.exit(0);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`error: ${message}`);
  process.exit(1);
}
