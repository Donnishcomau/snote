/**
 * #10: two clients, both online, append to one note within about a second.
 * The fake server uses the live service's stale-sv model (rebase, no error frame; measured 29 Sep)
 * and delays every frame to the clients by 150 ms, so both sends leave before either broadcast
 * arrives and the second one reaches the server with a stale `sv` (server.staleRebases proves it).
 * After both settle the server, both clients and a fresh third client hold one note with each
 * appended text exactly once and the base kept; the order is the server's (the later arrival is
 * placed first), so the tests accept either order but demand that all four copies are identical.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const BASE = 'line one\nline two\n';
const TA = 'A-APPEND-1791066083.376670877';
const TB = 'B-APPEND-1791066083.036162649';
type Built = ReturnType<typeof buildStore>;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) return false;
    await sleep(10);
  }
  return true;
}

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
afterEach(() => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function startServer(): FakeSimperiumServer {
  const server = new FakeSimperiumServer();
  servers.push(server);
  return server;
}
function client(server: FakeSimperiumServer, tag: string): Built {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `snote-ca-${tag}-`));
  dirs.push(dir);
  const built = buildStore(
    { dataDir: dir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: 'store1@example.com', token: 'store1-token' },
    () => {}
  );
  open.push(built);
  return built;
}
const text = (b: Built): string | undefined => b.store.getState().data.notes.get('n1' as never)?.content as string | undefined;
const pending = (b: Built): number => pendingCount(b.store.getState().simperium);
function serverText(server: FakeSimperiumServer): string {
  return String(server.getObject(APP_ID, 'note', 'n1')?.data.content);
}
function edit(b: Built, content: string): void {
  b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content } } as never);
}
const times = (s: string, needle: string): number => s.split(needle).length - 1;

/** Start the server and two synced clients on one note holding BASE. */
async function twoClients(): Promise<{ server: FakeSimperiumServer; a: Built; b: Built }> {
  const server = startServer();
  await server.start();
  server.staleSvModel = 'rebase';
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', version: 1, data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] } },
  ]);
  const a = client(server, 'A');
  const b = client(server, 'B');
  expect(await waitFor(() => text(a) === BASE && text(b) === BASE, 8000)).toBe(true);
  server.sendDelayMs = 150; // from here on the broadcasts reach the clients late
  return { server, a, b };
}

/** Wait until both clients are settled and identical, then read the note with a fresh third client. */
async function settleAndRead(server: FakeSimperiumServer, a: Built, b: Built, extra: string[]): Promise<{ srv: string; c: string }> {
  const settled = (): boolean => {
    const srv = serverText(server);
    return pending(a) === 0 && pending(b) === 0 && text(a) === srv && text(b) === srv && [TA, TB, ...extra].every((t) => srv.includes(t));
  };
  expect(await waitFor(settled, 10000), `settled (server ${JSON.stringify(serverText(server))}, A ${JSON.stringify(text(a))}, B ${JSON.stringify(text(b))}, pending ${pending(a)}/${pending(b)})`).toBe(true);
  await sleep(2 * 150 + 100); // any late frame still in flight has landed
  server.sendDelayMs = 0;
  const c = client(server, 'C');
  expect(await waitFor(() => text(c) !== undefined, 8000)).toBe(true);
  return { srv: serverText(server), c: text(c)! };
}

function expectIntact(srv: string, c: string, a: Built, b: Built, extra: string[]): void {
  for (const t of [TA, TB, ...extra]) expect(times(srv, t), `${t} once in ${JSON.stringify(srv)}`).toBe(1);
  expect(srv).toContain('line one');
  expect(srv).toContain('line two');
  expect(text(a)).toBe(srv);
  expect(text(b)).toBe(srv);
  expect(c).toBe(srv);
  // no stray, lost or interleaved character: removing the appended texts leaves the base letters only
  const rest = [TA, TB, ...extra].reduce((acc, t) => acc.replace(t, ''), srv).replace(/[ \n]/g, '');
  expect(rest).toBe(BASE.replace(/[ \n]/g, ''));
}

describe('#10 two clients append to one note within a second', () => {
  it('1: WHEN A and B each append a new last line at the same moment (the second send is stale) THEN the server, A, B and a fresh third client hold the same note with each line once and line one, line two kept, and the server rebased exactly 1 stale change', async () => {
    const { server, a, b } = await twoClients();
    edit(a, text(a) + TA + '\n');
    edit(b, text(b) + TB + '\n');
    const { srv, c } = await settleAndRead(server, a, b, []);
    expect(server.staleRebases).toBe(1);
    expectIntact(srv, c, a, b, []);
    expect([BASE + TA + '\n' + TB + '\n', BASE + TB + '\n' + TA + '\n']).toContain(srv);
  }, 30000);

  it('2: WHEN A and B each append to the end of the same last line THEN all four copies are identical with each text once and exactly 1 stale change rebased', async () => {
    const { server, a, b } = await twoClients();
    edit(a, text(a)!.replace(/\n$/, '') + ' ' + TA + '\n');
    edit(b, text(b)!.replace(/\n$/, '') + ' ' + TB + '\n');
    const { srv, c } = await settleAndRead(server, a, b, []);
    expect(server.staleRebases).toBe(1);
    expectIntact(srv, c, a, b, []);
  }, 30000);

  it('3: WHEN A adds its text at the start of the note and B adds its text at the end (different positions) THEN all four copies are identical, A text first and B text last, each once', async () => {
    const { server, a, b } = await twoClients();
    edit(a, TA + ' ' + text(a));
    edit(b, text(b) + TB + '\n');
    const { srv, c } = await settleAndRead(server, a, b, []);
    expect(server.staleRebases).toBe(1);
    expectIntact(srv, c, a, b, []);
    expect(srv).toBe(TA + ' ' + BASE + TB + '\n');
  }, 30000);

  it('4: WHEN A saves a second append while its first one is still unacknowledged and B appends in between THEN all four copies are identical with the 3 appended texts once each', async () => {
    const { server, a, b } = await twoClients();
    const second = 'A-SECOND-LINE';
    edit(a, text(a) + TA + '\n');
    edit(b, text(b) + TB + '\n');
    await sleep(40); // A's first change is sent and not yet acknowledged (150 ms late), B's is in flight
    edit(a, text(a) + second + '\n');
    const { srv, c } = await settleAndRead(server, a, b, [second]);
    expect(server.staleRebases).toBeGreaterThanOrEqual(1);
    expectIntact(srv, c, a, b, [second]);
    expect(srv.indexOf(TA)).toBeLessThan(srv.indexOf(second));
  }, 30000);

  it('5: WHEN the same two appends are 400 ms apart THEN nothing is rebased (no stale send), all four copies are identical, each text once', async () => {
    const { server, a, b } = await twoClients();
    edit(a, text(a) + TA + '\n');
    await sleep(400);
    edit(b, text(b) + TB + '\n');
    const { srv, c } = await settleAndRead(server, a, b, []);
    expect(server.staleRebases).toBe(0);
    expectIntact(srv, c, a, b, []);
    expect(srv).toBe(BASE + TA + '\n' + TB + '\n');
  }, 30000);
  it('6: WHEN the server delays its frames by 300 ms THEN A is still unacknowledged for at least 100 ms after the server applied its change (the delay path is in use)', async () => {
    const { server, a } = await twoClients();
    server.sendDelayMs = 300;
    edit(a, text(a) + TA + '\n');
    expect(await waitFor(() => serverText(server).includes(TA), 8000)).toBe(true); // the server has applied it; its ack is 300 ms away
    const appliedAt = Date.now();
    expect(await waitFor(() => pending(a) === 0, 8000)).toBe(true);
    // without the delay the ack lands within a few ms; 100 ms leaves 200 ms of slack for a slow poll
    expect(Date.now() - appliedAt).toBeGreaterThanOrEqual(100);
    await sleep(2 * 300);
    server.sendDelayMs = 0;
  }, 30000);
});
