/**
 * (#707): an offline edit held for the start-up hand-off (src/core/held-unsynced.ts) is unsent
 * work until the hand-off sends it: the status bar never says `synced` and shows it pending, status.json
 * records no sync time, the quit line counts it, and logout asks for the typed `logout` confirm.
 * Lines 1-3 hold an id on a stub store; line 4 is a real restart through buildStore with the edit held
 * (offline start: the hand-off waits for the catch-up the whole session). Line 6 restarts online with a late
 * catch-up and sees the bar go from `1 pending` to `synced`; line 7 runs a hand-off that sends nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { holdId, isHeld, releaseAll, unsentCount } from '../../src/core/held-unsynced';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { makeNote } from '../tui/fixtures';
import { pendingCount } from '../../src/core/simperium-reducer';
import { sendBeforeQuit, unsentLine } from '../../src/core/quit-send';
import { watchStatus } from '../../src/core/status-file';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const APP_ID = 'test-app';
const BASE = 'line1\nline2';
const OFF = 'line1\nline2\nOFF';
const OFFLINE_URL = 'ws://127.0.0.1:9';
const UNSENT = '1 change not sent yet: it is kept on this computer and sent the next time snote starts';
const TYPED = "log out: 1 unsynced change will be deleted. Please type 'logout' to confirm";

type Built = ReturnType<typeof buildStore>;
const open: Built[] = [];
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const b of open.splice(0)) stop(b);
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-f380-'));
  dirs.push(d);
  return d;
}

function openAt(dataDir: string, url: string): Built {
  const b = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
  open.push(b);
  return b;
}

function stop(b: Built): void {
  const i = open.indexOf(b);
  if (i >= 0) open.splice(i, 1);
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
}

const read = (dir: string, name: string): string => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
};

/** A connected stub store with nothing pending and note n1 held for the hand-off. */
function heldStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as never);
  holdId(store, 'n1');
  return store;
}

describe('a held offline edit counts as unsent until its hand-off is sent', () => {
  it('1: WHEN the store is connected (`green`), pendingCount is `0` and n1 is held THEN the App frame contains `1 pending` and does not contain `synced`', { timeout: 8000 }, async () => {
    const store = heldStore();
    expect(pendingCount(store.getState().simperium)).toBe(0);
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('1 pending') && !f.includes('synced'));
    expect(frame).toContain('1 pending');
    expect(frame).not.toContain('synced');
    unmount();
  });

  it(`2: WHEN line 1's store is shown and \`L\` is written THEN the frame contains "${TYPED}" and does not contain "log out and delete local data?"`, { timeout: 8000 }, async () => {
    const store = heldStore();
    const { stdin, lastFrame, unmount } = render(<App store={store} width={120} height={24} onLogout={() => {}} />);
    await waitForInput(stdin);
    stdin.write('L');
    const frame = await waitForFrame(lastFrame, (f) => f.includes("Please type 'logout' to confirm"));
    expect(frame.replace(/\s*\n\s*/g, ' ')).toContain(TYPED);
    expect(frame).not.toContain('log out and delete local data?');
    unmount();
  });

  it('3: WHEN status.json is watched for line 1\'s store and a note is created THEN the written status has `synced` null; after releaseAll and one more note it has a `synced` time', { timeout: 8000 }, async () => {
    const store = heldStore();
    const dir = tmp();
    const stopStatus = watchStatus(store, dir, { delayMs: 0 });
    const synced = (): unknown => (JSON.parse(read(dir, 'status.json') || '{"count":-1}') as { synced?: unknown; count: number });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'a', note: { content: 'a' } } as never);
    await waitFor(() => (synced() as { count: number }).count === 1, 3000, () => `status.json ${read(dir, 'status.json')}`);
    expect((synced() as { synced: unknown }).synced).toBeNull();
    releaseAll(store);
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'b', note: { content: 'b' } } as never);
    await waitFor(() => (synced() as { count: number }).count === 2, 3000, () => `status.json ${read(dir, 'status.json')}`);
    stopStatus();
    expect(typeof (synced() as { synced: unknown }).synced).toBe('string');
  });

  it(`4: WHEN n1 was edited offline to \`${JSON.stringify(OFF)}\` and snote restarts offline through the real buildStore with n1 held THEN pendingCount is \`0\`, unsentCount is \`1\`, the App frame contains \`1 pending\`, \`L\` shows the typed confirm, sendBeforeQuit resolves to \`0\` and unsentLine(unsentCount) is "${UNSENT}"`, { timeout: 20000 }, async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 },
    ]);
    const dir = tmp();
    const a = openAt(dir, server.url);
    await waitFor(() => read(dir, 'ghosts-note.json').includes('n1') && read(dir, 'state.json').includes('line2'), 10000, () => 'first sync');
    stop(a);
    const b = openAt(dir, OFFLINE_URL);
    b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF } } as never);
    await waitFor(() => read(dir, 'state.json').includes('OFF') && read(dir, 'unsynced.json').includes('n1'), 10000, () => 'offline save');
    stop(b);
    const c = openAt(dir, OFFLINE_URL);
    await waitFor(() => isHeld(c.store, 'n1'), 10000, () => 'n1 held at the offline start');
    expect(pendingCount(c.store.getState().simperium)).toBe(0);
    expect(unsentCount(c.store)).toBe(1);
    const { stdin, lastFrame, unmount } = render(<App store={c.store} width={120} height={24} onLogout={() => {}} />);
    await waitForInput(stdin);
    expect(await waitForFrame(lastFrame, '1 pending')).toContain('1 pending');
    stdin.write('L');
    const frame = await waitForFrame(lastFrame, (f) => f.includes("Please type 'logout' to confirm"));
    expect(frame.replace(/\s*\n\s*/g, ' ')).toContain(TYPED);
    unmount();
    expect(await sendBeforeQuit(c.store as never, 500)).toBe(0);
    expect(unsentLine(unsentCount(c.store))).toBe(UNSENT);
  });

  it('5: WHEN src/cli/main.tsx is read THEN its quit step prints the line for `unsentCount(quitStore)` after `await sendBeforeQuit(quitStore);`', () => {
    const main = readFileSync(join(__dirname, '../../src/cli/main.tsx'), 'utf8');
    const send = main.indexOf('await sendBeforeQuit(quitStore);');
    const count = main.indexOf('const unsent = unsentCount(quitStore);');
    expect({ send: send > 0, count: count > send, line: main.indexOf('if (unsent > 0) log(unsentLine(unsent));') > count }).toEqual({ send: true, count: true, line: true });
  });

  it(`6: WHEN n1 was edited offline to \`${JSON.stringify(OFF)}\` and snote restarts online with the catch-up 1000 ms late THEN the App frame shows \`1 pending\` while n1 is held, then \`synced\` with no \`pending\` once the hand-off is sent, and the server holds exactly \`${JSON.stringify(OFF)}\``, { timeout: 20000 }, async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 },
    ]);
    const dir = tmp();
    const a = openAt(dir, server.url);
    await waitFor(() => read(dir, 'ghosts-note.json').includes('n1') && read(dir, 'state.json').includes('line2'), 10000, () => 'first sync');
    stop(a);
    const b = openAt(dir, OFFLINE_URL);
    b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF } } as never);
    await waitFor(() => read(dir, 'state.json').includes('OFF') && read(dir, 'unsynced.json').includes('n1'), 10000, () => 'offline save');
    stop(b);
    server.catchUpDelayMs = 1000;
    const c = openAt(dir, server.url);
    await waitFor(() => isHeld(c.store, 'n1'), 10000, () => 'n1 held at the online start');
    const { stdin, lastFrame, unmount } = render(<App store={c.store} width={120} height={24} />);
    await waitForInput(stdin);
    expect(await waitForFrame(lastFrame, '1 pending')).toContain('1 pending');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('synced') && !f.includes('pending') && String(server.getObject(APP_ID, 'note', 'n1')?.data.content) === OFF);
    expect(frame).toContain('synced');
    expect(frame).not.toContain('pending');
    expect(server.getObject(APP_ID, 'note', 'n1')?.data.content).toBe(OFF);
    unmount();
  });

  it('7: WHEN n1 is held with the App and status.json watching, and the hand-off after the catch-up sends nothing (the server copy already equals the offline copy) THEN the frame goes from `1 pending` to `synced` with no `pending` and status.json gets a `synced` time, with no other store change', { timeout: 8000 }, async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as never);
    const local = makeNote('n1', OFF, { modificationDate: 3000 });
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1', note: local } as never);
    let caughtUp = false;
    let release = (): void => {};
    const gate = new Promise<void>((r) => (release = r));
    const ghosts: GhostReader = { get: async () => ({ data: caughtUp ? { ...local } : { ...local, content: BASE, modificationDate: 2000 } }) };
    const dir = tmp();
    const stopStatus = watchStatus(store, dir, { delayMs: 0 });
    const status = (): { synced?: unknown } => JSON.parse(read(dir, 'status.json') || '{}') as { synced?: unknown };
    const done = requeueUnsynced(store as never, ghosts, async () => {
      await gate;
      caughtUp = true;
    });
    await waitFor(() => isHeld(store, 'n1'), 3000, () => 'n1 held');
    expect(pendingCount(store.getState().simperium)).toBe(0);
    const { stdin, lastFrame, unmount } = render(<App store={store} width={120} height={24} />);
    await waitForInput(stdin);
    expect(await waitForFrame(lastFrame, '1 pending')).toContain('1 pending');
    release();
    expect(await done).toEqual(['n1']);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('synced') && !f.includes('pending'));
    expect(frame).toContain('synced');
    expect(frame).not.toContain('pending');
    await waitFor(() => typeof status().synced === 'string', 3000, () => `status.json ${read(dir, 'status.json')}`);
    stopStatus();
    expect(typeof status().synced).toBe('string');
    unmount();
  });
});
