/**
 * T523 — a change the server applied just before snote quit is not
 * applied a second time after restart (F178, issue #9).
 *
 * The scenario on the fake server:
 *   1. snote syncs n1 (and n2 where a line names it);
 *   2. the edit goes out while holdReplies is on: the server's `0:c:[`
 *      reply — ack and echo — is withheld for the whole quit;
 *   3. snote stops with the edit on the server and on disk, pendingCount
 *      1 (2 when a line names two notes), unsynced.json and
 *      sent-changes.json both naming the note(s) — the state where the
 *      restart's catch-up carries the unacknowledged echo;
 *   4. optionally another device edits, or an unreachable session runs,
 *      or the record is damaged;
 *   5. snote restarts through the real `buildStore`; the catch-up (`cv`
 *      frames) delivers the echo of the pre-quit change.
 *
 * n1 starts at server version 3 (bucket cv 2) so the client's catch-up
 * from its synced cv carries the echo as a `0:c:[` frame.
 *
 * Lines 1-2 release holdReplies only AFTER the stop, so the restarted
 * client really receives the echo: without the seed in `trackOwnEchoes`
 * the echo reads as another device's change and the edit lands a second
 * time. Line 1 additionally asserts no `0:c:` frame naming n1 goes from
 * client to server after the restart — the seeded entry never goes on
 * the wire — which is why it only re-asserts after holdReplies is let
 * off at the very end. Lines 3-4 fail without `trackOwnEchoes`; lines
 * 5-6 are guards (an edit that never reached the server is still sent
 * once; a damaged record does not stop start-up) and pass today.
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

function fileNames(dir: string, file: string, id: string): boolean {
  try {
    return readFileSync(join(dir, file), 'utf8').includes(`"${id}"`);
  } catch {
    return false;
  }
}

function sendChanges(dir: string, text: string): void {
  writeFileSync(join(dir, 'sent-changes.json'), text);
}

/**
 * Lines 1, 3 and 4's shared rig: sync a fresh dir with holdReplies
 * already on, edit n1 to MK, and stop only once the quit proves the owed
 * echo: the server holds the edit, pendingCount is still 1 (store not
 * yet confirmed), and unsynced.json and sent-changes.json both name the
 * note. A stop with pendingCount 0 has not reproduced the bug.
 * holdReplies is left exactly as it was for the caller: the restart
 * decides when the withheld replies flow again.
 */
async function quitBeforeAck(
  server: FakeSimperiumServer,
  content = MK
): Promise<{ dir: string; filters: Filters }> {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t523-'));
  dirs.push(dir);
  const filters = installFilters(server);
  // holdReplies is turned on BEFORE the edit.
  filters.holdReplies.on = true;
  const a = openA(dir, server.url);
  try {
    await waitFor(
      () => localContent(a, 'n1') === BASE && localContent(a, 'n2') === 'two' && pending(a) === 0,
      8000,
      'A holds n1 and n2 with nothing pending'
    );
    editNote(a, 'n1', content);
    await waitFor(
      () =>
        serverContent(server, 'n1') === content &&
        localContent(a, 'n1') === content &&
        pending(a) === 1 &&
        fileNames(dir, 'unsynced.json', 'n1') &&
        fileNames(dir, 'sent-changes.json', 'n1'),
      8000,
      () =>
        `server holds the edit, pendingCount 1 and both records name n1 ` +
        `(server: ${JSON.stringify(serverContent(server, 'n1'))}, store: ${JSON.stringify(
          localContent(a, 'n1')
        )}, pending: ${pending(a)}, unsynced: ${fileNames(dir, 'unsynced.json', 'n1')}, ` +
        `sent-changes: ${fileNames(dir, 'sent-changes.json', 'n1')})`
    );
  } catch (e) {
    filters.restore();
    throw e;
  }
  await stop(a);
  expect(stateHolds(dir, 'n1', content)).toBe(true);
  return { dir, filters };
}

/** True once `received.slice(from)` holds a `0:c:` frame naming `id`. */
function sentFrameNaming(
  server: FakeSimperiumServer,
  from: number,
  id: string
): boolean {
  return server.received
    .slice(from)
    .some((m) => m.startsWith('0:c:') && m.includes(`"${id}"`));
}

/**
 * Sleep `ms` and fail if a `0:c:` frame naming `id` went from client to
 * server during it — used AFTER the final waits, once holdReplies is
 * off, so a seeded entry ever going on the wire is caught.
 */
async function expectNoSentFrameAfter(
  server: FakeSimperiumServer,
  ms: number,
  id: string
): Promise<void> {
  const from = server.received.length;
  await new Promise((r) => setTimeout(r, ms));
  expect(sentFrameNaming(server, from, id)).toBe(false);
}

describe('T523 a change applied just before quit is not applied twice', () => {
  it('1: WHEN n1 is edited to line1\\nline2\\nMK, the server applies it with its reply withheld, snote stops and restarts THEN the server\'s and the store\'s n1 are exactly line1\\nline2\\nMK, pendingCount is 0, and no 0:c: frame naming n1 arrived after the restart', async () => {
    const server = await startServer();
    const { dir, filters } = await quitBeforeAck(server);
    // Release the withheld replies only now that snote has stopped: the
    // restart must actually RECEIVE the echo (the catch-up reply is
    // itself a `0:c:[` frame), or the seeding is never exercised.
    filters.holdReplies.on = false;
    const receivedAtRestart = server.received.length;
    const a = openA(dir, server.url);
    // The test's own `0:c:` frames go client -> server (server.received);
    // holdReplies only drops server -> client sends, so this clause is
    // unaffected by releasing the replies.
    const noEchoForN1 = () => !sentFrameNaming(server, receivedAtRestart, 'n1');
    const want = () =>
      serverContent(server, 'n1') === MK &&
      localContent(a, 'n1') === MK &&
      pending(a) === 0 &&
      noEchoForN1();
    await waitFor(want, 8000, () =>
      `server and store hold MK once with pendingCount 0 and no 0:c: frame naming n1 (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, store: ${JSON.stringify(localContent(a, 'n1'))}, pending: ${pending(a)}, no echo: ${noEchoForN1()})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still exactly MK with nothing pending after settling');
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(localContent(a, 'n1')).toBe(MK);
    expect(pending(a)).toBe(0);
    expect(noEchoForN1()).toBe(true);
    // Replies flow again: nothing the restart seeded goes on the wire.
    await expectNoSentFrameAfter(server, 1500, 'n1');
  }, 20000);

  it('2: WHEN n1 is edited to line1\\nline2\\nMK and n2 to two\\nMK, the server applies both with replies withheld, snote stops and restarts THEN the server\'s and the store\'s n2 are exactly two\\nMK and n1 exactly line1\\nline2\\nMK', async () => {
    const server = await startServer();
    const dir = mkdtempSync(join(tmpdir(), 'snote-t523-'));
    dirs.push(dir);
    const filters = installFilters(server);
    // holdReplies is turned on BEFORE both edits.
    filters.holdReplies.on = true;
    const a = openA(dir, server.url);
    try {
      await waitFor(
        () => localContent(a, 'n1') === BASE && localContent(a, 'n2') === 'two' && pending(a) === 0,
        8000,
        'A holds n1 and n2 with nothing pending'
      );
      editNote(a, 'n1', MK);
      editNote(a, 'n2', 'two\nMK');
      // Wait for the server to hold BOTH edits, the store to hold both
      // copies, pendingCount 2 (neither confirmed), and both records to
      // name both notes.
      await waitFor(
        () =>
          serverContent(server, 'n1') === MK &&
          serverContent(server, 'n2') === 'two\nMK' &&
          localContent(a, 'n1') === MK &&
          localContent(a, 'n2') === 'two\nMK' &&
          pending(a) === 2 &&
          fileNames(dir, 'unsynced.json', 'n1') &&
          fileNames(dir, 'unsynced.json', 'n2') &&
          fileNames(dir, 'sent-changes.json', 'n1') &&
          fileNames(dir, 'sent-changes.json', 'n2'),
        8000,
        () => `server holds both edits unacknowledged, pendingCount 2 and both records name both notes ` +
          `(n1 server: ${JSON.stringify(serverContent(server, 'n1'))}, n1 store: ${JSON.stringify(
            localContent(a, 'n1')
          )}, n2 server: ${JSON.stringify(serverContent(server, 'n2'))}, n2 store: ${JSON.stringify(
            localContent(a, 'n2')
          )}, pending: ${pending(a)}, unsynced: ${fileNames(dir, 'unsynced.json', 'n1')}/${fileNames(
            dir,
            'unsynced.json',
            'n2'
          )}, sent-changes: ${fileNames(dir, 'sent-changes.json', 'n1')}/${fileNames(
            dir,
            'sent-changes.json',
            'n2'
          )})`
      );
    } catch (e) {
      filters.restore();
      throw e;
    }
    await stop(a);
    expect(stateHolds(dir, 'n1', MK)).toBe(true);
    expect(stateHolds(dir, 'n2', 'two\nMK')).toBe(true);
    // Release the withheld replies only after the stop: the restart must
    // receive both echoes, or the seeding is never exercised.
    filters.holdReplies.on = false;
    const receivedAtRestart = server.received.length;
    const r = openA(dir, server.url);
    const want = () =>
      serverContent(server, 'n2') === 'two\nMK' &&
      localContent(r, 'n2') === 'two\nMK' &&
      serverContent(server, 'n1') === MK &&
      localContent(r, 'n1') === MK &&
      pending(r) === 0 &&
      !sentFrameNaming(server, receivedAtRestart, 'n1') &&
      !sentFrameNaming(server, receivedAtRestart, 'n2');
    await waitFor(want, 8000, () =>
      `both notes hold MK once with pendingCount 0 and no 0:c: frame naming either note ` +
        `(server n1: ${JSON.stringify(serverContent(server, 'n1'))}, store n1: ${JSON.stringify(
          localContent(r, 'n1')
        )}, server n2: ${JSON.stringify(serverContent(server, 'n2'))}, store n2: ${JSON.stringify(
          localContent(r, 'n2')
        )}, pending: ${pending(r)})`
    );
    await new Promise((r2) => setTimeout(r2, 1500));
    await waitFor(want, 1000, 'both notes unchanged after settling');
    expect(serverContent(server, 'n2')).toBe('two\nMK');
    expect(localContent(r, 'n2')).toBe('two\nMK');
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(localContent(r, 'n1')).toBe(MK);
    expect(pending(r)).toBe(0);
    // Replies flow freely: nothing the restart seeded goes on the wire.
    await expectNoSentFrameAfter(server, 1500, 'n1');
    await expectNoSentFrameAfter(server, 1500, 'n2');
  }, 20000);

  it('3: WHEN line 1\'s stop is followed by another device setting n1 to B-LINE\\nline2\\nMK and snote restarts THEN the server\'s and the store\'s n1 are exactly B-LINE\\nline2\\nMK', async () => {
    const server = await startServer();
    const { dir, filters } = await quitBeforeAck(server);
    // Another device edits while snote is down.
    server.serverChange('note', 'n1', noteData('B-LINE\nline2\nMK', 4000));
    // Replies may flow again only after snote has stopped.
    filters.holdReplies.on = false;
    const a = openA(dir, server.url);
    const want = () =>
      serverContent(server, 'n1') === 'B-LINE\nline2\nMK' &&
      localContent(a, 'n1') === 'B-LINE\nline2\nMK' &&
      pending(a) === 0;
    await waitFor(want, 8000, () =>
      `another device's edit lands clean (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, store: ${JSON.stringify(localContent(a, 'n1'))}, pending: ${pending(a)})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still exactly B-LINE\\nline2\\nMK after settling');
    expect(serverContent(server, 'n1')).toBe('B-LINE\nline2\nMK');
    expect(localContent(a, 'n1')).toBe('B-LINE\nline2\nMK');
    expect(pending(a)).toBe(0);
  }, 20000);

  it('4: WHEN line 1\'s stop is followed by a session that cannot reach the server, then an online session THEN the server\'s and the store\'s n1 are exactly line1\\nline2\\nMK', async () => {
    const server = await startServer();
    const { dir, filters } = await quitBeforeAck(server);
    filters.holdReplies.on = false;
    // An offline session: ws://127.0.0.1:9 refuses the connection, so
    // the owed echo survives this session untouched.
    const off = openA(dir, 'ws://127.0.0.1:9');
    await new Promise((r) => setTimeout(r, 800));
    await stop(off);
    const a = openA(dir, server.url);
    const want = () =>
      serverContent(server, 'n1') === MK &&
      localContent(a, 'n1') === MK &&
      pending(a) === 0;
    await waitFor(want, 8000, () =>
      `online session after the unreachable one holds MK once (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, store: ${JSON.stringify(localContent(a, 'n1'))}, pending: ${pending(a)})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still exactly MK after settling');
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(localContent(a, 'n1')).toBe(MK);
    expect(pending(a)).toBe(0);
  }, 20000);

  it('5: WHEN the server ignores the frame of line 1\'s edit, snote stops and restarts THEN within 8 s the server\'s n1 is exactly line1\\nline2\\nMK and pendingCount is 0', async () => {
    const server = await startServer();
    const dir = mkdtempSync(join(tmpdir(), 'snote-t523-'));
    dirs.push(dir);
    const filters = installFilters(server);
    // ignoreChanges ONLY: the edit's frame never reaches the server.
    filters.ignoreChanges.on = true;
    const a = openA(dir, server.url);
    try {
      await waitFor(
        () => localContent(a, 'n1') === BASE && localContent(a, 'n2') === 'two',
        8000,
        'A holds n1 and n2'
      );
      editNote(a, 'n1', MK);
      await waitFor(
        () => stateHolds(dir, 'n1', MK) && fileNames(dir, 'unsynced.json', 'n1'),
        8000,
        () => `the never-reached edit on disk (state.json MK: ${stateHolds(dir, 'n1', MK)}, ` +
          `unsynced names n1: ${fileNames(dir, 'unsynced.json', 'n1')})`
      );
    } finally {
      await stop(a);
      filters.restore();
    }
    expect(serverContent(server, 'n1')).toBe(BASE);
    const b = openA(dir, server.url);
    const want = () => serverContent(server, 'n1') === MK && pending(b) === 0;
    await waitFor(want, 8000, () =>
      `the unserverd edit is re-sent once (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, pending: ${pending(b)})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still exactly MK after settling');
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(pending(b)).toBe(0);
  }, 20000);

  it('6: WHEN line 5\'s stop is followed by sent-changes.json being overwritten with exactly n1-not-json and snote restarts THEN within 8 s the server\'s n1 is exactly line1\\nline2\\nMK and pendingCount is 0', async () => {
    const server = await startServer();
    const dir = mkdtempSync(join(tmpdir(), 'snote-t523-'));
    dirs.push(dir);
    const filters = installFilters(server);
    // ignoreChanges ONLY, as in line 5.
    filters.ignoreChanges.on = true;
    const a = openA(dir, server.url);
    try {
      await waitFor(
        () => localContent(a, 'n1') === BASE && localContent(a, 'n2') === 'two',
        8000,
        'A holds n1 and n2'
      );
      editNote(a, 'n1', MK);
      await waitFor(
        () => stateHolds(dir, 'n1', MK) && fileNames(dir, 'unsynced.json', 'n1'),
        8000,
        'the never-reached edit is on disk'
      );
    } finally {
      await stop(a);
      filters.restore();
    }
    sendChanges(dir, 'n1-not-json');
    const b = openA(dir, server.url);
    const want = () => serverContent(server, 'n1') === MK && pending(b) === 0;
    await waitFor(want, 8000, () =>
      `a damaged record does not stop the re-send (server: ${JSON.stringify(
        serverContent(server, 'n1')
      )}, pending: ${pending(b)})`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still exactly MK after settling');
    expect(serverContent(server, 'n1')).toBe(MK);
    expect(pending(b)).toBe(0);
  }, 20000);
});
