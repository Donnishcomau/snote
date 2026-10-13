/**
 * T530 (S8-01) proof: a change sent just before snote dies is kept after restart.
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


/** True once a `0:c:` frame naming `id` went from client to server since `from`. */
const sentFrameNaming = (server: FakeSimperiumServer, from: number, id: string) =>
  server.received.slice(from).some((m) => m.startsWith('0:c:') && m.includes(`"${id}"`));

const serverNote = (server: FakeSimperiumServer, id: string) =>
  server.getObject(APP_ID, 'note', id)?.data as
    | { deleted?: boolean; systemTags?: string[]; content?: string }
    | undefined;
const localNote = (built: Built, id: string) =>
  built.store.getState().data.notes.get(id as never) as
    | { deleted?: boolean; systemTags?: string[]; content?: string }
    | undefined;

type Kind = 'edit' | 'trash' | 'edit-both';

/**
 * Sync a fresh dir with replies withheld, make the change (edit n1 to MK
 * or trash n1), wait until the server applied it with pendingCount 1,
 * then stop. With `crash`, state.json is put back to its copy from before
 * the change: the process died before the 500 ms save. Replies are
 * released only after the stop, so the restart receives the echo.
 */
async function changeThenStop(kind: Kind, crash: boolean) {
  const server = await startServer();
  const dir = mkdtempSync(join(tmpdir(), 'snote-t530-'));
  dirs.push(dir);
  const filters = installFilters(server);
  filters.holdReplies.on = true;
  const a = openA(dir, server.url);
  await waitFor(
    () => localContent(a, 'n1') === BASE && pending(a) === 0 && stateHolds(dir, 'n1', BASE),
    8000,
    'A synced n1 and state.json holds it'
  );
  const before = readFileSync(join(dir, 'state.json'), 'utf8');
  if (kind === 'trash') {
    a.store.dispatch({ type: 'TRASH_NOTE' as never, noteId: 'n1' as never });
    await waitFor(
      () => serverNote(server, 'n1')?.deleted === true && pending(a) === 1,
      8000,
      'the server trashed n1, pendingCount 1'
    );
  } else if (kind === 'edit') {
    editNote(a, 'n1', MK);
    await waitFor(
      () => serverContent(server, 'n1') === MK && pending(a) === 1,
      8000,
      'the server holds MK, pendingCount 1'
    );
  } else {
    editNote(a, 'n1', MK);
    editNote(a, 'n2', 'two\nMK');
    await waitFor(
      () =>
        serverContent(server, 'n1') === MK &&
        serverContent(server, 'n2') === 'two\nMK' &&
        pending(a) === 2 &&
        stateHolds(dir, 'n2', 'two\nMK') &&
        stateHolds(dir, 'n1', MK),
      8000,
      'the server holds both edits, pendingCount 2'
    );
  }
  await stop(a);
  if (crash) writeFileSync(join(dir, 'state.json'), before);
  filters.holdReplies.on = false;
  const mark = server.received.length;
  const b = openA(dir, server.url);
  return { server, b, mark };
}

describe('T530 a change sent just before snote dies is kept after restart (S8-01)', () => {
  it('1: WHEN n1 is edited to `line1\\nline2\\nMK`, the server applies it with its reply withheld, snote dies before state.json holds it and restarts THEN the store\'s n1 is exactly `line1\\nline2\\nMK`, and after an edit the server\'s and store\'s n1 are exactly `line1\\nline2\\nMK\\nLATER`', async () => {
    const { server, b } = await changeThenStop('edit', true);
    await waitFor(
      () => localContent(b, 'n1') === 'line1\nline2\nMK' && pending(b) === 0,
      8000,
      () => `store n1 is MK (store: ${JSON.stringify(localContent(b, 'n1'))})`
    );
    editNote(b, 'n1', 'line1\nline2\nMK\nLATER');
    const want = () =>
      serverContent(server, 'n1') === 'line1\nline2\nMK\nLATER' &&
      localContent(b, 'n1') === 'line1\nline2\nMK\nLATER' &&
      pending(b) === 0;
    await waitFor(want, 8000, () =>
      `server and store n1 are MK then LATER (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, store: ${JSON.stringify(localContent(b, 'n1'))})`
    );
    expect(serverContent(server, 'n1')).toBe('line1\nline2\nMK\nLATER');
    expect(localContent(b, 'n1')).toBe('line1\nline2\nMK\nLATER');
  }, 20000);

  it('2: WHEN n1 is trashed, the server applies it with its reply withheld, snote dies before state.json holds it and restarts THEN the store\'s n1 has deleted `true`, and after n1 is pinned the server\'s and store\'s n1 have deleted `true` and systemTags `pinned`', async () => {
    const { server, b } = await changeThenStop('trash', true);
    await waitFor(
      () => localNote(b, 'n1')?.deleted === true && pending(b) === 0,
      8000,
      () => `store n1 is trashed (store deleted: ${localNote(b, 'n1')?.deleted})`
    );
    b.store.dispatch({ type: 'PIN_NOTE' as never, noteId: 'n1' as never, shouldPin: true } as never);
    const want = () =>
      serverNote(server, 'n1')?.deleted === true &&
      (serverNote(server, 'n1')?.systemTags ?? []).includes('pinned') &&
      localNote(b, 'n1')?.deleted === true &&
      (localNote(b, 'n1')?.systemTags ?? []).includes('pinned') &&
      pending(b) === 0;
    await waitFor(want, 8000, () =>
      `server and store n1 trashed and pinned (server: ${JSON.stringify(
        serverNote(server, 'n1')
      )}, store: ${JSON.stringify(localNote(b, 'n1'))})`
    );
    expect(serverNote(server, 'n1')?.deleted).toBe(true);
    expect(serverNote(server, 'n1')?.systemTags).toContain('pinned');
    expect(localNote(b, 'n1')?.deleted).toBe(true);
  }, 20000);

  it('3: WHEN n1 is edited to `line1\\nline2\\nMK` and n2 to `two\\nMK`, the server applies both with replies withheld, snote stops with state.json holding both and restarts THEN the server\'s and store\'s n1 are exactly `line1\\nline2\\nMK` and n2 exactly `two\\nMK`', async () => {
    const { server, b } = await changeThenStop('edit-both', false);
    const want = () =>
      serverContent(server, 'n1') === 'line1\nline2\nMK' &&
      localContent(b, 'n1') === 'line1\nline2\nMK' &&
      serverContent(server, 'n2') === 'two\nMK' &&
      localContent(b, 'n2') === 'two\nMK' &&
      pending(b) === 0;
    await waitFor(want, 8000, () =>
      `n1 MK and n2 two\\nMK once (server: ${JSON.stringify([
        serverContent(server, 'n1'),
        serverContent(server, 'n2'),
      ])}, store: ${JSON.stringify([localContent(b, 'n1'), localContent(b, 'n2')])})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still each edit once after 1500 ms');
    expect(serverContent(server, 'n1')).toBe('line1\nline2\nMK');
    expect(localContent(b, 'n1')).toBe('line1\nline2\nMK');
    expect(serverContent(server, 'n2')).toBe('two\nMK');
    expect(localContent(b, 'n2')).toBe('two\nMK');
  }, 20000);

  it('4: WHEN n1 is edited to `line1\\nline2\\nMK`, the server applies it with its reply withheld, snote stops with state.json holding it and restarts THEN server and store n1 are exactly `line1\\nline2\\nMK`, pendingCount `0`, and no `0:c:` frame names n1', async () => {
    const { server, b, mark } = await changeThenStop('edit', false);
    const want = () =>
      serverContent(server, 'n1') === 'line1\nline2\nMK' &&
      localContent(b, 'n1') === 'line1\nline2\nMK' &&
      pending(b) === 0 &&
      !sentFrameNaming(server, mark, 'n1');
    await waitFor(want, 8000, () =>
      `n1 MK once, nothing pending, no 0:c: for n1 (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, store: ${JSON.stringify(localContent(b, 'n1'))}, pending: ${pending(b)}, frame: ${sentFrameNaming(
        server,
        mark,
        'n1'
      )})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still MK once and no 0:c: frame for n1 after 1500 ms');
    expect(serverContent(server, 'n1')).toBe('line1\nline2\nMK');
    expect(localContent(b, 'n1')).toBe('line1\nline2\nMK');
    expect(pending(b)).toBe(0);
    expect(sentFrameNaming(server, mark, 'n1')).toBe(false);
  }, 20000);
});
