/**
 * #557 proof: an echo the local note holds only part of, or one the server rebased onto
 * another device's change, lands once after a restart (the #115 hold applies it over the base; nothing lost).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';

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

async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  label: string | (() => string)
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs)
      throw new Error(
        `timed out (${timeoutMs} ms) waiting for: ${typeof label === 'function' ? label() : label}`
      );
    await new Promise((r) => setTimeout(r, 25));
  }
}

function noteData(content: string, modificationDate: number): Record<string, unknown> {
  return {
    content,
    creationDate: 1000,
    deleted: false,
    modificationDate,
    systemTags: [],
    tags: [],
  };
}

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  // n1 at version 3 (bucket cv 2): the client syncs at cv 2, and after
  // the server applies the pre-quit edit (cv 3) the restart's catch-up
  // from cv 2 carries the echo as a `0:c:[` frame.
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: noteData(BASE, 2000), version: 3 },
    { id: 'n2', data: noteData('two', 2000), version: 1 },
  ]);
  return server;
}

function openA(dataDir: string, serverUrl: string): Built {
  const built = buildStore(
    { dataDir, appId: APP_ID, server: serverUrl, noteEditDelayMs: 10 },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
  open.push(built);
  return built;
}

const serverContent = (server: FakeSimperiumServer, id: string) =>
  String(server.getObject(APP_ID, 'note', id)?.data.content ?? '');
const localContent = (built: Built, id: string) =>
  built.store.getState().data.notes.get(id as never)?.content;
const pending = (built: Built) => pendingCount(built.store.getState().simperium);

function editNote(built: Built, id: string, content: string): void {
  built.store.dispatch({
    type: 'EDIT_NOTE' as never,
    noteId: id as never,
    changes: { content } as never,
  });
}

/**
 * Stop exactly as the brief's rig prescribes: stop the saver (flushes
 * state.json), close the socket, stop the sync middleware, then a 300 ms
 * beat for timers to die.
 */
async function stop(built: Built): Promise<void> {
  built.stopSaving();
  (built.store.client as unknown as { end?: () => void })?.end?.();
  built.store.stopSync?.();
  open.splice(open.indexOf(built), 1);
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Two separate switches, proven test cast from the brief:
 * holdReplies drops every outgoing `0:c:[` message (ack and echo) while
 * it is on; ignoreChanges makes the server ignore an incoming `c` frame
 * entirely ("never reached").
 */
interface Filters {
  holdReplies: { on: boolean };
  ignoreChanges: { on: boolean };
  restore: () => void;
}

function installFilters(server: FakeSimperiumServer): Filters {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const realSend = priv.send.bind(server);
  const realHandleChange = priv.handleChange.bind(server);
  const holdReplies = { on: false };
  const ignoreChanges = { on: false };
  priv.send = (ws: unknown, message: string) => {
    if (holdReplies.on && /^\d+:c:\[/.test(message)) return;
    realSend(ws, message);
  };
  priv.handleChange = (conn: unknown, ws: unknown, data: string, channel: number) => {
    if (ignoreChanges.on) return;
    realHandleChange(conn, ws, data, channel);
  };
  return {
    holdReplies,
    ignoreChanges,
    restore: () => {
      holdReplies.on = false;
      ignoreChanges.on = false;
      priv.send = realSend;
      priv.handleChange = realHandleChange;
    },
  };
}

/** True once the persisted store (state.json) holds the given note content. */
function stateHolds(dir: string, id: string, content: string): boolean {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
      data?: { notes?: { __map?: [string, { content?: string }][] } };
    };
    const entry = state.data?.notes?.__map?.find(([noteId]) => noteId === id);
    return entry?.[1]?.content === content;
  } catch {
    return false;
  }
}
const serverNote = (server: FakeSimperiumServer, id: string) =>
  server.getObject(APP_ID, 'note', id)?.data as
    | { deleted?: boolean; systemTags?: string[]; content?: string }
    | undefined;
const localNote = (built: Built, id: string) =>
  built.store.getState().data.notes.get(id as never) as
    | { deleted?: boolean; systemTags?: string[]; content?: string }
    | undefined;


/** The process died after the edit's save and before the trash's: state.json and unsynced-notes.json lack the trash. */
function undoTrash(dir: string): void {
  for (const name of ['state.json', 'unsynced-notes.json']) {
    const p = join(dir, name);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    const n1 = name === 'state.json' ? s.data.notes.__map.find((e: [string, unknown]) => e[0] === 'n1')?.[1] : s.n1;
    if (n1) n1.deleted = false;
    writeFileSync(p, JSON.stringify(s));
  }
}

describe('#557 a partly held or rebased echo lands once after a restart', () => {
  it('1: WHEN one change edits n1 to `line1\\nline2\\nMK` and trashes it, the server applies it with its reply withheld, snote dies with the edit saved and the trash not, and restarts THEN the server\'s and store\'s n1 are exactly `line1\\nline2\\nMK` with deleted `true`', async () => {
    const server = await startServer();
    const dir = mkdtempSync(join(tmpdir(), 'snote-f195-'));
    dirs.push(dir);
    const filters = installFilters(server);
    filters.holdReplies.on = true;
    const a = openA(dir, server.url);
    await waitFor(() => localContent(a, 'n1') === BASE && pending(a) === 0 && stateHolds(dir, 'n1', BASE), 8000, 'A synced n1');
    editNote(a, 'n1', MK);
    a.store.dispatch({ type: 'TRASH_NOTE' as never, noteId: 'n1' as never });
    await waitFor(
      () => serverContent(server, 'n1') === MK && serverNote(server, 'n1')?.deleted === true && pending(a) === 1,
      8000,
      'the server holds MK and the trash in one change, pendingCount 1'
    );
    await stop(a);
    undoTrash(dir);
    filters.holdReplies.on = false;
    const b = openA(dir, server.url);
    const want = () =>
      serverContent(server, 'n1') === MK &&
      localContent(b, 'n1') === MK &&
      serverNote(server, 'n1')?.deleted === true &&
      localNote(b, 'n1')?.deleted === true &&
      pending(b) === 0;
    await waitFor(want, 8000, () => `n1 MK once and trashed (server: ${JSON.stringify(serverNote(server, 'n1'))}, store: ${JSON.stringify(localNote(b, 'n1'))})`);
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(localContent(b, 'n1')).toBe(MK);
    expect(localNote(b, 'n1')?.deleted).toBe(true);
  }, 20000);

  it('2: WHEN another device sets n1 to `B-LINE\\nline2`, then the edit adding MK reaches the server from the old version and is rebased with its reply withheld, and snote stops and restarts THEN the server\'s and store\'s n1 are exactly `B-LINE\\nline2\\nMK`', async () => {
    const server = await startServer();
    server.staleSvModel = 'rebase';
    const dir = mkdtempSync(join(tmpdir(), 'snote-f195-'));
    dirs.push(dir);
    const filters = installFilters(server);
    const a = openA(dir, server.url);
    await waitFor(() => localContent(a, 'n1') === BASE && pending(a) === 0 && stateHolds(dir, 'n1', BASE), 8000, 'A synced n1');
    filters.holdReplies.on = true;
    server.serverChange('note', 'n1', { ...server.getObject(APP_ID, 'note', 'n1')!.data, content: 'B-LINE\nline2', modificationDate: 2500 });
    editNote(a, 'n1', MK);
    const WANT = 'B-LINE\nline2\nMK';
    await waitFor(() => serverContent(server, 'n1') === WANT && server.staleRebases === 1 && pending(a) === 1 && stateHolds(dir, 'n1', MK), 8000, () => `the server rebased the edit (server: ${JSON.stringify(serverContent(server, 'n1'))})`);
    await stop(a);
    filters.holdReplies.on = false;
    const b = openA(dir, server.url);
    const want = () => serverContent(server, 'n1') === WANT && localContent(b, 'n1') === WANT && pending(b) === 0;
    await waitFor(want, 8000, () => `n1 once (server: ${JSON.stringify(serverContent(server, 'n1'))}, store: ${JSON.stringify(localContent(b, 'n1'))})`);
    expect(serverContent(server, 'n1')).toBe(WANT);
    expect(localContent(b, 'n1')).toBe(WANT);
  }, 20000);
});
