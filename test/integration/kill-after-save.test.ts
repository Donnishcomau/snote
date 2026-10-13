/**
 * T533 (F198): an edit saved shortly before snote is killed is kept after
 * restart. The kill is simulated exactly at the disk level: N ms after the
 * save, the data dir is copied synchronously (what a SIGKILL leaves behind),
 * the server stops accepting change frames from the dying process, and the
 * restart runs on the copy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { saveInlineEdit, editSelectedNote } from '../../src/tui/app-actions';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';

type Built = ReturnType<typeof buildStore>;
type Mode = 'inline' | 'external' | 'never-got-it';

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(() => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    (b.store.client as unknown as { end?: () => void })?.end?.();
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

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t533-'));
  dirs.push(dir);
  return dir;
}

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    {
      id: 'n1',
      data: {
        content: BASE,
        creationDate: 1000,
        deleted: false,
        modificationDate: 2000,
        systemTags: [],
        tags: [],
      },
      version: 1,
    },
  ]);
  return server;
}

function openA(dataDir: string, serverUrl: string, noteEditDelayMs?: number): Built {
  const built = buildStore(
    { dataDir, appId: APP_ID, server: serverUrl, noteEditDelayMs },
    { email: EMAIL, token: TOKEN },
    () => {}
  );
  open.push(built);
  return built;
}

/** The server ignores every incoming `c` frame while `on` is set. */
function ignoreChanges(server: FakeSimperiumServer): { on: boolean } {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const real = priv.handleChange.bind(server);
  const flag = { on: false };
  priv.handleChange = (...args: unknown[]) => {
    if (flag.on) return;
    real(...args);
  };
  return flag;
}

const serverContent = (server: FakeSimperiumServer) =>
  String(server.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const localContent = (built: Built) =>
  built.store.getState().data.notes.get('n1' as never)?.content;
const pending = (built: Built) => pendingCount(built.store.getState().simperium);

function stateHolds(dir: string, content: string): boolean {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
      data?: { notes?: { __map?: [string, { content?: string }][] } };
    };
    return state.data?.notes?.__map?.find(([id]) => id === 'n1')?.[1]?.content === content;
  } catch {
    return false;
  }
}

/**
 * Sync n1, save `line1\nline2\nMK` through the given path, and "kill" the
 * process `killAfterMs` after the edit reached the store: copy the data dir
 * as it is on disk at that instant and stop the server taking change frames
 * from the dying process. Then restart on the copy with the server open.
 */
async function saveThenKill(mode: Mode, killAfterMs: number) {
  const server = await startServer();
  const flag = ignoreChanges(server);
  const dir = newDir();
  const killed = newDir();
  // inline and external keep the real send delay (the frame has not left at
  // the kill); never-got-it sends at once and the server drops the frame.
  const a = openA(dir, server.url, mode === 'never-got-it' ? 10 : undefined);
  await waitFor(
    () => localContent(a) === BASE && pending(a) === 0 && stateHolds(dir, BASE),
    8000,
    'A synced n1 and state.json holds it'
  );
  if (mode === 'never-got-it') flag.on = true;
  const dead = new Promise<void>((resolve) => {
    const unsub = a.store.subscribe(() => {
      if (localContent(a) !== MK) return;
      unsub();
      setTimeout(() => {
        flag.on = true;
        // the instance lock is left out: its pid (this test runner) is alive
        cpSync(dir, killed, {
          recursive: true,
          filter: (src) => !src.endsWith('instance.lock'),
        });
        resolve();
      }, killAfterMs);
    });
  });
  const note = a.store.getState().data.notes.get('n1' as never)!;
  const selectedEntry = { id: 'n1' as never, note };
  if (mode === 'external') {
    editSelectedNote({
      store: a.store,
      selectedEntry,
      setRawMode: () => {},
      runEditor: async () => MK,
    } as never);
  } else {
    saveInlineEdit({ store: a.store, selectedEntry, base: BASE, local: MK } as never);
  }
  await dead;
  a.stopSaving();
  (a.store.client as unknown as { end?: () => void })?.end?.();
  a.store.stopSync?.();
  open.splice(open.indexOf(a), 1);
  const serverHadIt = serverContent(server) === MK;
  flag.on = false;
  const b = openA(killed, server.url, 10);
  return { server, b, serverHadIt };
}

async function expectKept(server: FakeSimperiumServer, b: Built, recheck: boolean) {
  const want = () => serverContent(server) === MK && localContent(b) === MK && pending(b) === 0;
  await waitFor(want, 8000, () =>
    `server and store n1 are MK once, nothing pending (server: ${JSON.stringify(
      serverContent(server)
    )}, store: ${JSON.stringify(localContent(b))}, pending: ${pending(b)})`
  );
  if (recheck) {
    await new Promise((r) => setTimeout(r, 1500));
    await waitFor(want, 1000, 'still MK once after 1500 ms');
  }
  expect(serverContent(server)).toBe('line1\nline2\nMK');
  expect(localContent(b)).toBe('line1\nline2\nMK');
  expect(pending(b)).toBe(0);
}

describe('T533 an edit saved just before snote is killed is kept after restart (F198)', () => {
  it('1: WHEN n1 is saved with Ctrl+S as `line1\\nline2\\nMK` and snote is killed 50 ms later, before the edit was sent, and restarts THEN the server\'s and store\'s n1 content is exactly `line1\\nline2\\nMK` and pendingCount is `0`', async () => {
    const { server, b, serverHadIt } = await saveThenKill('inline', 50);
    expect(serverHadIt).toBe(false);
    await expectKept(server, b, false);
  }, 20000);

  it('2: WHEN n1 is saved with Ctrl+S as `line1\\nline2\\nMK` and snote is killed 300 ms later, before the edit was sent, and restarts THEN the server\'s and store\'s n1 content is exactly `line1\\nline2\\nMK` and pendingCount is `0`', async () => {
    const { server, b, serverHadIt } = await saveThenKill('inline', 300);
    expect(serverHadIt).toBe(false);
    await expectKept(server, b, false);
  }, 20000);

  it('3: WHEN n1 is saved from the external editor as `line1\\nline2\\nMK` and snote is killed 300 ms later, before the edit was sent, and restarts THEN the server\'s and store\'s n1 content is exactly `line1\\nline2\\nMK` and pendingCount is `0`', async () => {
    const { server, b, serverHadIt } = await saveThenKill('external', 300);
    expect(serverHadIt).toBe(false);
    await expectKept(server, b, false);
  }, 20000);

  it('4: WHEN n1 is saved with Ctrl+S as `line1\\nline2\\nMK`, the edit is sent but the server never gets it, and snote is killed 300 ms later and restarts THEN the server\'s and store\'s n1 content is exactly `line1\\nline2\\nMK` and pendingCount is `0`', async () => {
    const { server, b, serverHadIt } = await saveThenKill('never-got-it', 300);
    expect(serverHadIt).toBe(false);
    await expectKept(server, b, false);
  }, 20000);

  it('5: WHEN n1 is saved with Ctrl+S as `line1\\nline2\\nMK` and snote is killed 900 ms later, after state.json was saved, and restarts THEN the server\'s and store\'s n1 content is exactly `line1\\nline2\\nMK` once and pendingCount is `0`, also 1500 ms later', async () => {
    const { server, b, serverHadIt } = await saveThenKill('inline', 900);
    expect(serverHadIt).toBe(false);
    await expectKept(server, b, true);
  }, 20000);
});
