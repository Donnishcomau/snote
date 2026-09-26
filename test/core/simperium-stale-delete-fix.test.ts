/**
 * T301 — a note deleted forever on the server while this client was
 * offline must NOT survive that client's next full re-index.
 *
 * Repro without a second live client (avoids the pre-existing
 * `bucket.js:196-198`/`433-442` remove echo — a separate bug, out of
 * scope here): `FakeSimperiumServer.removeFromIndex` deletes `noteX`
 * from the bucket's index with NO `log` entry and no broadcast — a
 * removal whose change-log entry has rotated out of history. Then the
 * account dir's `ghosts-note.json` top-level `cv` field (the
 * FileGhostStore file format, `ghosts-<bucket>.json`) is overwritten
 * with the string `not-a-number`, so the restarted client sends
 * `cv:not-a-number`, the fake server's `handleCV` answers `cv:?` like
 * the real one, and `Channel.prototype.onChangeVersion`
 * (channel.js:717-724) drives the channel into `startIndexing()`.
 *
 * The reconciliation itself is `installSimperiumStaleDeleteFix`
 * (`src/core/simperium-stale-delete-fix.ts`, re-exported from
 * `src/core/store.ts`), which `makeStore` wires at startup and which
 * the test attaches to the live client with `forceIndex` below. On each
 * completed `'index'` it removes every local note the index never
 * confirmed, sparing ids with unsynced local work
 * (`simperium.pendingNotes`).
 *
 * Both stores use the `store1-token` / `store1@example.com` pair from
 * the fake server's `VALID_TOKENS`, and each `buildStore` is handed the
 * account dir verbatim (`state.json` / `ghosts-note.json` live at the
 * top of it) — the same contract as `test/cli/build-store.test.ts`.
 * Every store is fully closed (`stopSaving()` then `store.stopSync()`,
 * then a settle) before the next one opens on the same dir, so no two
 * clients are ever connected at once.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';// The very function makeStore wires at startup (re-exported from
// src/core/store.ts); attached to the live client to force the
// full-re-index path this task is about.
import { installSimperiumStaleDeleteFix } from '../../src/core/store';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';

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

/** Poll every 25 ms until `cond()` holds; throw with `label` once `timeoutMs` elapses. */
async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

type Built = ReturnType<typeof buildStore>;
type AnyBucket = { name?: string; channel?: { send?: (line: string) => void } };

/** Open the real startup path on `dir`. `dir` IS the account dir (the
 * `dir`-as-account-dir contract of test/cli/build-store.test.ts), so
 * `state.json` and `ghosts-note.json` live at the top of it. */
function open(dataDir: string, server: FakeSimperiumServer): Built {
  return buildStore(
    { dataDir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
}

/**
 * Open a second client for the same account on its own fresh `dir`, and
 * hand it a bashed `cv` of `not-a-number` before any auth reply runs
 * (awaited, so the server's `init` reply is guaranteed to see it): the
 * first `init(null)` branch (channel.js `onAuth`) then answers
 * `cv:not-a-number` with `cv:?` and `Channel.prototype.onChangeVersion`
 * calls `startIndexing()` with `data.notes` still empty — the client
 * never synced and knows nothing of anything deleted while it was
 * offline.
 */
async function reopenBlind(srv: FakeSimperiumServer): Promise<{ built: Built; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t301-reopen-'));
  tempDirs.push(dir);
  const built = open(dir, srv);
  await waitFor(() => bucketsOf(built).some((b) => b.name === 'note'), 2000, 'second client ready');
  const note = bucketsOf(built).find((b) => b.name === 'note');
  // OMARCHY: boundary cast — the channel's ghost store is untyped here.
  const ghostStore = (note as unknown as { channel?: { store?: { setChangeVersion?: (cv: string) => Promise<unknown> } } })
    .channel?.store;
  expect(ghostStore?.setChangeVersion).toBeDefined();
  await ghostStore?.setChangeVersion?.('not-a-number');
  return { built, dir };
}

/** Fully close a store: stop the disk writer, then close the socket. */
async function close(built: Built): Promise<void> {
  built.stopSaving();
  built.store.stopSync?.();
  // let the socket finish closing before the next client opens
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Write an account dir holding `ids` in `state.json` (the real
 * persistence format) and nothing in `ghosts-note.json` (no ghosts, and
 * top-level `cv: 'not-a-number'`, so the channel's first cv report is
 * unknown and the server answers `cv:?` → `startIndexing()`), then open
 * the real startup path on it. The client starts knowing every id in
 * `ids` with none of it synced — exactly the state a long-offline
 * client comes back with.
 */
function seedDir(ids: [string, Record<string, unknown>][], srv: FakeSimperiumServer): Built {
  const dataDir = mkdtempSync(join(tmpdir(), 'snote-t301-'));
  tempDirs.push(dataDir);
  writeFileSync(
    join(dataDir, 'state.json'),
    JSON.stringify({ version: 1, data: { notes: { __map: ids } } })
  );
  writeFileSync(join(dataDir, 'ghosts-note.json'), JSON.stringify({ cv: 'not-a-number', ghosts: [] }));
  return open(dataDir, srv);
}

const hasNote = (store: Built['store'], id: string) =>
  store.getState().data.notes.has(id as never);

const noteContent = (store: Built['store'], id: string) =>
  store.getState().data.notes.get(id as never)?.content;

/** The buckets of a built store's live sync client. */
function bucketsOf(built: Built): AnyBucket[] {
  // OMARCHY: boundary cast — the sync client is deliberately untyped on store.
  const client = (built.store as unknown as { client?: { buckets?: AnyBucket[] } }).client;
  const buckets = client?.buckets;
  expect(Array.isArray(buckets)).toBe(true);
  return buckets as AnyBucket[];
}

/**
 * Force the full re-index by bashing the change version, exactly what a
 * long-offline client sends on reconnect: the channel's ghost store
 * (the FileGhostStore built on `dataDir`) gets `cv: 'not-a-number'` and
 * persists it to `ghosts-note.json`'s top-level `cv` field at once; the
 * channel then sends `cv:not-a-number`, the fake server's `handleCV`
 * answers any non-numeric cv with `cv:?`, and
 * `Channel.prototype.onChangeVersion` calls `startIndexing()`. The
 * reconciliation itself is wired by `makeStore` at startup, so nothing
 * needs to be attached here.
 */
function forceIndex(built: Built, dataDir: string): void {
  const ghostsPath = join(dataDir, 'ghosts-note.json');
  const note = bucketsOf(built).find((b) => b.name === 'note');
  expect(note).toBeDefined();
  // OMARCHY: boundary cast — the channel's ghost store is untyped here.
  const ghostStore = (note as unknown as { channel?: { store?: { setChangeVersion?: (cv: string) => Promise<void> } } })
    .channel?.store;
  expect(ghostStore?.setChangeVersion).toBeDefined();
  void ghostStore?.setChangeVersion?.('not-a-number');
  // the ghost file must show the bashed cv before the cv request rides
  // out on its promise chain — a no-op here would silently skip the
  // re-index instead of proving it.
  waitFor(
    () => {
      try {
        return (JSON.parse(readFileSync(ghostsPath, 'utf8')) as { cv: unknown }).cv === 'not-a-number';
      } catch {
        return false;
      }
    },
    2000,
    'ghosts-note.json cv overwritten with not-a-number'
  );
  note?.channel?.send?.('cv:not-a-number');
}

const tempDirs: string[] = [];
let server: FakeSimperiumServer | undefined;

async function startServer(): Promise<FakeSimperiumServer> {
  server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'noteX', data: noteData('X'), version: 1 },
    { id: 'noteY', data: noteData('Y'), version: 2 },
  ]);
  return server;
}

/** Connect, sync both notes onto disk, fully close. Returns the account dir. */
async function seedAndClose(srv: FakeSimperiumServer): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), 'snote-t301-'));
  tempDirs.push(dataDir);
  const a1 = open(dataDir, srv);
  await waitFor(
    () => hasNote(a1.store, 'noteX') && hasNote(a1.store, 'noteY'),
    2000,
    'first sync of noteX and noteY'
  );
  // state.json only hits disk while a1 is still open
  await waitFor(
    () => {
      try {
        readFileSync(join(dataDir, 'state.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    },
    2000,
    'state.json written'
  );
  await close(a1);
  return dataDir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  await new Promise((r) => setTimeout(r, 50));
  server?.stop();
  server = undefined;
});

describe('T301 stale delete survives a full re-index', () => {
  it('1: WHEN store A syncs `noteX` and `noteY`, fully closes, the server removes `noteX` via `removeFromIndex` with no log entry, `ghosts-note.json`\'s `cv` is overwritten to `not-a-number`, and store A restarts on the same `dataDir` THEN within `3` s `data.notes` has `noteY` with content `Y` and does not have `noteX`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    // A removal whose change-log entry rotated out: no `log` entry, no
    // broadcast — only a full re-index can reveal it.
    srv.removeFromIndex(APP_ID, 'note', 'noteX');

    // `ghosts-note.json`'s `cv` is overwritten to `not-a-number` — the
    // FileGhostStore's persisted change version, which the ghost store
    // loads at construction and reports as its first cv.
    const ghostsPath = join(dataDir, 'ghosts-note.json');
    const ghostFile = JSON.parse(readFileSync(ghostsPath, 'utf8')) as {
      cv?: unknown;
      ghosts: { key: string }[];
    };
    ghostFile.cv = 'not-a-number';
    writeFileSync(ghostsPath, JSON.stringify(ghostFile));

    // Store A restarts on the same dataDir: `state.json` preloads
    // noteX/noteY, the unknown first cv is answered `cv:?`, and
    // `onChangeVersion` drives the channel into a full re-index.
    const a2 = open(dataDir, srv);
    try {
      await waitFor(
        () => bucketsOf(a2).some((b) => b.name === 'note'),
        2000,
        'restart gets its note channel'
      );

      // The fix's only observable effect: the completed re-index drops
      // noteX — the one id the index never carried.
      await waitFor(
        () => !hasNote(a2.store, 'noteX') && hasNote(a2.store, 'noteY'),
        2500,
        're-index drops noteX while noteY survives'
      );

      // Final assertions, inside the line's 3 s budget: noteY is still
      // there with content `Y`, noteX is gone.
      expect(hasNote(a2.store, 'noteY')).toBe(true);
      expect(noteContent(a2.store, 'noteY')).toBe('Y');
      expect(hasNote(a2.store, 'noteX')).toBe(false);
    } finally {
      await close(a2);
    }
  }, 10000);

  it('2: WHEN, after step 1\'s close but before restart, `state.json` gains a third note `noteZ` with content `Z` and no matching ghost entry (an offline local create never synced), and store A restarts under the same forced-unknown-`cv` re-index THEN within `3` s `data.notes` has `noteZ` with content `Z` unchanged', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    srv.removeFromIndex(APP_ID, 'note', 'noteX');

    // step 1's close happened before this. `state.json` gains the third
    // note `noteZ` with content `Z`; `ghosts-note.json` gets no ghost
    // entry for it (an offline local create that never synced) and its
    // `cv` is overwritten to `not-a-number` — the same forced-unknown-cv
    // re-index of acceptance line 1.
    const statePath = join(dataDir, 'state.json');
    const ghostsPath = join(dataDir, 'ghosts-note.json');
    const stateFile = JSON.parse(readFileSync(statePath, 'utf8')) as {
      data: { notes: { __map: [string, unknown][] } };
    };
    expect(stateFile.data.notes.__map.map(([id]) => id).sort()).toEqual([
      'noteX',
      'noteY',
    ]);
    const ghostFile = JSON.parse(readFileSync(ghostsPath, 'utf8')) as {
      cv?: unknown;
      ghosts: { key: string }[];
    };
    const ghostIds = ghostFile.ghosts.map((g) => g.key);
    expect(ghostIds).toContain('noteX');
    expect(ghostIds).not.toContain('noteZ');
    stateFile.data.notes.__map.push(['noteZ', noteData('Z')]);
    writeFileSync(statePath, JSON.stringify(stateFile));
    ghostFile.cv = 'not-a-number';
    writeFileSync(ghostsPath, JSON.stringify(ghostFile));

    // Store A restarts on the same dataDir: `state.json` preloads all
    // three notes, the unknown first cv is answered `cv:?`, and the
    // channel runs the full re-index with the local queue paused.
    const a2 = open(dataDir, srv);
    try {
      await waitFor(
        () => bucketsOf(a2).some((b) => b.name === 'note'),
        2000,
        'restart gets its note channel'
      );

      // The noteZ assertions inside the poll: `noteZ` holds no ghost, so
      // `requeueUnsynced` (T85) re-queues it into `pendingNotes` — the
      // one set the stale-delete diff must spare — and it survives the
      // completed re-index with content `Z` unchanged. `noteX` is only
      // absent once the diff has actually run.
      await waitFor(
        () => !hasNote(a2.store, 'noteX') && bucketsOf(a2).some((b) => b.name === 'note'),
        2000,
        'restart gets its note channel'
      );

      // Hold the end state across the settle window (the queued noteZ
      // create round-trips and acks after the diff ran): noteZ stays
      // with content `Z` and noteX stays gone.
      const settleEnd = Date.now() + 600;
      while (Date.now() < settleEnd) {
        expect(hasNote(a2.store, 'noteZ')).toBe(true);
        expect(noteContent(a2.store, 'noteZ')).toBe('Z');
        expect(hasNote(a2.store, 'noteX')).toBe(false);
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      await close(a2);
    }
  }, 10000);
});
