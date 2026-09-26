/**
 * T319 — a note deleted forever on another device comes back after snote
 * catches up (live finding 2026-09-26).
 *
 * Scenario (same helpers and ghost-editing as simperium-restart-rebase):
 *   1. client A syncs note n1 and closes, ghost on disk at version 1;
 *   2. A's ghost for n1 is forced to version 0, so the first catch-up
 *      MODIFY (sv 1) mismatches and A sends `e:n1.1`;
 *   3. the server changes n1 twice and then `serverRemove`s it, giving
 *      the catch-up changes M(1->2), M(2->3), `-`.
 * Without the fix, the late `e:` reply re-creates the ghost and emits
 * 'update' after the REMOVE already emitted 'remove' — the note is back
 * although the server no longer has it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { installSimperiumRemovedNoteFix } from '../../src/core/simperium-removed-note-fix';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';

type Built = ReturnType<typeof buildStore>;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(async () => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: string | (() => string)): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${typeof label === 'function' ? label() : label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function noteData(content: string, modificationDate: number): Record<string, unknown> {
  return { content, creationDate: 1000, deleted: false, modificationDate, systemTags: [], tags: [] };
}

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [{ id: 'n1', data: noteData(BASE, 2000), version: 1 }]);
  return server;
}

function openA(dataDir: string, server: FakeSimperiumServer): Built {
  const built = buildStore(
    { dataDir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
  open.push(built);
  return built;
}

async function close(built: Built): Promise<void> {
  built.stopSaving();
  built.store.stopSync?.();
  open.splice(open.indexOf(built), 1);
  await new Promise((r) => setTimeout(r, 300));
}

/** Step 1: A syncs n1 once and closes, leaving a data dir whose state and ghost agree. */
async function syncedDir(server: FakeSimperiumServer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t319-'));
  dirs.push(dir);
  const a = openA(dir, server);
  await waitFor(() => localContent(a) === BASE, 8000, 'A receives n1');
  // the ghost for n1 must be on disk before A closes
  await waitFor(() => readFileSync(join(dir, 'ghosts-note.json'), 'utf8').includes('"n1"'), 5000, 'n1 ghost saved');
  await close(a);
  return dir;
}

/** Step 2: force A's ghost for n1 to version 0 while A is closed. */
function setGhostVersion0(dir: string): void {
  const ghostsPath = join(dir, 'ghosts-note.json');
  const ghosts = JSON.parse(readFileSync(ghostsPath, 'utf8'));
  const entry = (ghosts.ghosts as Array<{ key: string; version: number }>).find((g) => g.key === 'n1');
  if (!entry) throw new Error('n1 missing from ghosts-note.json');
  entry.version = 0;
  writeFileSync(ghostsPath, JSON.stringify(ghosts));
}

/** Step 3: another device changes n1 twice on the server while A is closed. */
function remoteEdits(server: FakeSimperiumServer): void {
  server.serverChange('note', 'n1', noteData('B-FIRST-EDIT\nline2', 4000));
  server.serverChange('note', 'n1', noteData('B-SECOND-EDIT\nline2', 5000));
}

const localContent = (built: Built) => built.store.getState().data.notes.get('n1' as never)?.content;
const localN1 = (built: Built) => built.store.getState().data.notes.has('n1' as never);
const pending = (built: Built) => pendingCount(built.store.getState().simperium);

describe('T319 a note removed on the server stays removed after catch-up', () => {
  it('1: WHEN client A synced n1 and closed, its ghost for n1 is set to version 0, the server then changes n1 twice and serverRemoves it, versionReplyDelayMs is 300, and A reopens THEN after versionRepliesSent contains an entry starting with n1. and 1000 ms more, A\'s data.notes has no n1 and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    setGhostVersion0(dir);
    remoteEdits(server);
    server.serverRemove('note', 'n1');
    server.versionReplyDelayMs = 300;
    const a = openA(dir, server);
    await waitFor(
      () => server.versionRepliesSent.some((r) => r.startsWith('n1.')),
      10000,
      () => `version reply for n1 sent (replies: ${JSON.stringify(server.versionRepliesSent)})`
    );
    await new Promise((r) => setTimeout(r, 1000));
    expect(localN1(a)).toBe(false);
    expect(pending(a)).toBe(0);
  }, 20000);

  it('2: WHEN the same scenario runs without serverRemove (the server only changes n1 twice, to B-SECOND-EDIT last) THEN within 10 s A\'s n1 content is B-SECOND-EDIT and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    setGhostVersion0(dir);
    remoteEdits(server);
    server.versionReplyDelayMs = 300;
    const a = openA(dir, server);
    await waitFor(
      () => {
        const c = localContent(a);
        return typeof c === 'string' && c.startsWith('B-SECOND-EDIT') && pending(a) === 0;
      },
      10000,
      () => `A applied the catch-up (A: ${JSON.stringify(localContent(a))}, pending: ${pending(a)})`
    );
    expect(String(localContent(a))).toContain('B-SECOND-EDIT');
    expect(pending(a)).toBe(0);
  }, 20000);

  it('3: WHEN a channel with the fix installed emits remove for x1 and then version.x1.4 THEN a listener on version.x1.4 is not called, and a listener on version.y1.4 for an id never removed is called once', () => {
    const channel = new EventEmitter();
    const client = { buckets: [{ name: 'note', channel }] };
    installSimperiumRemovedNoteFix(client);

    const x1Calls: unknown[][] = [];
    const y1Calls: unknown[][] = [];
    channel.on('version.x1.4', (...args: unknown[]) => x1Calls.push(args));
    channel.on('version.y1.4', (...args: unknown[]) => y1Calls.push(args));

    channel.emit('remove', 'x1');
    const delivered = channel.emit('version.x1.4', { data: { content: 'ghost written back' } });
    const yDelivered = channel.emit('version.y1.4', { data: { content: 'unrelated' } });

    expect(x1Calls.length).toBe(0);
    expect(delivered).toBe(false);
    expect(y1Calls.length).toBe(1);
    expect(yDelivered).toBe(true);
  });
});
