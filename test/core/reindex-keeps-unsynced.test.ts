/**
 * T499 — a full re-index never removes an unsynced note, even for a
 * moment, and still sends it afterwards (F141).
 *
 * On a restart re-index the stale-delete diff
 * (src/core/simperium-stale-delete-fix.ts) deleted an offline-created
 * note (one with no ghost): `requeueUnsynced` (src/core/requeue.ts) holds
 * every unsynced note until the catch-up lands and dispatches nothing
 * before then, so `simperium.pendingNotes` is still empty when the index
 * completes and nothing spares the id. Requeue re-imported it 10-14 ms
 * later, but a quit, crash or state.json save inside that window lost the
 * note. The rig follows test/core/simperium-stale-delete-fix.test.ts: the
 * fake server on localhost, `buildStore` from src/cli/main.tsx as the real
 * start-up path, `removeFromIndex` as the removal whose log entry rotated
 * out, and the `cv` of `ghosts-note.json` bashed to `not-a-number` so the
 * restart's cv report is answered `cv:?` and drives a full re-index.
 *
 * The fixture trap (attempt 1): `noteX` and `noteY` MUST have real ghosts
 * before the files are edited — a state.json with no ghosts would make
 * `noteX` unsynced too, so requeue holds and (correctly) spares it, and
 * line 1 never sees it removed. So the first store really syncs both
 * notes onto disk, then closes, and only then do the edits happen.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';

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

/** The note-bucket channel of a built store's live client, via a typed local cast. */
interface ChannelLike {
  send?: (line: string) => void;
  store?: { setChangeVersion?: (cv: string) => Promise<unknown> };
}
interface BucketLike {
  name?: string;
  channel?: ChannelLike;
}
const bucketsOf = (store: Built['store']): BucketLike[] =>
  ((store as unknown as { client?: { buckets?: BucketLike[] } }).client ?? {}).buckets ?? [];

/** Open the real start-up path on `dir` (the account dir itself). */
function open(dataDir: string, server: FakeSimperiumServer): Built {
  return buildStore(
    { dataDir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
}

/** Fully close a store: stop the disk writer, then close the socket. */
async function close(built: Built): Promise<void> {
  built.stopSaving();
  built.store.stopSync?.();
  // let the socket finish closing before the next client opens
  await new Promise((r) => setTimeout(r, 50));
}

const hasNote = (store: Built['store'], id: string) =>
  store.getState().data.notes.has(id as never);

const noteContent = (store: Built['store'], id: string) =>
  store.getState().data.notes.get(id as never)?.content;

const tempDirs: string[] = [];
let server: FakeSimperiumServer | undefined;

async function startServer(): Promise<FakeSimperiumServer> {
  const srv = new FakeSimperiumServer();
  await srv.start();
  srv.seedBucket(APP_ID, 'note', [
    { id: 'noteX', data: noteData('X'), version: 1 },
    { id: 'noteY', data: noteData('Y'), version: 2 },
  ]);
  server = srv;
  return srv;
}

/**
 * Connect a store on a fresh dir, sync `noteX`/`noteY` (with real ghosts)
 * onto disk, wait for state.json, fully close. Returns the account dir.
 * This is what gives noteX/noteY their ghosts — without them noteX would
 * count as unsynced too and the re-index diff would (correctly) spare it.
 */
async function seedAndClose(srv: FakeSimperiumServer): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), 'snote-t499-'));
  tempDirs.push(dataDir);
  const a1 = open(dataDir, srv);
  await waitFor(
    () => hasNote(a1.store, 'noteX') && hasNote(a1.store, 'noteY'),
    2000,
    'first sync of noteX and noteY'
  );
  // state.json only hits disk while a1 is still open, and must list both
  await waitFor(
    () => {
      try {
        const ids = (
          JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8')) as {
            data: { notes: { __map: [string, unknown][] } };
          }
        ).data.notes.__map.map(([id]) => id);
        return ids.includes('noteX') && ids.includes('noteY');
      } catch {
        return false;
      }
    },
    2000,
    'state.json written with noteX and noteY'
  );
  await close(a1);
  return dataDir;
}

/**
 * The F141 restart: the server drops `noteX` from its index with no log
 * entry, `state.json` gains `noteZ` with content `Z` and no ghost entry
 * (an offline create that never synced), and `ghosts-note.json`'s `cv` is
 * bashed to `not-a-number` so the restart's first cv report is answered
 * `cv:?` and drives a full re-index. Returns the account dir; the caller
 * reopens on it.
 */
async function f141Edits(srv: FakeSimperiumServer, dataDir: string): Promise<void> {
  // A removal whose change-log entry rotated out: no `log` entry, no
  // broadcast — only a full re-index can reveal it.
  srv.removeFromIndex(APP_ID, 'note', 'noteX');

  const statePath = join(dataDir, 'state.json');
  const ghostsPath = join(dataDir, 'ghosts-note.json');
  const stateFile = JSON.parse(readFileSync(statePath, 'utf8')) as {
    data: { notes: { __map: [string, unknown][] } };
  };
  const ghostFile = JSON.parse(readFileSync(ghostsPath, 'utf8')) as {
    cv?: unknown;
    ghosts: { key: string }[];
  };
  // The ghosts exist for noteX/noteY but not noteZ: noteZ is the only
  // unsynced note the re-index diff must spare via the hold registry.
  expect(ghostFile.ghosts.map((g) => g.key)).toContain('noteX');
  expect(ghostFile.ghosts.map((g) => g.key)).not.toContain('noteZ');
  stateFile.data.notes.__map.push(['noteZ', noteData('Z')]);
  writeFileSync(statePath, JSON.stringify(stateFile));
  ghostFile.cv = 'not-a-number';
  writeFileSync(ghostsPath, JSON.stringify(ghostFile));
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  await new Promise((r) => setTimeout(r, 50));
  server?.stop();
  server = undefined;
});

describe('T499 a full re-index never removes an unsynced note', () => {
  it('1: WHEN the F141 restart runs THEN within 2 s `noteX` is gone from data.notes, `noteY` has content `Y`, and the subscriber counted `0` states without `noteZ`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);
    await f141Edits(srv, dataDir);

    // The subscriber is registered the instant buildStore returns and
    // counts EVERY state in which data.notes lacks noteZ — any moment
    // the diff would delete it.
    const a2 = open(dataDir, srv);
    let missing = hasNote(a2.store, 'noteZ') ? 0 : 1;
    a2.store.subscribe(() => {
      if (!hasNote(a2.store, 'noteZ')) missing++;
    });
    try {
      await waitFor(
        () =>
          !hasNote(a2.store, 'noteX') &&
          noteContent(a2.store, 'noteY') === 'Y' &&
          missing === 0,
        2000,
        're-index dropped noteX, noteY holds Y, and noteZ was never absent from a single state'
      );
      expect(hasNote(a2.store, 'noteX')).toBe(false);
      expect(noteContent(a2.store, 'noteY')).toBe('Y');
      expect(missing).toBe(0);
    } finally {
      await close(a2);
    }
  }, 8000);

  it("2: WHEN the F141 restart runs THEN within 2.5 s the server's `noteZ` has content `Z`, the store's `noteZ` is `Z`, and the subscriber counted `0` states without `noteZ`", async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);
    await f141Edits(srv, dataDir);

    const a2 = open(dataDir, srv);
    let missing = hasNote(a2.store, 'noteZ') ? 0 : 1;
    a2.store.subscribe(() => {
      if (!hasNote(a2.store, 'noteZ')) missing++;
    });
    try {
      await waitFor(
        () =>
          srv.getObject(APP_ID, 'note', 'noteZ')?.data.content === 'Z' &&
          noteContent(a2.store, 'noteZ') === 'Z' &&
          missing === 0,
        2500,
        'the held noteZ was sent and acknowledged with content Z and was never absent from a single state'
      );
      expect(srv.getObject(APP_ID, 'note', 'noteZ')?.data.content).toBe('Z');
      expect(noteContent(a2.store, 'noteZ')).toBe('Z');
      expect(missing).toBe(0);
    } finally {
      await close(a2);
    }
  }, 8000);

  it("3: WHEN, after line 2's state with pendingNotes empty, the server drops `noteZ` from its index and a second forced re-index runs in the same session THEN within 2.5 s `noteZ` is gone from data.notes and `noteY` has content `Y`", async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);
    await f141Edits(srv, dataDir);
    const a2 = open(dataDir, srv);
    try {
      // Line 2's end state: noteZ holds Z in the store and on the server,
      // and no local work is outstanding.
      await waitFor(
        () =>
          srv.getObject(APP_ID, 'note', 'noteZ')?.data.content === 'Z' &&
          noteContent(a2.store, 'noteZ') === 'Z' &&
          Object.keys(a2.store.getState().simperium.pendingNotes).length === 0,
        2500,
        "line 2's state with pendingNotes empty"
      );

      // The server drops noteZ from its index with no log entry — a
      // removal only a full re-index can reveal.
      srv.removeFromIndex(APP_ID, 'note', 'noteZ');

      // Second forced re-index in the SAME session: await the note
      // channel ghost store's setChangeVersion, then send the cv line.
      await waitFor(
        () => bucketsOf(a2.store).some((b) => b.name === 'note'),
        2000,
        'note channel'
      );
      const note = bucketsOf(a2.store).find((b) => b.name === 'note');
      expect(note?.channel?.store?.setChangeVersion).toBeDefined();
      await note?.channel?.store?.setChangeVersion?.('not-a-number');
      note?.channel?.send?.('cv:not-a-number');

      // noteZ is gone: its hold was released once its hand-off was done,
      // so this later re-index removes it like any note the server has
      // really dropped.
      await waitFor(
        () => !hasNote(a2.store, 'noteZ') && noteContent(a2.store, 'noteY') === 'Y',
        2500,
        'second re-index dropped noteZ while noteY holds Y'
      );
      expect(hasNote(a2.store, 'noteZ')).toBe(false);
      expect(noteContent(a2.store, 'noteY')).toBe('Y');
    } finally {
      await close(a2);
    }
  }, 8000);
});
