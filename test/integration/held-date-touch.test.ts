/**
 * #337b (, the second cause) — after a pin, trash or tag pressed right after
 * the restart is released at the catch-up, the hand-off in requeue.ts must not
 * send a second, modificationDate-only change ("ghost v3") for a note the sync
 * library already carries (queued or sent) with the same fields.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { isHeld } from '../../src/core/held-unsynced';

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

function close(built: Built): void {
  built.stopSaving();
  built.store.stopSync?.();
  open.splice(open.indexOf(built), 1);
}

const serverContent = (server: FakeSimperiumServer) =>
  String(server.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const localContent = (built: Built) => built.store.getState().data.notes.get('n1' as never)?.content;
const pending = (built: Built) => pendingCount(built.store.getState().simperium);

/** Step 1: A syncs n1 once and closes, leaving a data dir whose state and ghost agree. */
async function syncedDir(server: FakeSimperiumServer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t313-'));
  dirs.push(dir);
  const a = openA(dir, server);
  await waitFor(() => localContent(a) === BASE, 8000, 'A receives n1');
  // the ghost for n1 must be on disk before A closes
  await waitFor(() => readFileSync(join(dir, 'ghosts-note.json'), 'utf8').includes('"n1"'), 5000, 'n1 ghost saved');
  close(a);
  return dir;
}

/** Step 2: the edit A made while closed/offline, persisted exactly as snote persists local state. */
function editOffline(dir: string, content: string): void {
  const path = join(dir, 'state.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const entries: [string, Record<string, unknown>][] = file.data.notes.__map;
  const entry = entries.find(([id]) => id === 'n1');
  if (!entry) throw new Error('n1 missing from state.json');
  entry[1] = { ...entry[1], content, modificationDate: 5000 };
  writeFileSync(path, JSON.stringify(file));
}

/** Step 3: another device changes n1 on the server while A is closed. */
function remoteEdit(server: FakeSimperiumServer, content: string): void {
  server.serverChange('note', 'n1', noteData(content, 4000));
}


function act(b: Built, a: 'pin' | 'trash' | 'tag'): void {
  const noteId = 'n1' as never;
  const d = (x: unknown) => b.store.dispatch(x as never);
  if (a === 'pin') d({ type: 'PIN_NOTE', noteId, shouldPin: true });
  if (a === 'trash') d({ type: 'TRASH_NOTE', noteId });
  if (a === 'tag') d({ type: 'ADD_NOTE_TAG', noteId, tagName: 'work' });
}

const SERVER_DELAYS = [0, 50] as const;

/** every change frame for n1, as its sorted diff keys */
function n1Diffs(server: FakeSimperiumServer): string[][] {
  const out: string[][] = [];
  for (const f of server.received) {
    if (!f.startsWith('0:c:{')) continue;
    const c = JSON.parse(f.slice(4));
    if (c.id === 'n1' && c.ccid) out.push(Object.keys(c.v ?? {}).sort());
  }
  return out;
}

describe('#337b the hand-off does not send a date-only change after a held action', () => {
  for (const a of ['pin', 'trash', 'tag'] as const) {
    for (const delay of SERVER_DELAYS) {
      it(`1-${a}-${delay}: WHEN n1 has an offline edit from an earlier session and ${a} is pressed after the restart, with every server reply ${delay} ms late, THEN once the server holds the edit and the ${a} and pendingCount is 0, no change frame for n1 carries only modificationDate`, async () => {
        const server = await startServer();
        const dir = await syncedDir(server);
        editOffline(dir, 'A-OFFLINE-EDIT\nline2');
        server.sendDelayMs = delay;
        const b = openA(dir, server);
        // the hand-off runs after the catch-up, so this wrapper (set synchronously) sees its dispatch
        const imports: string[] = [];
        const dispatch = b.store.dispatch.bind(b.store);
        b.store.dispatch = ((x: { type?: string; noteId?: string }) => {
          if (x?.type === 'IMPORT_NOTE_WITH_ID' && x.noteId === 'n1') imports.push('n1');
          return dispatch(x as never);
        }) as never;
        act(b, a);
        await waitFor(
          () => {
            const o = server.getObject(APP_ID, 'note', 'n1')?.data as Record<string, unknown> | undefined;
            const done = a === 'pin' ? JSON.stringify(o?.systemTags).includes('pinned') : a === 'trash' ? o?.deleted === true : JSON.stringify(o?.tags).includes('work');
            return String(o?.content) === 'A-OFFLINE-EDIT\nline2' && done && pending(b) === 0 && !isHeld(b.store, 'n1');
          },
          10000,
          () => `server has the edit and the ${a}, pending 0 (frames ${JSON.stringify(n1Diffs(server))}, pending ${pending(b)})`
        );
        // The hold on n1 is released only after the hand-off ran, and a dispatch it made sets
        // pendingNotes until its acknowledgement: so the wait above ends after any second frame.
        const diffs = n1Diffs(server);
        expect(imports).toEqual([]);
        expect(diffs.length).toBeGreaterThan(0);
        expect(diffs.filter((k) => k.length === 1 && k[0] === 'modificationDate')).toEqual([]);
      }, 20000);
    }
  }

  it('2: WHEN another device also changed n1 while snote was closed (line 1) and the offline edit changed line 2 and pin is pressed after the restart THEN the server holds both edits and the pin and pendingCount is 0 (the merge the hand-off exists for is still sent)', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'line1\nA-OFFLINE-EDIT');
    remoteEdit(server, 'REMOTE-EDIT\nline2');
    const b = openA(dir, server);
    act(b, 'pin');
    await waitFor(
      () => {
        const o = server.getObject(APP_ID, 'note', 'n1')?.data as Record<string, unknown> | undefined;
        return String(o?.content) === 'REMOTE-EDIT\nA-OFFLINE-EDIT' && JSON.stringify(o?.systemTags).includes('pinned') && pending(b) === 0;
      },
      10000,
      () => `merged on the server (content ${JSON.stringify(serverContent(server))}, local ${JSON.stringify(localContent(b))}, pending ${pending(b)})`
    );
    expect(serverContent(server)).toBe('REMOTE-EDIT\nA-OFFLINE-EDIT');
    expect(pending(b)).toBe(0);
  }, 20000);

  it('3: WHEN n1 has an offline edit from an earlier session and nothing is pressed after the restart THEN the hand-off sends the edit and the server holds it and pendingCount is 0 (the hand-off is the only sender of it)', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    const b = openA(dir, server);
    await waitFor(
      () => serverContent(server) === 'A-OFFLINE-EDIT\nline2' && pending(b) === 0,
      10000,
      () => `offline edit on the server (content ${JSON.stringify(serverContent(server))}, pending ${pending(b)})`
    );
    expect(serverContent(server)).toBe('A-OFFLINE-EDIT\nline2');
    expect(pending(b)).toBe(0);
  }, 20000);
});
