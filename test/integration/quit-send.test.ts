/**
 * #401 — a quit hands the pending note changes to the server at once and
 * waits at most QUIT_SEND_MS for the acknowledgements; never when offline,
 * never before this store's note catch-up is applied, and it stops waiting
 * when the connection drops. Stores come from the real buildStore against
 * the fake server, with the real 2000 ms note-edit delay.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { saveInlineEdit } from '../../src/tui/app-actions';
import { sendBeforeQuit } from '../../src/core/quit-send';

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
    (b.store.client as { end?: () => void } | undefined)?.end?.();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) stopServer(s);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms): ${label()}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function noteData(content: string): Record<string, unknown> {
  return { content, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] };
}

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [{ id: 'n1', data: noteData(BASE), version: 1 }]);
  return server;
}

/** Stop the fake server and close every socket it holds open. */
function stopServer(server: FakeSimperiumServer): void {
  server.stop();
  for (const socket of server.openSockets) socket.destroy();
}

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-401-'));
  dirs.push(dir);
  return dir;
}

function openStore(dir: string, url: string): Built {
  const built = buildStore({ dataDir: dir, appId: APP_ID, server: url }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}

const status = (b: Built) => b.store.getState().simperium.connectionStatus;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);
const local = (b: Built) => b.store.getState().data.notes.get('n1' as never)?.content;
const remote = (s: FakeSimperiumServer) => String(s.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');

async function synced(server: FakeSimperiumServer, dir = newDir()): Promise<{ dir: string; b: Built }> {
  const b = openStore(dir, server.url);
  await waitFor(() => local(b) === BASE && pending(b) === 0 && status(b) === 'green', 8000, () => `n1 synced (store ${JSON.stringify(local(b))}, pending ${pending(b)}, ${status(b)})`);
  // the first sync's catch-up (the index) has been applied once the record is set
  await waitFor(() => catchUpApplied(b), 8000, () => 'catch-up record set');
  return { dir, b };
}

function catchUpApplied(b: Built): boolean {
  return (b.store as unknown as Record<symbol, unknown>)[Symbol.for('snote.noteCatchUpApplied')] === true;
}

function store(b: Built, content: string): void {
  const note = b.store.getState().data.notes.get('n1' as never)!;
  saveInlineEdit({ store: b.store, selectedEntry: { id: 'n1' as never, note }, base: note.content, local: content });
}

function frameNamingN1(server: FakeSimperiumServer, from: number, to = server.received.length): boolean {
  return server.received.slice(from, to).some((m) => m.startsWith('0:c:') && m.includes('"n1"'));
}

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

function names(dir: string, file: string): boolean {
  try {
    return readFileSync(join(dir, file), 'utf8').includes('"n1"');
  } catch {
    return false;
  }
}

function installFilters(server: FakeSimperiumServer): { holdReplies: { on: boolean }; ignoreChanges: { on: boolean } } {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const realSend = priv.send.bind(server);
  const realHandleChange = priv.handleChange.bind(server);
  const holdReplies = { on: false };
  const ignoreChanges = { on: false };
  priv.send = (ws: unknown, message: string) => {
    if (holdReplies.on && /^\d+:c:\[/.test(message)) return;
    realSend(ws, message);
  };
  priv.handleChange = (...args: unknown[]) => {
    if (ignoreChanges.on) return;
    realHandleChange(...args);
  };
  return { holdReplies, ignoreChanges };
}

async function timed(p: Promise<number>): Promise<{ result: number; ms: number; at: number }> {
  const start = Date.now();
  const result = await p;
  const at = Date.now();
  return { result, ms: at - start, at };
}

describe('#401 a quit sends pending note changes before it exits', () => {
  it('1: WHEN n1 `line1\\nline2` is synced, saveInlineEdit stores `line1\\nline2\\nMK` and sendBeforeQuit is called 60 ms later THEN it resolves to `0` in under `1500` ms, and at that moment the server\'s n1 is exactly `line1\\nline2\\nMK` and pendingCount is `0`', { timeout: 10000 }, async () => {
    const server = await startServer();
    const { b } = await synced(server);
    store(b, MK);
    await new Promise((r) => setTimeout(r, 60)); // the 60 ms of the line, not a wait for a result
    let seen: { server: string; pending: number } | undefined;
    const run = timed(sendBeforeQuit(b.store).then((n) => { seen = { server: remote(server), pending: pending(b) }; return n; }));
    let out: { result: number; ms: number } | undefined;
    void run.then((o) => { out = o; });
    await waitFor(() => out !== undefined, 4800, () => 'sendBeforeQuit resolved');
    expect(out!.result).toBe(0);
    expect(out!.ms).toBeLessThan(1500);
    expect(seen).toEqual({ server: MK, pending: 0 });
  });

  it('2: WHEN n1 `line1\\nline2` is synced, the fake server is stopped, the store reports not connected, `line1\\nline2\\nMK` is stored and sendBeforeQuit is called THEN it resolves to `1` within `100` ms, no `0:c:` frame naming n1 was received by the server, and state.json and unsynced.json both name n1 with `line1\\nline2\\nMK` in state.json', async () => {
    const server = await startServer();
    const { dir, b } = await synced(server);
    stopServer(server);
    await waitFor(() => status(b) !== 'green', 2000, () => `store not connected (${status(b)})`);
    store(b, MK);
    const out = await timed(sendBeforeQuit(b.store, 2000));
    expect(out.result).toBe(1);
    expect(out.ms).toBeLessThanOrEqual(100);
    expect(frameNamingN1(server, 0)).toBe(false);
    await waitFor(() => stateHolds(dir, MK) && names(dir, 'unsynced.json'), 2000, () => 'state.json holds MK and unsynced.json names n1');
    expect(stateHolds(dir, MK) && names(dir, 'unsynced.json') && names(dir, 'state.json')).toBe(true);
  });

  it('3: WHEN n1 `line1\\nline2` is synced, the server applies the change but withholds every `0:c:[` reply, `line1\\nline2\\nMK` is stored and sendBeforeQuit is called with the default bound THEN it resolves to `1` no sooner than `3900` ms and no later than `4600` ms after the call, the server\'s n1 is exactly `line1\\nline2\\nMK`, and sent-changes.json and unsynced.json both name n1', { timeout: 12000 }, async () => {
    const server = await startServer();
    const filters = installFilters(server);
    const { dir, b } = await synced(server);
    filters.holdReplies.on = true;
    store(b, MK);
    const out = await timed(sendBeforeQuit(b.store));
    expect(out.result).toBe(1);
    expect(out.ms).toBeGreaterThanOrEqual(3900);
    expect(out.ms).toBeLessThanOrEqual(4600);
    expect(remote(server)).toBe(MK);
    expect(names(dir, 'sent-changes.json') && names(dir, 'unsynced.json')).toBe(true);
  });

  it('4: WHEN n1 `line1\\nline2` is synced, the server ignores incoming change frames, `line1\\nline2\\nMK` is stored, sendBeforeQuit is called with a bound of `3000` ms and the fake server is stopped 200 ms later THEN it resolves to `1` within `700` ms of the stop, and state.json still holds `line1\\nline2\\nMK` for n1', { timeout: 8000 }, async () => {
    const server = await startServer();
    const filters = installFilters(server);
    const { dir, b } = await synced(server);
    filters.ignoreChanges.on = true;
    store(b, MK);
    const run = timed(sendBeforeQuit(b.store, 3000));
    await new Promise((r) => setTimeout(r, 200)); // the 200 ms of the line, not a wait for a result
    const stoppedAt = Date.now();
    stopServer(server);
    const out = await run;
    expect(out.result).toBe(1);
    expect(out.at - stoppedAt).toBeLessThanOrEqual(700);
    await waitFor(() => stateHolds(dir, MK), 2000, () => 'state.json holds MK');
    expect(stateHolds(dir, MK)).toBe(true);
  });

  it('9: WHEN n1 `line1\\nline2` is synced and stopped with stopSaving, the fake server\'s catchUpDelayMs is set to 5000, snote restarts on the same data dir through the real buildStore, the store reports connected (`green`) before its note catch-up is applied, `line1\\nline2\\nMK` is stored and sendBeforeQuit is called with a bound of `2000` ms THEN it resolves to `1` within `100` ms and no `0:c:` frame naming n1 was received by the server between the restart and the moment it resolves (if the store never reports `green` before the catch-up, STOP: the precondition is false)', { timeout: 15000 }, async () => {
    const server = await startServer();
    const first = await synced(server);
    first.b.stopSaving();
    (first.b.store.client as { end?: () => void } | undefined)?.end?.();
    first.b.store.stopSync?.();
    open.splice(open.indexOf(first.b), 1);
    server.catchUpDelayMs = 5000;
    const from = server.received.length;
    const b = openStore(first.dir, server.url);
    await waitFor(() => status(b) === 'green' && local(b) === BASE, 3000, () => `green before the catch-up (${status(b)})`);
    expect(catchUpApplied(b)).toBe(false);
    store(b, MK);
    const out = await timed(sendBeforeQuit(b.store, 2000));
    const to = server.received.length;
    expect(out.result).toBe(1);
    expect(out.ms).toBeLessThanOrEqual(100);
    expect(status(b)).toBe('green');
    expect(frameNamingN1(server, from, to)).toBe(false);
  });
});
