/**
 * T521 (tests corrected by T525) — a note the stale-delete reconcile
 * removes on a full re-index must lose its ghost too, or the NEXT start
 * resurrects it (F180, issue #19).
 *
 * The reconcile (src/core/simperium-stale-delete-fix.ts) diffs a completed
 * full re-index against `data.notes` and dispatches
 * `REMOTE_NOTE_DELETE_FOREVER` for every local id the server's index never
 * carried, removing the ghost of exactly those ids (held ids,
 * `pendingNotes` ids and ids the index carried keep theirs).
 * `restoreNotesFromGhosts` (src/core/ghost-restore.ts, run one timer tick
 * after every start) would otherwise find a ghost with text and no note
 * and bring the deleted note back.
 *
 * Rig: the fake server on localhost, `buildStore` from src/cli/main.tsx as
 * the real start-up path, `removeFromIndex` as the removal with no
 * change-log entry, and the `cv` of `ghosts-note.json` bashed to
 * `not-a-number` BEFORE the store opens to drive a full re-index
 * (FileGhostStore reads its cv at construction, so a bash written after
 * `open` never reaches the channel and no re-index ever runs). The fixture
 * trap is T499's: both notes must have real ghosts before any file is
 * edited, so the first store really syncs both onto disk (ghost file AND
 * state.json), then closes.
 *
 * Start observability: every asserted value sits inside the `waitFor`
 * condition together with this start's own markers, read only from
 * `srv.received.slice(mark)` with `mark` taken BEFORE the start opened —
 * an absolute init count is already true from the seeding run, so it
 * proves nothing. "Connected" = the slice holds at least two `:init:`
 * messages (note + tag). "A re-index ran" = the slice holds the channel's
 * `:cv:not-a-number` report AND the ghost file's cv is a real number again
 * (the library writes it just before the reconcile runs). "No re-index" =
 * the slice holds no `:cv:not-a-number` and no message starting `0:i:`
 * (channel 0 is the note bucket; the other buckets index at every start).
 *
 * Line 2 is ONE device: `serverRemove` (which works while the device is
 * closed) applies the removal with a change-log entry, then the device
 * starts twice and takes the removal through the catch-up — no second data
 * dir and no second store that would remove the ghost itself.
 *
 * A close is faithful wherever a change may be pending: `stopSaving()`,
 * then `client.end()` (reached as `store.client`), then `stopSync()` —
 * `stopSync()` alone leaves the old client connected while a change is
 * pending, and its later `LOGOUT` dispatch could rewrite state.json.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { holdId } from '../../src/core/held-unsynced';

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

/** The live simperium client `makeStore` exposes as `store.client`. */
interface ClientLike {
  end(): void;
}
const clientOf = (store: Built['store']): ClientLike | undefined =>
  (store as unknown as { client?: ClientLike }).client;

/** Open the real start-up path on `dir` (the account dir itself). */
function open(dataDir: string, server: FakeSimperiumServer): Built {
  return buildStore(
    { dataDir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
}

/**
 * Fully close a store: `client.end()` (the faithful stop — `stopSync()`
 * alone leaves the client connected while a change is pending), then
 * `stopSync()`, then `stopSaving()`, which flushes state.json to disk.
 * `stopSaving` first would kill that flush and leave the seeded
 * state.json unwritten.
 */
async function close(built: Built): Promise<void> {
  clientOf(built.store)?.end();
  built.store.stopSync?.();
  built.stopSaving();
  // let the socket finish closing before the next client opens
  await new Promise((r) => setTimeout(r, 50));
}

const hasNote = (store: Built['store'], id: string) =>
  store.getState().data.notes.has(id as never);

const noteContent = (store: Built['store'], id: string) =>
  store.getState().data.notes.get(id as never)?.content;

const noteSystemTags = (store: Built['store'], id: string) =>
  store.getState().data.notes.get(id as never)?.systemTags ?? [];

interface GhostFileOnDisk {
  cv?: unknown;
  ghosts: { key: string; data: Record<string, unknown> }[];
}

/**
 * The ghost file parsed. Throws (ENOENT or JSON error) while the file is
 * absent or torn, so a wait built on it never reads a half-written file as
 * truth.
 */
const ghostFile = (dataDir: string): GhostFileOnDisk =>
  JSON.parse(readFileSync(join(dataDir, 'ghosts-note.json'), 'utf8')) as GhostFileOnDisk;

const ghostKeys = (dataDir: string): string[] => ghostFile(dataDir).ghosts.map((g) => g.key);

/** The stored `data` of one ghost, or undefined while it has none. */
const ghostData = (dataDir: string, key: string): Record<string, unknown> | undefined =>
  ghostFile(dataDir).ghosts.find((g) => g.key === key)?.data;

/** Bash the ghost file's `cv` so the next start's cv report answers `cv:?`. */
function bashCv(dataDir: string): void {
  const p = join(dataDir, 'ghosts-note.json');
  const f = JSON.parse(readFileSync(p, 'utf8')) as { cv?: unknown };
  f.cv = 'not-a-number';
  writeFileSync(p, JSON.stringify(f));
}

/** True when the ghost file's `cv` is a real number again. */
const cvIsNumeric = (dataDir: string): boolean => {
  const cv = ghostFile(dataDir).cv;
  return typeof cv === 'string' && cv !== '' && Number.isFinite(Number(cv));
};

/**
 * A start's observability markers over the raw messages received AFTER the
 * mark taken before the start opened: this start's connection only, never
 * the seeding run's traffic. "Connected" = at least two `:init:` messages
 * in the slice; "a re-index ran" additionally demands the ghost file's cv
 * is numeric again, which the library writes just before the reconcile.
 */
const sliceFor = (
  srv: FakeSimperiumServer,
  dataDir: string,
  mark: number
): {
  connected: () => boolean;
  reIndexRan: () => boolean;
  noReIndex: () => boolean;
} => {
  const slice = () => srv.received.slice(mark);
  return {
    connected: () => slice().filter((m) => m.includes(':init:')).length >= 2,
    reIndexRan: () => slice().some((m) => m.includes(':cv:not-a-number')) && cvIsNumeric(dataDir),
    noReIndex: () =>
      !slice().some((m) => m.includes(':cv:not-a-number')) &&
      !slice().some((m) => m.startsWith('0:i:')),
  };
};

const tempDirs: string[] = [];
let server: FakeSimperiumServer | undefined;

/** Fixture: the server holds noteX (`ZOMBIE-NOTE`) and noteY (`KEEP`). */
async function startServer(): Promise<FakeSimperiumServer> {
  const srv = new FakeSimperiumServer();
  await srv.start();
  srv.seedBucket(APP_ID, 'note', [
    { id: 'noteX', data: noteData('ZOMBIE-NOTE'), version: 1 },
    { id: 'noteY', data: noteData('KEEP'), version: 2 },
  ]);
  server = srv;
  return srv;
}

/**
 * The synced fixture: connect on a fresh dir, wait until BOTH notes are in
 * data.notes (in memory — the only wait before the close; the 500 ms
 * debounced state.json flush races anything timed on disk), fully close
 * — the close's `stopSaving()` is what flushes state.json — then wait for
 * the ghost file to hold real ghosts for both notes (written during the
 * index, flushed now that the 100 ms coalescing window has closed).
 * Without the real ghosts noteX would count as unsynced and the re-index
 * diff would (correctly) spare it.
 */
async function seedAndClose(srv: FakeSimperiumServer): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), 'snote-t525-'));
  tempDirs.push(dataDir);
  const a1 = open(dataDir, srv);
  await waitFor(
    () => hasNote(a1.store, 'noteX') && hasNote(a1.store, 'noteY'),
    2000,
    'first sync of noteX and noteY'
  );
  await close(a1);
  await waitFor(
    () => {
      try {
        const g = ghostFile(dataDir);
        return g.ghosts.some((e) => e.key === 'noteX') && g.ghosts.some((e) => e.key === 'noteY');
      } catch {
        return false;
      }
    },
    1500,
    'ghosts-note.json written with noteX and noteY'
  );
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

describe('T521 a note removed by the re-index reconcile loses its ghost too', () => {
  it('1: WHEN `noteX` is dropped from the server index with no change-log entry, the cv in `ghosts-note.json` is `not-a-number`, and the device starts twice THEN after the second start `noteX` is not in data.notes, `noteY` has content `KEEP`, and the ghost file lists no `noteX`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    // Removal with no log entry, and the cv bashed BEFORE the open
    // (FileGhostStore reads it at construction): only the first start's
    // full re-index can reveal the removal.
    srv.removeFromIndex(APP_ID, 'note', 'noteX');
    bashCv(dataDir);

    // Start 1: connected (two `:init:` in this start's slice) and the
    // re-index really ran (this start sent `cv:not-a-number` and the
    // library wrote a numeric cv just before the reconcile). The
    // reconcile removes noteX and takes its ghost with it.
    const s1 = sliceFor(srv, dataDir, srv.received.length);
    const a2 = open(dataDir, srv);
    try {
      await waitFor(
        () =>
          s1.connected() &&
          s1.reIndexRan() &&
          !hasNote(a2.store, 'noteX') &&
          noteContent(a2.store, 'noteY') === 'KEEP' &&
          !ghostKeys(dataDir).includes('noteX'),
        2500,
        'start 1: connected, re-index ran, noteX gone, noteY holds KEEP, and the ghost file lists no noteX'
      );
    } finally {
      await close(a2);
    }

    // Start 2: no re-index (the cv is known now), yet nothing
    // resurrects noteX — its ghost left with the note.
    const s2 = sliceFor(srv, dataDir, srv.received.length);
    const a3 = open(dataDir, srv);
    try {
      await waitFor(
        () =>
          s2.connected() &&
          s2.noReIndex() &&
          !hasNote(a3.store, 'noteX') &&
          noteContent(a3.store, 'noteY') === 'KEEP' &&
          !ghostKeys(dataDir).includes('noteX'),
        2500,
        'start 2: connected with no re-index, noteX stays gone with content KEEP and no noteX ghost'
      );
      expect(hasNote(a3.store, 'noteX')).toBe(false);
      expect(noteContent(a3.store, 'noteY')).toBe('KEEP');
      expect(ghostKeys(dataDir)).not.toContain('noteX');
    } finally {
      await close(a3);
    }
  }, 15000);

  it('2: WHEN `noteX` is deleted on the server with a change-log entry (the device cv is still known) and the device starts twice THEN after the second start `noteX` is not in data.notes, `noteY` has content `KEEP`, and the ghost file lists no `noteX`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    // The removal, with a change-log entry, applied while the device is
    // CLOSED (`serverRemove` works offline): the device cv stays known,
    // so each start below learns of it through the catch-up, never a
    // re-index — and the ghost must go with the removal (the channel's
    // `removeObject` deletes it from the store before emitting
    // 'remove'), or the next start resurrects the note. One device: no
    // second store ever opens this dir, so nothing removes the ghost by
    // hand.
    srv.serverRemove('note', 'noteX');

    // Start 1: the catch-up applies the removal and the ghost goes.
    const s1 = sliceFor(srv, dataDir, srv.received.length);
    const a2 = open(dataDir, srv);
    try {
      await waitFor(
        () =>
          s1.connected() &&
          s1.noReIndex() &&
          !hasNote(a2.store, 'noteX') &&
          noteContent(a2.store, 'noteY') === 'KEEP' &&
          !ghostKeys(dataDir).includes('noteX'),
        2500,
        'start 1: connected with no re-index, catch-up removed noteX, noteY holds KEEP, and the ghost file lists no noteX'
      );
    } finally {
      // A removal may still be in flight: the faithful stop.
      await close(a2);
    }

    // Start 2: with the ghost gone, nothing brings noteX back.
    const s2 = sliceFor(srv, dataDir, srv.received.length);
    const a3 = open(dataDir, srv);
    try {
      await waitFor(
        () =>
          s2.connected() &&
          s2.noReIndex() &&
          !hasNote(a3.store, 'noteX') &&
          noteContent(a3.store, 'noteY') === 'KEEP' &&
          !ghostKeys(dataDir).includes('noteX'),
        2500,
        'start 2: connected with no re-index, noteX stays gone with content KEEP and no noteX ghost'
      );
      expect(hasNote(a3.store, 'noteX')).toBe(false);
      expect(noteContent(a3.store, 'noteY')).toBe('KEEP');
      expect(ghostKeys(dataDir)).not.toContain('noteX');
    } finally {
      await close(a3);
    }
  }, 15000);

  it('3: WHEN `noteX` has an unsynced local change (systemTags `pinned`, a modificationDate newer than its ghost), the server drops `noteX` from its index, and the device starts with a full re-index THEN `noteX` still has `pinned` in data.notes and the ghost file still lists `noteX`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    // The unsynced local change is not text on purpose: it is written
    // into state.json while the device is closed — systemTags `pinned`
    // with a modificationDate newer than the ghost's.
    const g = ghostFile(dataDir);
    const xGhost = g.ghosts.find((e) => e.key === 'noteX');
    const state = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8')) as {
      data: { notes: { __map: [string, Record<string, unknown>][] } };
    };
    const xNote = state.data.notes.__map.find(([id]) => id === 'noteX')?.[1];
    expect(xGhost?.data).toBeDefined();
    expect(xNote).toBeDefined();
    xNote.systemTags = ['pinned'];
    xNote.modificationDate = Number(xGhost.data.modificationDate) + 100000;
    writeFileSync(join(dataDir, 'state.json'), JSON.stringify(state));

    // Removal with no log entry + the cv bashed BEFORE the open: a real
    // full re-index runs on this start. The hold registry is requeue's
    // record of notes whose unsynced hand-off has not landed yet
    // (src/core/held-unsynced.ts); the hold taken right after `open` is
    // in time, before the index can complete. The reconcile must spare
    // it AND keep its ghost: had the ghost been removed, this start's
    // ghost-restore tick would bring noteX back with `pinned` in
    // data.notes while the ghost file listed nothing.
    srv.removeFromIndex(APP_ID, 'note', 'noteX');
    bashCv(dataDir);

    const s = sliceFor(srv, dataDir, srv.received.length);
    const a2 = open(dataDir, srv);
    holdId(a2.store, 'noteX');
    try {
      await waitFor(
        () =>
          s.connected() &&
          s.reIndexRan() &&
          hasNote(a2.store, 'noteX') &&
          noteSystemTags(a2.store, 'noteX').includes('pinned') &&
          ghostKeys(dataDir).includes('noteX'),
        2500,
        'the full re-index spared the held noteX: pinned still in data.notes and the ghost file still lists noteX'
      );
      expect(noteSystemTags(a2.store, 'noteX')).toContain('pinned');
      expect(ghostKeys(dataDir)).toContain('noteX');
    } finally {
      // A change may still be pending: the faithful stop.
      await close(a2);
    }
  }, 15000);

  it('4: WHEN `noteX` is dropped from the server index and the device starts with a full re-index THEN the ghost of `noteY` (still on the server) has the same data as before the start and `noteY` has content `KEEP`', async () => {
    const srv = await startServer();
    const dataDir = await seedAndClose(srv);

    // Snapshot noteY's ghost data before the start.
    const yBefore = ghostData(dataDir, 'noteY');
    expect(yBefore?.content).toBe('KEEP');

    srv.removeFromIndex(APP_ID, 'note', 'noteX');
    bashCv(dataDir);

    // The full re-index removes noteX; noteY sits in `seenDuringIndex`,
    // so the reconcile must pass it by — noteY holds KEEP and its ghost
    // keeps exactly the data it had before the start.
    const s = sliceFor(srv, dataDir, srv.received.length);
    const a2 = open(dataDir, srv);
    try {
      await waitFor(
        () =>
          s.connected() &&
          s.reIndexRan() &&
          !hasNote(a2.store, 'noteX') &&
          noteContent(a2.store, 'noteY') === 'KEEP' &&
          ghostData(dataDir, 'noteY') !== undefined &&
          JSON.stringify(ghostData(dataDir, 'noteY')) === JSON.stringify(yBefore),
        2500,
        'the full re-index removed noteX while noteY holds KEEP and keeps the same ghost data as before the start'
      );
      expect(hasNote(a2.store, 'noteX')).toBe(false);
      expect(noteContent(a2.store, 'noteY')).toBe('KEEP');
      expect(JSON.stringify(ghostData(dataDir, 'noteY'))).toBe(JSON.stringify(yBefore));
    } finally {
      await close(a2);
    }
  }, 15000);
});
