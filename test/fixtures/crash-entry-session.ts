// T232 — mirrors crash-entry.ts's contract (throw `new Error('kaboom')` and
// exit 1, state dir from process.argv[2], XDG_STATE_HOME decides where the
// crash file lands) but seeds a session first: two notes ('Hello' = 5 chars,
// 'Hi there' = 8 chars), one tag ('work') and two recorded key presses
// ('j', 'k'), so the crash-*.json's `session` field is a redacted recipe of
// that moment. Bundled with scripts/build.mjs, then run as: node <outfile>
// <state-dir>.
//
// main()'s crash handler is the writer of the file, so the seed is placed
// where main() itself reads it: the notes/tag go through a store built with
// stubClient and are persisted with saveState into the account folder, and a
// saved token (saveToken) makes Root log in at start-up, so main()'s own
// makeStoreFor builds lastStore from that state before Boom throws. The keys
// land in T231's module-scope log via recordKeyEvent, which main() reads via
// getKeyLog(). sessionSnapshot then sees counts, note lengths and key
// presses — never note content.
//
// Ordering facts this fixture relies on (same as crash-entry.ts): Boom's
// throw reaches the handler as a real `uncaughtException` macrotask, and a
// raw-mode error escaping a piped-stdin render is known noise to swallow —
// main()'s own handler already ignores it, so no extra handler here.

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { render } from 'ink';

import { main } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { accountDir, saveToken } from '../../src/core/token';
import { resetKeyLog, recordKeyEvent } from '../../src/tui/app-keys';
// OMARCHY: boundary cast — the vendored tag reducer hashes the action's
// tagName through a Brand-typed `tagHashOf`, so a plain string needs a cast.
import { tagHashOf as tagHash } from '../../vendor/simplenote/utils/tag-hash';
import type { EntityId, TagHash, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (s: string): TagName => s as TagName;

// OMARCHY: boundary cast — the vendored tag reducer keys `data.tags` by a
// Brand-typed TagHash; derive it through its own `tagHashOf` so the entry
// stays typed at its boundary.
const workHash = tagHash(tname('work')) as TagHash;
const store = makeStore({ stubClient: {} });
store.dispatch({
  type: 'CREATE_NOTE_WITH_ID',
  noteId: eid('note-1'),
  note: { content: 'Hello', systemTags: [], tags: [] },
} as never);
store.dispatch({
  type: 'CREATE_NOTE_WITH_ID',
  noteId: eid('note-2'),
  note: { content: 'Hi there', systemTags: [], tags: [] },
} as never);
store.dispatch({
  type: 'ADD_NOTE_TAG',
  noteId: eid('note-1'),
  // OMARCHY: boundary cast — the vendored action type wants a Brand-typed TagName.
  tagName: tname('work'),
} as never);
// Pre-seed the 'work' tag in data.tags: ADD_NOTE_TAG fills noteTags and the
// note's tags, while the tags map itself is normally filled by the sync
// middleware from the wire (TAG_BUCKET_UPDATE). sessionSnapshot counts
// data.tags, so the recipe records the tag existing at crash time.
store.dispatch({
  type: 'REMOTE_TAG_UPDATE',
  // OMARCHY: boundary cast — vendored Brand types at the fixture boundary.
  tagHash: workHash,
  tag: { name: tname('work') },
} as never);

function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

const rawModeNoise = /Raw mode is not supported/;

const dataDir = process.argv[2];
if (dataDir) {
  // Clear any module-scope key log left by an imported module's start-up
  // side effect, then record exactly the two presses the recipe wants.
  resetKeyLog();
  recordKeyEvent('j', {} as never, false);
  recordKeyEvent('k', {} as never, false);
  const auth = { email: 'seed@snote.test', token: 'seed-token' };
  // The token makes Root log in at start-up, so main() builds its own
  // account store (and lastStore) from the seeded state.json below.
  await saveToken(dataDir, auth);
  fs.mkdirSync(accountDir(dataDir, auth.email), { recursive: true });
  saveState(store.getState(), accountDir(dataDir, auth.email));
}

const running = main(dataDir ? ['--data-dir', dataDir] : []);

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
