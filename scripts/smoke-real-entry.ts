// T20 — the body of `npm run smoke:real`, bundled by scripts/smoke-real.mjs
// through scripts/build.mjs and run as: node <outfile> --server <ws-url>
//
// Reads the throwaway account's credentials from the environment (never from
// argv, so nothing lands in `ps` output), and walks ONE note through its
// whole life: create, edit, tag, trash, delete forever — then waits until
// the server has acknowledged every change, so the account is left exactly
// as it was found.
//
// esbuild rewrites every import below into this file, so the path shape
// mirrors test/fixtures/bundle-sync-entry.ts.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { buildStore } from '../src/cli/main';
import { waitForNotes } from '../src/core/store';
import { loginWithPassword } from '../src/core/auth';
import { pendingCount } from '../src/core/simperium-reducer';

import type * as A from '@vendor/state/action-types';
import type * as T from '@vendor/types';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const email = process.env.SNOTE_TEST_EMAIL;
const password = process.env.SNOTE_TEST_PASSWORD;
const server = flagValue('--server');
const appId = process.env.SNOTE_APP_ID ?? 'chalk-bump-f49';

async function main(): Promise<void> {
  if (!email || !password) {
    throw new Error('missing SNOTE_TEST_EMAIL or SNOTE_TEST_PASSWORD');
  }
  if (!server) {
    throw new Error('missing --server <url>');
  }

  // 1. Auth. loginWithPassword is env-driven: SNOTE_AUTH_BASE redirects its
  //    AUTH_BASE (src/core/config.ts), so a TEST can point the auth call at
  //    the very same fake server that gets --server below.
  const token = await loginWithPassword(email, password);

  // 2. A store of its own in a throwaway data dir: inside the temp dir the
  //    wrapper already made (and will remove) when it gave us one, else our
  //    own under the tmpdir.
  const base =
    process.env.SNOTE_SMOKE_TMP ?? mkdtempSync(join(tmpdir(), 'snote-smoke-'));
  const dataDir = mkdtempSync(join(base, 'data-'));
  const { store, stopSaving } = buildStore(
    { dataDir, appId, server, noteEditDelayMs: 10 },
    { email, token },
    () => {}
  );

  try {
    // The channel is open once the store reports connected, or the moment
    // the first notes arrive; whichever comes first.
    await waitForNotes(store, 20000).catch(() => {
      if (!store.getState().simperium.connected) {
        throw new Error('simperium connection did not open');
      }
    });

    const id = randomUUID();
    const noteId = id as unknown as T.EntityId;
    const content = 'snote-smoke-' + Date.now();

    // 3. Create.
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: { content, systemTags: [], tags: [] },
    } as unknown as A.ActionType);
    console.log(`smoke-real: note=${id}`);
    console.log('smoke-real: created');

    // 4. Edit (append a line).
    const stored = store.getState().data.notes.get(noteId)!;
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId,
      changes: { content: stored.content + '\nsmoke-real edited' },
    } as unknown as A.ActionType);
    console.log('smoke-real: edited');

    // 5. Tag.
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId,
      tagName: 'smoke-test' as unknown as T.TagName,
    } as unknown as A.ActionType);
    console.log('smoke-real: tagged');

    // 6. Trash.
    store.dispatch({ type: 'TRASH_NOTE', noteId } as unknown as A.ActionType);
    console.log('smoke-real: trashed');

    // 7. Delete forever (the vendored data reducer drops it synchronously).
    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId } as unknown as A.ActionType);
    console.log('smoke-real: deleted');

    // 8. One poll, until the server has acknowledged the last change; from
    //    then on the account holds no trace of the note.
    const deadline = Date.now() + 20000;
    while (pendingCount(store.getState().simperium) !== 0) {
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for the delete to sync');
      }
      await sleep(50);
    }

    console.log('smoke-real: ok');
    stopSaving();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    // The message may echo the auth server's response; the password must
    // never appear in it.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`error: ${message}`);
    process.exit(1);
  }
);
