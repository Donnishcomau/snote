/**
 * T296 — a queued local edit can be lost for good on reconnect.
 *
 * Repro: store1's socket is dropped (`server.dropClient`) and it queues an
 * offline edit; store2 (still online) edits the same note and syncs it to
 * the server. On reconnect, `onAuth` (channel.js:609-637) used to flush the
 * local queue and resend in-flight changes BEFORE the catch-up reply's OT
 * rebase (`updateObjectVersion`, channel.js:100-142) could run, so the
 * stale-`sv` resend hit the fake server's 405 "invalid version" reply and
 * the crude full-object resend clobbered store2's remote edit. With
 * `installSimperiumReconnectFix` (wired in `src/core/store.ts`) both
 * flushes wait for the network queue to drain, so the rebase merges and
 * BOTH edits land.
 *
 * Fixture: FakeSimperiumServer (rejects stale-`sv` modifies with 405,
 * applies full-object `d` resends) seeded per scenario, one `buildStore`
 * per account with a fresh temp dataDir, mirroring
 * `simperium-version-fix-strict.test.ts`'s setup/teardown.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

vi.setConfig({ testTimeout: 10000 });

const APP_ID = 'test-app';
// The fake server derives conn.email from the TOKEN (handleInit), so
// dropClient(email) only matches when each account has its own token.
const TOKEN_FOR: Record<string, string> = {
  'store1@example.com': 'store1-token',
  'store2@example.com': 'store2-token',
};

function noteData(content: string): Record<string, unknown> {
  const now = Date.now();
  return {
    content,
    creationDate: now,
    deleted: 0,
    modificationDate: now,
    systemTags: [],
    tags: [],
  };
}

/** Poll every 50 ms up to `timeoutMs` (never sleeps past a poll step). */
async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  label: string
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

interface Account {
  email: string;
  dir: string;
  store: ReturnType<typeof buildStore>['store'];
  stopSaving: () => void;
}

const accounts: Account[] = [];

/**
 * One online account against the running fake server, with a fresh temp
 * dataDir; waits for the initial index of `seedIds`.
 */
async function account(
  server: FakeSimperiumServer,
  email: string,
  seedIds: string[]
): Promise<Account> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t296-'));
  const { store, stopSaving } = buildStore(
    { dataDir: dir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email, token: TOKEN_FOR[email] ?? email },
    () => {}
  );
  const a: Account = { email, dir, store, stopSaving };
  accounts.push(a);
  await waitFor(
    () => seedIds.every((id) => store.getState().data.notes.has(id as never)),
    5000,
    `initial index of ${seedIds.join(', ')} for ${email}`
  );
  return a;
}

const count = (a: Account): number => pendingCount(a.store.getState().simperium);
const serverEntry = (server: FakeSimperiumServer, id: string) =>
  server.getObject(APP_ID, 'note', id);
const serverContent = (server: FakeSimperiumServer, id: string): string =>
  (serverEntry(server, id)?.data.content as string) ?? '';

function editNote(id: string, content: string) {
  return {
    type: 'EDIT_NOTE' as never,
    noteId: id as never,
    changes: { content } as never,
  };
}

let server: FakeSimperiumServer;

beforeEach(async () => {
  server = new FakeSimperiumServer();
  await server.start();
});

afterEach(async () => {
  for (const a of accounts.splice(0)) {
    a.stopSaving();
    rmSync(a.dir, { recursive: true, force: true });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  server.stop();
});

describe('T296 reconnect does not lose a queued local edit', () => {
  it('1: WHEN store2 syncs EDIT_NOTE on note race1 setting content to "line1\\nB-EDIT-ONLINE", store1 is dropped via server.dropClient after queuing an offline EDIT_NOTE on race1 to "A-EDIT-OFFLINE\\nline2", and store1 reconnects THEN within 10 s the server\'s race1 content contains both "A-EDIT-OFFLINE" and "B-EDIT-ONLINE", and store1\'s pendingCount is 0', async () => {
    server.seedBucket(APP_ID, 'note', [{ id: 'race1', data: noteData('line1\nline2') }]);
    const store2 = await account(server, 'store2@example.com', ['race1']);
    const store1 = await account(server, 'store1@example.com', ['race1']);

    // store1 drops first, then queues its offline edit on the same note
    // (the brief's Decisions order: A offline -> A edits -> B edits online
    // while A is still dropped, which is what creates the stale-sv race).
    server.dropClient('store1@example.com');
    store1.store.dispatch(editNote('race1', 'A-EDIT-OFFLINE\nline2'));
    await waitFor(() => count(store1) === 1, 3000, 'store1 queued edit pending');

    // store2 edits while store1 is still dropped: the server takes the
    // change and store1 never sees it live.
    store2.store.dispatch(editNote('race1', 'line1\nB-EDIT-ONLINE'));
    await waitFor(
      () => serverContent(server, 'race1') === 'line1\nB-EDIT-ONLINE' && count(store2) === 0,
      5000,
      "server race1 'line1\\nB-EDIT-ONLINE' from store2"
    );

    // store1's socket reconnects (~3 s, ReconnectionTimer); both land.
    await waitFor(
      () => {
        const content = serverContent(server, 'race1');
        return (
          content.includes('A-EDIT-OFFLINE') &&
          content.includes('B-EDIT-ONLINE') &&
          count(store1) === 0
        );
      },
      8000,
      "server race1 has BOTH 'A-EDIT-OFFLINE' and 'B-EDIT-ONLINE', store1 pendingCount 0"
    );

    const content = serverContent(server, 'race1');
    expect(content).toContain('A-EDIT-OFFLINE');
    expect(content).toContain('B-EDIT-ONLINE');
    expect(count(store1)).toBe(0);
  });

  it('2: WHEN store1 queues a DELETE_NOTE_FOREVER for note race2 while dropped by server.dropClient and then reconnects THEN within 10 s the server has no entry for race2 and store1\'s pendingCount is 0', async () => {
    server.seedBucket(APP_ID, 'note', [
      { id: 'race2', data: noteData('delete me') },
      { id: 'keeper', data: noteData('keep me') },
    ]);
    const store1 = await account(server, 'store1@example.com', ['race2', 'keeper']);

    server.dropClient('store1@example.com');
    // Queued deletes are tracked via tombstones, never via pendingNotes,
    // so there is no "1 pending" state to wait for; go straight to the
    // post-reconnect expectations.
    store1.store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'race2' as never });

    await waitFor(
      () => serverEntry(server, 'race2') === undefined && count(store1) === 0,
      8000,
      'server race2 removed, store1 pendingCount 0'
    );

    expect(serverEntry(server, 'race2')).toBeUndefined();
    // The other note is untouched by the deferred resend.
    expect(serverEntry(server, 'keeper')).toBeDefined();
    expect(count(store1)).toBe(0);
  });

  it('3: WHEN store1 is dropped via server.dropClient with no other client having changed anything, then reconnects THEN within 3 s the server\'s untouched note race3 content is unchanged and store1\'s pendingCount is 0', async () => {
    server.seedBucket(APP_ID, 'note', [{ id: 'race3', data: noteData('stay') }]);
    const store1 = await account(server, 'store1@example.com', ['race3']);
    const before = serverEntry(server, 'race3');

    server.dropClient('store1@example.com');

    await waitFor(
      () =>
        serverContent(server, 'race3') === 'stay' &&
        serverEntry(server, 'race3')?.version === before?.version &&
        count(store1) === 0,
      3000,
      "race3 unchanged ('stay'), store1 pendingCount 0"
    );

    expect(serverContent(server, 'race3')).toBe('stay');
    expect(serverEntry(server, 'race3')?.version).toBe(before?.version);
    expect(count(store1)).toBe(0);
  });
});
