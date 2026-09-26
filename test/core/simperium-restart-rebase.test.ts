/**
 * T313 + T314 — an edit made while snote was closed and offline must reach the
 * server when snote is reopened, even if another device changed the same note
 * in the meantime (live finding 2026-09-25: the edit was dropped and `1 pending`
 * stuck forever).
 *
 * Each scenario mirrors the real sequence on the fake server:
 *   1. client A syncs note n1 and closes (state.json and ghosts-note.json agree);
 *   2. the offline edit is written into A's state.json exactly as snote persists
 *      an edit it could not send (the ghost keeps the last synced version);
 *   3. optionally another device edits n1 on the server while A is closed;
 *   4. A is reopened through the real startup path (`buildStore`).
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
  await close(a);
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

describe('T313/T314 an offline edit survives reopening snote', () => {
  it('1: WHEN client A edits note n1 offline to A-OFFLINE-EDIT\\nline2 and restarts with network with no other client having changed n1 THEN within 10 s the server\'s n1 content is exactly A-OFFLINE-EDIT\\nline2, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    const a = openA(dir, server);
    await waitFor(
      () => serverContent(server) === 'A-OFFLINE-EDIT\nline2' && pending(a) === 0,
      10000,
      'server has the offline edit and A pendingCount 0'
    );
    expect(serverContent(server)).toBe('A-OFFLINE-EDIT\nline2');
    expect(pending(a)).toBe(0);
  }, 20000);

  it('2: WHEN client A restarts with network having made no offline edit to n1 THEN A\'s pendingCount stays 0 and the server\'s n1 content is unchanged from its seeded line1\\nline2', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    const a = openA(dir, server);
    await waitFor(() => localContent(a) === BASE, 8000, 'A reloaded n1');
    await new Promise((r) => setTimeout(r, 1500));
    expect(pending(a)).toBe(0);
    expect(serverContent(server)).toBe(BASE);
  }, 20000);

  it('3: WHEN client A edits n1 offline from line1\\nline2 to A-OFFLINE-EDIT\\nline2, client B edits n1 online to line1\\nB-ONLINE-EDIT, and A restarts from the same dataDir with network THEN within 10 s the server\'s n1 content contains both A-OFFLINE-EDIT and B-ONLINE-EDIT, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    remoteEdit(server, 'line1\nB-ONLINE-EDIT');
    const a = openA(dir, server);
    await waitFor(
      () => {
        const c = serverContent(server);
        return c.includes('A-OFFLINE-EDIT') && c.includes('B-ONLINE-EDIT') && pending(a) === 0;
      },
      10000,
      'server has both edits and A pendingCount 0'
    );
    expect(serverContent(server)).toContain('A-OFFLINE-EDIT');
    expect(serverContent(server)).toContain('B-ONLINE-EDIT');
    expect(localContent(a)).toBe(serverContent(server));
    expect(pending(a)).toBe(0);
  }, 20000);

  it('4: WHEN the same restart happens but B changes the first line to B-CHANGED-LINE-ONE\\nline2 (a same-line conflict) THEN within 10 s the server\'s n1 content contains A-OFFLINE-EDIT, B-CHANGED-LINE-ONE and --- conflicting change from another device ---, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    remoteEdit(server, 'B-CHANGED-LINE-ONE\nline2');
    const a = openA(dir, server);
    await waitFor(
      () => {
        const c = serverContent(server);
        return (
          c.includes('A-OFFLINE-EDIT') &&
          c.includes('B-CHANGED-LINE-ONE') &&
          c.includes('--- conflicting change from another device ---') &&
          pending(a) === 0
        );
      },
      10000,
      () => `server keeps both versions with the conflict marker and A pendingCount 0 (server: ${JSON.stringify(serverContent(server))}, A: ${JSON.stringify(localContent(a))}, pending: ${pending(a)})`
    );
    expect(serverContent(server)).toContain('--- conflicting change from another device ---');
    expect(pending(a)).toBe(0);
  }, 20000);
  it('5: WHEN the server answers the restart catch-up 600 ms late (real network timing) and B edited another line while A was closed THEN within 10 s the server\'s n1 content contains both A-OFFLINE-EDIT and B-ONLINE-EDIT, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    remoteEdit(server, 'line1\nB-ONLINE-EDIT');
    server.catchUpDelayMs = 600;
    const a = openA(dir, server);
    await waitFor(
      () => {
        const c = serverContent(server);
        return c.includes('A-OFFLINE-EDIT') && c.includes('B-ONLINE-EDIT') && pending(a) === 0;
      },
      10000,
      () => `server has both edits and A pendingCount 0 (server: ${JSON.stringify(serverContent(server))}, A: ${JSON.stringify(localContent(a))}, pending: ${pending(a)})`
    );
    expect(serverContent(server)).toContain('A-OFFLINE-EDIT');
    expect(serverContent(server)).toContain('B-ONLINE-EDIT');
    expect(pending(a)).toBe(0);
  }, 20000);

  it('6: WHEN A reopens with a change version the server no longer knows (so the catch-up is a full re-index) after B edited another line THEN within 10 s the server\'s n1 content contains both A-OFFLINE-EDIT and B-ONLINE-EDIT, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    remoteEdit(server, 'line1\nB-ONLINE-EDIT');
    const ghostsPath = join(dir, 'ghosts-note.json');
    const ghosts = JSON.parse(readFileSync(ghostsPath, 'utf8'));
    ghosts.cv = 'not-a-number';
    writeFileSync(ghostsPath, JSON.stringify(ghosts));
    const a = openA(dir, server);
    await waitFor(
      () => {
        const c = serverContent(server);
        return c.includes('A-OFFLINE-EDIT') && c.includes('B-ONLINE-EDIT') && pending(a) === 0;
      },
      10000,
      () => `server has both edits after a re-index (server: ${JSON.stringify(serverContent(server))}, A: ${JSON.stringify(localContent(a))}, pending: ${pending(a)})`
    );
    expect(serverContent(server)).toContain('A-OFFLINE-EDIT');
    expect(pending(a)).toBe(0);
  }, 20000);

  it('7: WHEN client A edits n1 offline to A-OFFLINE-EDIT\\nline2, no other device changes n1, and the server answers the restart catch-up with nothing (no c: reply at all, so the channel never emits ready) THEN within 10 s the server\'s n1 content is exactly A-OFFLINE-EDIT\\nline2, and A\'s pendingCount is 0', async () => {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'A-OFFLINE-EDIT\nline2');
    server.dropEmptyCatchUpReply = true;
    const a = openA(dir, server);
    await waitFor(
      () => serverContent(server) === 'A-OFFLINE-EDIT\nline2' && pending(a) === 0,
      10000,
      () => `server has the offline edit and A pendingCount 0 (server: ${JSON.stringify(serverContent(server))}, A: ${JSON.stringify(localContent(a))}, pending: ${pending(a)})`
    );
    expect(serverContent(server)).toBe('A-OFFLINE-EDIT\nline2');
    expect(pending(a)).toBe(0);
  }, 20000);
});

describe('T313/T314 the offline edit lands exactly once', () => {
  async function restartWith(offline: string, remote: string): Promise<{ server: FakeSimperiumServer; a: Built }> {
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, offline);
    remoteEdit(server, remote);
    return { server, a: openA(dir, server) };
  }

  it('8: WHEN client A appends A-EDIT-OFFLINE to line1\\nline2 offline, B appends B-EDIT-ONLINE online, and A restarts THEN within 10 s the server\'s n1 content is exactly line1\\nline2\\n\\nA-EDIT-OFFLINE\\n\\nB-EDIT-ONLINE and stays so 1500 ms later, and A\'s pendingCount is 0', async () => {
    const want = 'line1\nline2\n\nA-EDIT-OFFLINE\n\nB-EDIT-ONLINE';
    const { server, a } = await restartWith(BASE + '\n\nA-EDIT-OFFLINE', BASE + '\n\nB-EDIT-ONLINE');
    await waitFor(() => serverContent(server) === want && pending(a) === 0, 10000,
      () => `exact merged content (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)})`);
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(() => serverContent(server) === want && localContent(a) === want && pending(a) === 0, 1000,
      () => `content unchanged after settling (server: ${JSON.stringify(serverContent(server))}, A: ${JSON.stringify(localContent(a))})`);
    expect(serverContent(server)).toBe(want);
    expect(pending(a)).toBe(0);
  }, 20000);

  it('9: WHEN A changes line 1 to A-OFFLINE-EDIT offline, B changes line 2 to B-ONLINE-EDIT online, and A restarts THEN within 10 s the server\'s n1 content is exactly A-OFFLINE-EDIT\\nB-ONLINE-EDIT and stays so 1500 ms later', async () => {
    const want = 'A-OFFLINE-EDIT\nB-ONLINE-EDIT';
    const { server, a } = await restartWith('A-OFFLINE-EDIT\nline2', 'line1\nB-ONLINE-EDIT');
    await waitFor(() => serverContent(server) === want && pending(a) === 0, 10000,
      () => `exact merged content (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)})`);
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(() => serverContent(server) === want && localContent(a) === want, 1000,
      () => `content unchanged after settling (server: ${JSON.stringify(serverContent(server))})`);
    expect(serverContent(server)).toBe(want);
  }, 20000);

  it('10: WHEN A and B both change line 1 (A-OFFLINE-EDIT vs B-CHANGED-LINE-ONE) and A restarts THEN within 10 s the server\'s n1 content is exactly A-OFFLINE-EDIT\\nline2\\n\\n--- conflicting change from another device ---\\nB-CHANGED-LINE-ONE\\nline2', async () => {
    const want = 'A-OFFLINE-EDIT\nline2\n\n--- conflicting change from another device ---\nB-CHANGED-LINE-ONE\nline2';
    const { server, a } = await restartWith('A-OFFLINE-EDIT\nline2', 'B-CHANGED-LINE-ONE\nline2');
    await waitFor(() => serverContent(server) === want && pending(a) === 0, 10000,
      () => `exact conflict layout (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)})`);
    expect(serverContent(server)).toBe(want);
  }, 20000);

  it('11: WHEN client A deletes line2 offline (content line1), B changes n1 to line1\\nline2\\n\\nB-EDIT-ONLINE, and A restarts THEN within 10 s the server\'s n1 content is exactly line1\\n\\nB-EDIT-ONLINE and A\'s pendingCount is 0, and 1500 ms later it is still exactly that (run this scenario 4 times inside the one it(), fresh server and dir each time; each it() gets a timeout of 60000 ms)', async () => {
    const want = 'line1\n\nB-EDIT-ONLINE';
    // 4 independent runs, fresh fake server and data dir each time.
    for (let run = 1; run <= 4; run++) {
      const { server, a } = await restartWith('line1', 'line1\nline2\n\nB-EDIT-ONLINE');
      try {
        await waitFor(
          () => serverContent(server) === want && pending(a) === 0,
          10000,
          () => `run ${run}: server has the merged delete (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)})`
        );
        await new Promise((r) => setTimeout(r, 1500));
        await waitFor(
          () => serverContent(server) === want && pending(a) === 0,
          1000,
          () => `run ${run}: content unchanged after settling (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)})`
        );
        expect(serverContent(server)).toBe(want);
        expect(pending(a)).toBe(0);
      } finally {
        // tear this run down before the next fresh server is started
        a.stopSaving();
        a.store.stopSync?.();
        open.splice(open.indexOf(a), 1);
        server.stop();
        servers.splice(servers.indexOf(server), 1);
      }
    }
  }, 60000);

  it('12: WHEN the scenario of line 11 runs once THEN every 0:c: change the client sends for n1 after the restart carries the same ccid (collect the entries of server.received added after A opened that start with 0:c: and contain "id":"n1", read each one\'s ccid, and expect exactly 1 distinct value; a resend of the same change is allowed, a second different change is the bug)', async () => {
    const want = 'line1\n\nB-EDIT-ONLINE';
    const server = await startServer();
    const dir = await syncedDir(server);
    editOffline(dir, 'line1');
    remoteEdit(server, 'line1\nline2\n\nB-EDIT-ONLINE');
    const receivedAtOpen = server.received.length;
    const a = openA(dir, server);
    const ccidsForN1 = (): string[] => {
      const ccids = new Set<string>();
      for (const m of server.received.slice(receivedAtOpen)) {
        // the client sends `0:c:{...}` — a single change object, not an array
        if (m.startsWith('0:c:{') && m.includes('"id":"n1"')) {
          const change = JSON.parse(m.slice(4)) as { ccid?: string };
          if (change.ccid !== undefined) ccids.add(change.ccid);
        }
      }
      return [...ccids];
    };
    await waitFor(
      () => serverContent(server) === want && pending(a) === 0 && ccidsForN1().length >= 1,
      10000,
      () => `merged change landed (server: ${JSON.stringify(serverContent(server))}, pending: ${pending(a)}, ccids for n1: ${JSON.stringify(ccidsForN1())})`
    );
    // the second, re-deletion change (-6 =14) shows up as soon as the ack
    // is misread as another device's change, so give it time to arrive
    await new Promise((r) => setTimeout(r, 1500));
    expect(ccidsForN1()).toHaveLength(1);
  }, 20000);
});
