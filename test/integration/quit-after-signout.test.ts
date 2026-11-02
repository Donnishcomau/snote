/**
 * #428 — after a sign-out, the quit step (#401) has no store, so a quit from
 * the login screen sends nothing and prints no `not sent yet` line; a store
 * built by the next sign-in becomes the quit step's store again, and a late or
 * repeated sign-out of the old store never clears it. Stores come from the
 * real buildStore against the fake server, wired the way main wires them
 * (quitTarget().track(onLogout) -> buildStore -> bind).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { quitTarget } from '../../src/core/quit-target';
import { pendingCount } from '../../src/core/simperium-reducer';
import { saveInlineEdit } from '../../src/tui/app-actions';
import { sendBeforeQuit, unsentLine } from '../../src/core/quit-send';

const APP_ID = 'test-app';
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';
const UNSENT = '1 change not sent yet: it is kept on this computer and sent the next time snote starts';
const A = { email: 'store1@example.com', token: 'store1-token' };
const B = { email: 'store2@example.com', token: 'store2-token' };

type Built = ReturnType<typeof buildStore>;
type Target = ReturnType<typeof quitTarget<Built['store']>>;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(() => {
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

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 1 },
  ]);
  return server;
}

function stopServer(server: FakeSimperiumServer): void {
  server.stop();
  for (const socket of server.openSockets) socket.destroy();
}

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-428-'));
  dirs.push(dir);
  return dir;
}

interface SignIn {
  b: Built;
  /** The wrapped onLogout main hands to buildStore (what Root's chain finally calls). */
  logout: () => void;
  calls: { n: number };
}

/** One sign-in wired as main's makeStoreFor wires it. */
function signIn(target: Target, server: FakeSimperiumServer, auth: { email: string; token: string }): SignIn {
  const calls = { n: 0 };
  const tracked = target.track(() => { calls.n += 1; });
  const b = buildStore({ dataDir: newDir(), appId: APP_ID, server: server.url, noteEditDelayMs: 8000 }, auth, tracked.onLogout);
  tracked.bind(b.store);
  open.push(b);
  return { b, logout: tracked.onLogout, calls };
}

const status = (b: Built) => b.store.getState().simperium.connectionStatus;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);
const local = (b: Built) => b.store.getState().data.notes.get('n1' as never)?.content;
const caughtUp = (b: Built) => (b.store as unknown as Record<symbol, unknown>)[Symbol.for('snote.noteCatchUpApplied')] === true;

async function synced(target: Target, server: FakeSimperiumServer, auth: { email: string; token: string }): Promise<SignIn> {
  const s = signIn(target, server, auth);
  await waitFor(() => local(s.b) === BASE && pending(s.b) === 0 && status(s.b) === 'green' && caughtUp(s.b), 8000, () => `synced (${status(s.b)}, pending ${pending(s.b)})`);
  return s;
}

function edit(b: Built, content: string): void {
  const note = b.store.getState().data.notes.get('n1' as never)!;
  saveInlineEdit({ store: b.store, selectedEntry: { id: 'n1' as never, note }, base: note.content, local: content });
}

/** Main's quit step: the rule's store, then sendBeforeQuit and the unsent line. */
async function quitStep(target: Target): Promise<{ unsent: number; line: string | null; sent: boolean }> {
  const store = target.current();
  if (!store) return { unsent: 0, line: null, sent: false };
  const unsent = await sendBeforeQuit(store, 1500);
  return { unsent, line: unsent > 0 ? unsentLine(unsent) : null, sent: true };
}

/** A user sign-out: the REALLY_LOG_OUT Root dispatches, through the sync middleware to onLogout. */
async function userSignOut(s: SignIn): Promise<void> {
  s.b.store.dispatch({ type: 'REALLY_LOG_OUT' });
  await waitFor(() => s.calls.n >= 1, 3000, () => 'onLogout called');
}

/** Make the fake server answer the next init with a 401, as a revoked token does. */
function rejectNextInit(server: FakeSimperiumServer): void {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const real = priv.handleInit.bind(server);
  priv.handleInit = (conn: unknown, ws: unknown, data: unknown, channel: unknown) => {
    const init = JSON.parse(String(data)) as Record<string, unknown>;
    init.token = 'revoked-token';
    real(conn, ws, JSON.stringify(init), channel);
  };
}

describe('#428 the quit step follows the sign-out', () => {
  it('1: WHEN a store with `1` pending note change is signed out by the user (the onLogout chain Root runs for a user sign-out) THEN the quit step\'s store is none, the quit step sends nothing and resolves to `0`, and no line holding `not sent yet` is produced', async () => {
    const server = await startServer();
    const target = quitTarget<Built['store']>();
    const a = await synced(target, server, A);
    edit(a.b, MK);
    await waitFor(() => pending(a.b) === 1, 2000, () => 'one change pending');
    expect(target.current()).toBe(a.b.store);
    await userSignOut(a);
    await waitFor(() => target.current() === undefined, 2000, () => 'quit store cleared');
    const out = await quitStep(target);
    expect(target.current()).toBeUndefined();
    expect(out).toEqual({ unsent: 0, line: null, sent: false });
    expect(String(out.line ?? '')).not.toContain('not sent yet');
    expect(pending(a.b)).toBe(1); // the old store still holds the change: only the rule keeps the line away
  });

  it('2: WHEN the fake server rejects the store\'s token (a server-forced sign-out) while `1` note change is pending THEN after onLogout has run the quit step\'s store is none and no line holding `not sent yet` is produced', { timeout: 12000 }, async () => {
    const server = await startServer();
    const target = quitTarget<Built['store']>();
    const a = await synced(target, server, A);
    edit(a.b, MK);
    await waitFor(() => pending(a.b) === 1, 2000, () => 'one change pending');
    rejectNextInit(server);
    server.dropClient(A.email);
    await waitFor(() => a.calls.n >= 1 && target.current() === undefined, 8000, () => `signed out by the server (onLogout ${a.calls.n})`);
    const out = await quitStep(target);
    expect(a.calls.n).toBeGreaterThanOrEqual(1);
    expect(target.current()).toBeUndefined();
    expect(out).toEqual({ unsent: 0, line: null, sent: false });
    expect(String(out.line ?? '')).not.toContain('not sent yet');
    expect(pending(a.b)).toBe(1);
  });

  it('3: WHEN after a sign-out a new store is built for the next sign-in and `1` change is made in it while the server is stopped THEN the quit step\'s store is that new store and the line is `1 change not sent yet: it is kept on this computer and sent the next time snote starts`', { timeout: 12000 }, async () => {
    const server = await startServer();
    const target = quitTarget<Built['store']>();
    const a = await synced(target, server, A);
    await userSignOut(a);
    const b = await synced(target, server, B);
    stopServer(server);
    await waitFor(() => status(b.b) !== 'green', 3000, () => `store not connected (${status(b.b)})`);
    edit(b.b, MK);
    await waitFor(() => pending(b.b) === 1, 2000, () => 'one change pending');
    const out = await quitStep(target);
    expect(target.current()).toBe(b.b.store);
    expect(out.unsent).toBe(1);
    expect(out.line).toBe(UNSENT);
  });

  it('4: WHEN no sign-out happens and `1` change is pending with the server stopped THEN the quit step\'s store is the store main built and the same `1 change not sent yet` line is produced (today\'s #401 behaviour)', { timeout: 12000 }, async () => {
    const server = await startServer();
    const target = quitTarget<Built['store']>();
    const a = await synced(target, server, A);
    stopServer(server);
    await waitFor(() => status(a.b) !== 'green', 3000, () => `store not connected (${status(a.b)})`);
    edit(a.b, MK);
    await waitFor(() => pending(a.b) === 1, 2000, () => 'one change pending');
    const out = await quitStep(target);
    expect(target.current()).toBe(a.b.store);
    expect(out.unsent).toBe(1);
    expect(out.line).toBe(UNSENT);
    expect(out.line).toContain('not sent yet');
  });

  it('5: WHEN src/cli/main.tsx is read THEN the quit step takes its store from the rule tested in 1 to 4 (one call site), and `lastStore` still feeds the crash snapshot (`sessionSnapshot(lastStore.getState()`)', () => {
    const src = readFileSync(join(__dirname, '../../src/cli/main.tsx'), 'utf8');
    expect(src).toContain('quitTarget<');
    expect(src.match(/sendBeforeQuit\(/g)?.length).toBe(1);
    expect(src).toContain('sendBeforeQuit(quitStore)');
    expect(src).toContain('const quitStore = quit.current();');
    expect(src).not.toContain('sendBeforeQuit(lastStore');
    expect(src).toContain('sessionSnapshot(lastStore.getState()');
    expect(src).toContain('tracked.onLogout');
    expect(src).toContain('tracked.bind(built.store)');
  });

  it('6: WHEN store A is signed out, store B is built for the next sign-in with `1` pending change, and store A\'s onLogout then runs once more (a late or repeated call: Root\'s onLogout is reached from the middleware too) THEN the quit step\'s store is still store B and the quit step resolves to `1`', { timeout: 12000 }, async () => {
    const server = await startServer();
    const target = quitTarget<Built['store']>();
    const a = await synced(target, server, A);
    await userSignOut(a);
    const b = await synced(target, server, B);
    stopServer(server);
    await waitFor(() => status(b.b) !== 'green', 3000, () => `store not connected (${status(b.b)})`);
    edit(b.b, MK);
    await waitFor(() => pending(b.b) === 1, 2000, () => 'one change pending');
    const before = a.calls.n;
    a.logout();
    a.logout();
    expect(a.calls.n).toBe(before + 2);
    expect(target.current()).toBe(b.b.store);
    const out = await quitStep(target);
    expect(target.current()).toBe(b.b.store);
    expect(out.unsent).toBe(1);
  });
});
