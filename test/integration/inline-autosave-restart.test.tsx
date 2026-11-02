/**
 * #387: text typed in the inline editor is in the note after a kill or a
 * quit, once. The kill is simulated at the disk level as in
 * test/integration/kill-after-save.test.ts: N ms after the timed store the
 * data dir is copied (what a SIGKILL leaves behind), the server stops taking
 * change frames from the dying process, and the restart runs on the copy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2MK';
const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';

type Built = ReturnType<typeof buildStore>;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
const unmounts: (() => void)[] = [];

afterEach(() => {
  for (const u of unmounts.splice(0)) u();
  for (const b of open.splice(0)) close(b);
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function close(b: Built): void {
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
}

function stop(b: Built): void {
  close(b);
  open.splice(open.indexOf(b), 1);
}

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-387-'));
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
      data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] },
      version: 1,
    },
  ]);
  return server;
}

function openA(dataDir: string, serverUrl: string, noteEditDelayMs?: number): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: serverUrl, noteEditDelayMs }, { email: EMAIL, token: TOKEN }, () => {});
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

const serverContent = (server: FakeSimperiumServer) => String(server.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const localContent = (b: Built) => b.store.getState().data.notes.get('n1' as never)?.content;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);
const noteCount = (b: Built) => b.store.getState().data.notes.size;

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

/** Sync n1 into a fresh data dir, render the App on that store and open n1 in the inline editor. */
async function syncedAndOpen(server: FakeSimperiumServer, dir: string) {
  const a = openA(dir, server.url);
  await waitFor(() => localContent(a) === BASE && pending(a) === 0 && stateHolds(dir, BASE), 8000, () => 'A synced n1 and state.json holds it');
  const r = render(<App store={a.store} width={80} height={24} />);
  unmounts.push(r.unmount);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'line1');
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, FOOTER);
  return { a, r };
}

async function expectKept(server: FakeSimperiumServer, b: Built): Promise<void> {
  const want = () => serverContent(server) === MK && localContent(b) === MK && pending(b) === 0 && noteCount(b) === 1;
  await waitFor(want, 8000, () =>
    `server and store n1 are MK once, nothing pending, 1 note (server: ${JSON.stringify(serverContent(server))}, store: ${JSON.stringify(localContent(b))}, pending: ${pending(b)}, notes: ${noteCount(b)})`,
  );
  expect(serverContent(server)).toBe('line1\nline2MK');
  expect(localContent(b)).toBe('line1\nline2MK');
  expect(pending(b)).toBe(0);
  expect(noteCount(b)).toBe(1);
}

/** Type `MK`, let the timer store it, "kill" snote killAfterMs later and restart on the copy. */
async function storeThenKill(killAfterMs: number): Promise<void> {
  const server = await startServer();
  const flag = ignoreChanges(server);
  const dir = newDir();
  const killed = newDir();
  const { a, r } = await syncedAndOpen(server, dir);
  let storedAt = 0;
  const dead = new Promise<void>((resolve) => {
    const unsub = a.store.subscribe(() => {
      if (localContent(a) !== MK) return;
      unsub();
      storedAt = Date.now();
      setTimeout(() => {
        flag.on = true;
        // the instance lock is left out: its pid (this test runner) is alive
        cpSync(dir, killed, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
        resolve();
      }, killAfterMs);
    });
  });
  const typed = Date.now();
  r.stdin.write('M');
  r.stdin.write('K');
  await dead;
  // the timer stores 1500 ms after the last key, well inside 3000 ms
  expect(storedAt - typed).toBeLessThan(3000);
  stop(a);
  flag.on = false;
  const b = openA(killed, server.url, 10);
  await expectKept(server, b);
  stop(b);
  unmounts.splice(unmounts.indexOf(r.unmount), 1);
  r.unmount();
}

describe('#387 inline text survives a kill or a quit once', () => {
  it('7: WHEN n1 `line1\\nline2` is synced from the fake server (real send delay), the App is rendered on that buildStore store, n1 is opened with `i`, `MK` is written and stored by the timer, and snote is killed 50 ms later (data dir copied, server ignores change frames) and restarts on the copy THEN the server\'s and store\'s n1 are exactly `line1\\nline2MK`, pendingCount is `0` and the store holds `1` note; and the same with a kill 900 ms after the store', async () => {
    await storeThenKill(50);
    await storeThenKill(900);
  }, 20000);

  it('8: WHEN n1 `line1\\nline2` is synced, opened with `i` in the App on that store, `MK` is written and the App is unmounted at once (before 1500 ms), then stopSaving runs and snote restarts on that data dir THEN n1 held `line1\\nline2MK` right after the unmount, and the server\'s and store\'s n1 are exactly `line1\\nline2MK`, pendingCount `0`, `1` note', async () => {
    const server = await startServer();
    const dir = newDir();
    const { a, r } = await syncedAndOpen(server, dir);
    const typed = Date.now();
    r.stdin.write('M');
    r.stdin.write('K');
    await waitForFrame(r.lastFrame, 'line2MK');
    unmounts.splice(unmounts.indexOf(r.unmount), 1);
    r.unmount();
    const afterUnmount = localContent(a);
    expect(Date.now() - typed).toBeLessThan(1500);
    expect(afterUnmount).toBe('line1\nline2MK');
    stop(a);
    const b = openA(dir, server.url, 10);
    await expectKept(server, b);
  }, 20000);
});
