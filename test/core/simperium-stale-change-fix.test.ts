/**
 * #543 and #544: a remote change applies only on the version it
 * was built from, and local edits are measured against this client's own
 * ghost, under the live service's stale-change model (staleSvModel 'rebase').
 * (P1, P2, B1): a change the client already holds is not applied again.
 * (P3, P5, B2, B3): a change ahead of the client's copy never deletes
 * another device's text or this client's unsent edit. P4: an offline edit and
 * a live change during the restart catch-up each land once.
 * Live shapes: run74 and run82 (#10 live trial, 30 Oct); P6 is their exact wire
 * order. No fixed sleeps: an "it did not happen" check waits on `settle`, a later
 * server change that must land locally with nothing pending.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { waitHeld } from '../helpers/wait-held';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'SMOKE-CONFLICT-x\nbody from conflict-real.py\n';
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

// #656: a wait has no deadline of its own: it re-checks its state every 20 ms until it holds; the end of the test
// (the per-test timeout) stops a wait that never does and fails the test with `never held: <label>`.
const waitFor = (cond: () => boolean, label: string): Promise<void> => waitHeld(cond, label, 20);
const noteData = (content: string, md: number) => ({ content, creationDate: 1000, deleted: false, modificationDate: md, systemTags: [], tags: [] });
async function startServer(): Promise<FakeSimperiumServer> {
  const s = new FakeSimperiumServer();
  s.staleSvModel = 'rebase';
  await s.start();
  servers.push(s);
  s.seedBucket(APP_ID, 'note', [{ id: 'n1', data: noteData(BASE, 2000), version: 1 }]);
  return s;
}
function openC(server: FakeSimperiumServer, dir?: string): { c: Built; dir: string } {
  const d = dir ?? mkdtempSync(join(tmpdir(), 'snote-f325-'));
  if (!dir) dirs.push(d);
  const c = buildStore({ dataDir: d, appId: APP_ID, server: server.url, noteEditDelayMs: 10 }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(c);
  track(c);
  return { c, dir: d };
}
// Per client: version requests the channel really sent (a skipped one never reaches the channel's 'send'),
// and, for each version reply that a waiting change listens for, that change's cv until the apply of the
// fetched copy saves it ('change-version' comes last in applyChange, channel.js:223, ack or not).
const fetches = new Map<Built, { asked: number; replies: number; open: Map<string, number>; seen: Set<string> }>();
function track(c: Built): void {
  const f = { asked: 0, replies: 0, open: new Map<string, number>(), seen: new Set<string>() };
  fetches.set(c, f);
  const ch = noteChannel(c);
  const cvs = new Map<string, string[]>();
  ch.message.prependListener('c', (frame: string) => {
    for (const x of JSON.parse(frame) as Array<{ id: string; sv?: number; cv: string }>) {
      f.seen.add(`${x.id}.${x.sv}`);
      cvs.set(`${x.id}.${x.sv}`, [...(cvs.get(`${x.id}.${x.sv}`) ?? []), x.cv]);
    }
  });
  ch.on('send', (d: unknown) => { if (/^e:/.test(String(d))) f.asked++; });
  ch.on('version', (id: unknown, v: unknown) => {
    f.replies++;
    if (ch.listenerCount(`version.${id}.${v}`) === 0) return;
    for (const cv of new Set(cvs.get(`${id}.${v}`) ?? [])) f.open.set(cv, (f.open.get(cv) ?? 0) + 1);
  });
  ch.on('change-version', (cv: unknown) => f.open.delete(String(cv)));
}
const count = (s: string, m: string) => s.split(m).length - 1;
const serverContent = (s: FakeSimperiumServer) => String(s.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const localContent = (b: Built) => String(b.store.getState().data.notes.get('n1' as never)?.content ?? '');
// Test-only access to the fake server's private change log and sockets.
type Priv = { storage: Map<string, Map<string, { log: Array<Record<string, unknown>> }>>; connections: Set<{ ws: { readyState: number; OPEN: number; send(m: string): void } | null }> };
function log(s: FakeSimperiumServer) {
  return (s as unknown as Priv).storage.get(APP_ID)!.get('note')!.log;
}
function deliverToAll(s: FakeSimperiumServer, change: Record<string, unknown>) {
  for (const c of (s as unknown as Priv).connections) if (c.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(`0:c:[${JSON.stringify(change)}]`);
}

const pending = (c: Built) => pendingCount(c.store.getState().simperium);
const sentMods = (s: FakeSimperiumServer, from = 0) => s.received.slice(from).filter((m) => m.includes('"o":"M"')).length;
let zn = 0;
// Every earlier frame and reply was handled: (1) a marker change sent after the delivered frames lands
// locally, so the client has read them (a stale one has sent its version request or been skipped);
// (2) every version request sent has its reply AND that reply's apply has emitted its 'update';
// (3) a later change Z lands with nothing pending (unless `idle` is false).
async function settle(s: FakeSimperiumServer, c: Built, idle = true): Promise<void> {
  const m = `M-${++zn}`;
  s.serverChange('note', 'n1', noteData(serverContent(s) + m + '\n', 9000 + zn));
  await waitFor(() => localContent(c).includes(m), 'marker read');
  const f = fetches.get(c)!;
  await waitFor(() => f.replies === f.asked && f.open.size === 0, 'every reply applied');
  const z = `Z-${++zn}`;
  s.serverChange('note', 'n1', noteData(serverContent(s) + z + '\n', 9000 + zn));
  await waitFor(() => localContent(c).includes(z) && (!idle || pending(c) === 0), 'settled');
}
const withB = (s: FakeSimperiumServer) => noteData(serverContent(s).replace('\nA-MARK\n', '\nB-MARK\n\nA-MARK\n'), 3001);
const marks = (s: FakeSimperiumServer, c: Built, ms: string[]) =>
  Object.fromEntries([...ms.map((m) => [m, count(serverContent(s), m)]), ...ms.map((m) => ['local ' + m, count(localContent(c), m)]), ['same', localContent(c) === serverContent(s)]]);
const once = (ms: string[]) => Object.fromEntries([...ms.map((m) => [m, 1]), ...ms.map((m) => ['local ' + m, 1]), ['same', true]]);
async function synced(s: FakeSimperiumServer, content = BASE): Promise<Built> {
  const { c } = openC(s);
  await new Promise<void>((r) => noteChannel(c).once('ready', () => r())); // #656: the client's own event: the index is in
  await waitFor(() => localContent(c) === content && pending(c) === 0, 'indexed');
  return c;
}
// C misses every server change made inside `fn` (its socket is left out of the broadcast).
function missed(s: FakeSimperiumServer, fn: () => void): void {
  const conns = (s as unknown as Priv).connections;
  const saved = [...conns];
  conns.clear();
  fn();
  for (const k of saved) conns.add(k);
}
const edit = (c: Built, content: string) => {
  const note = c.store.getState().data.notes.get('n1' as never) as unknown as Record<string, unknown>;
  c.store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1', note: { ...note, content, modificationDate: 5000 } } as never);
};
// C syncs, quits with its ghost saved; A is made while it is closed (and never reaches the closing socket); C restarts and B is made once C has asked for the catch-up.
async function restart(s: FakeSimperiumServer, delay: number, offlineC: boolean): Promise<Built> {
  const first = openC(s);
  await waitFor(() => localContent(first.c) === BASE && pending(first.c) === 0, 'C synced');
  await waitFor(() => { try { return readFileSync(join(first.dir, 'ghosts-note.json'), 'utf8').includes('"n1"'); } catch { return false; } }, 'ghost saved');
  first.c.stopSaving();
  first.c.store.stopSync?.();
  open.splice(open.indexOf(first.c), 1);
  if (offlineC) {
    const path = join(first.dir, 'state.json');
    const file = JSON.parse(readFileSync(path, 'utf8'));
    const entry = (file.data.notes.__map as [string, Record<string, unknown>][]).find(([id]) => id === 'n1')!;
    entry[1] = { ...entry[1], content: 'C-MARK\n' + BASE, modificationDate: 5000 };
    writeFileSync(path, JSON.stringify(file));
  }
  missed(s, () => s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000)));
  s.catchUpDelayMs = delay;
  const n0 = s.received.length;
  const { c } = openC(s, first.dir);
  await waitFor(() => s.received.slice(n0).some((m) => /:cv:/.test(m)), 'catch-up asked');
  s.serverChange('note', 'n1', withB(s));
  return c;
}
async function p3(delay: number): Promise<void> {
  const s = await startServer();
  const c = await restart(s, delay, false);
  await waitFor(() => localContent(c).includes('A-MARK') && localContent(c).includes('B-MARK'), 'C has A and B');
  // A (sv1) reaches C only in the catch-up reply: C has read it
  await waitFor(() => fetches.get(c)!.seen.has('n1.1'), 'catch-up reply read');
  await settle(s, c);
  expect(marks(s, c, ['A-MARK', 'B-MARK'])).toEqual(once(['A-MARK', 'B-MARK']));
}
async function p4(delay: number): Promise<void> {
  const s = await startServer();
  const c = await restart(s, delay, true);
  await waitFor(() => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => serverContent(s).includes(m)) && pending(c) === 0, 'server has A B C');
  await waitFor(() => fetches.get(c)!.seen.has('n1.1'), 'catch-up reply read');
  await settle(s, c);
  expect(marks(s, c, ['A-MARK', 'B-MARK', 'C-MARK'])).toEqual(once(['A-MARK', 'B-MARK', 'C-MARK']));
}
// Test-only access to the note channel (its 'update' events and in-flight change, channel.js localQueue.sent).
type NoteChannel = {
  on(e: string, f: (...a: never[]) => void): void;
  once(e: string, f: () => void): void;
  listenerCount(e: string): number;
  message: { prependListener(e: string, f: (d: string) => void): void };
  localQueue: { sent: Record<string, unknown> };
};
const noteChannel = (b: Built) =>
  (b.store as unknown as { client: { buckets: Array<{ name: string; channel: NoteChannel }> } }).client.buckets.find((x) => x.name === 'note')!.channel;
const sentOf = (b: Built) => noteChannel(b).localQueue.sent;
async function ackCase(own: boolean): Promise<void> {
  const s = await startServer();
  const c = await synced(s);
  s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
  const a = log(s)[log(s).length - 1] as { ccids: string[] };
  await waitFor(() => localContent(c).includes('A-MARK') && pending(c) === 0, 'C got A');
  const inFlight = { id: 'n1', o: 'M', v: {}, sv: 2, ccid: own ? a.ccids[0] : 'other-ccid' };
  sentOf(c).n1 = inFlight;
  deliverToAll(s, a);
  await settle(s, c, false);
  expect({ inFlight: sentOf(c).n1 === inFlight, a: count(localContent(c), 'A-MARK') }).toEqual({ inFlight: !own, a: 1 });
}

describe('#543/#544: a remote change applies only on its own source version', () => {
  it('1: WHEN a caught-up client gets a live append THEN it is applied once', async () => {
    const s = await startServer();
    const c = await synced(s);
    s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
    await waitFor(() => localContent(c).includes('A-MARK'), 'C got A');
    await settle(s, c);
    expect(marks(s, c, ['A-MARK'])).toEqual(once(['A-MARK']));
  });

  it('2: WHEN the index already holds A at v2 and the A broadcast (sv1 ev2) arrives THEN A stays once and the client sends nothing (, run74)', async () => {
    const s = await startServer();
    s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
    const staleA = log(s)[log(s).length - 1];
    const c = await synced(s, BASE + '\nA-MARK\n');
    const n0 = s.received.length;
    deliverToAll(s, staleA);
    await settle(s, c);
    expect({ ...marks(s, c, ['A-MARK']), sent: sentMods(s, n0) }).toEqual({ ...once(['A-MARK']), sent: 0 });
  });

  it('3: WHEN the index holds A and B at v3 and both broadcasts arrive THEN each stays once (, run82)', async () => {
    const s = await startServer();
    s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
    const staleA = log(s)[log(s).length - 1];
    s.serverChange('note', 'n1', withB(s));
    const staleB = log(s)[log(s).length - 1];
    const c = await synced(s, BASE + '\nB-MARK\n\nA-MARK\n');
    deliverToAll(s, staleA);
    deliverToAll(s, staleB);
    await settle(s, c);
    expect(marks(s, c, ['A-MARK', 'B-MARK'])).toEqual(once(['A-MARK', 'B-MARK']));
  });

  it('4: WHEN A is made while C is closed and B is made during an immediate catch-up THEN each is once everywhere', () => p3(0));
  it('5: WHEN A is made while C is closed and B is made during a 200 ms catch-up THEN each is once everywhere', () => p3(200));
  it('6: WHEN A is made while C is closed and B is made during a 1000 ms catch-up THEN each is once everywhere', () => p3(1000));
  it('7: WHEN C has an offline edit, A is made while it is closed and B during an immediate catch-up THEN A, B and C are once everywhere', () => p4(0));
  it('8: WHEN C has an offline edit, A is made while it is closed and B during a 200 ms catch-up THEN A, B and C are once everywhere (P4)', () => p4(200));
  it('9: WHEN C has an offline edit, A is made while it is closed and B during a 1000 ms catch-up THEN A, B and C are once everywhere (P4)', () => p4(1000));

  it('10: WHEN a running client with an unsent edit C gets B (sv2) while its ghost is at v1 THEN A, B and C are once everywhere ( loss)', async () => {
    const s = await startServer();
    const c = await synced(s);
    missed(s, () => s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000)));
    edit(c, 'C-MARK\n' + BASE);
    s.serverChange('note', 'n1', withB(s));
    await waitFor(() => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => serverContent(s).includes(m)) && pending(c) === 0, 'server A B C');
    await settle(s, c);
    expect(marks(s, c, ['A-MARK', 'B-MARK', 'C-MARK'])).toEqual(once(['A-MARK', 'B-MARK', 'C-MARK']));
  });

  it('11: WHEN the index holds A at v2, the stale A arrives and live B arrives before the version reply THEN A and B are once everywhere and the client sends nothing (run74/run82 wire order)', async () => {
    const s = await startServer();
    s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
    const staleA = log(s)[log(s).length - 1];
    const c = await synced(s, BASE + '\nA-MARK\n');
    const n0 = s.received.length;
    const r0 = s.versionRepliesSent.length;
    let updates = 0;
    noteChannel(c).on('update', () => updates++);
    s.versionReplyDelayMs = 300;
    deliverToAll(s, staleA);
    s.serverChange('note', 'n1', withB(s));
    await waitFor(() => localContent(c).includes('B-MARK'), 'B');
    // a version request for the stale A (none when it is skipped) has its reply applied: B applied, plus one update per request
    await waitFor(() => {
      const asked = s.received.slice(n0).filter((m) => /^\d+:e:n1\./.test(m)).length;
      return s.versionRepliesSent.length - r0 === asked && updates >= 1 + asked;
    }, 'stale A handled');
    expect(marks(s, c, ['A-MARK', 'B-MARK'])).toEqual(once(['A-MARK', 'B-MARK']));
    await settle(s, c);
    expect({ ...marks(s, c, ['A-MARK', 'B-MARK']), sent: sentMods(s, n0) }).toEqual({ ...once(['A-MARK', 'B-MARK']), sent: 0 });
  });

  it('12: WHEN C types an edit while the version fetch for B is in flight THEN A, B and C are once everywhere', async () => {
    const s = await startServer();
    const c = await synced(s);
    missed(s, () => s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000)));
    s.versionReplyDelayMs = 600;
    const n0 = s.received.length;
    s.serverChange('note', 'n1', withB(s));
    await waitFor(() => s.received.slice(n0).some((m) => /e:n1\.2$/.test(m)), 'version request out');
    edit(c, 'C-MARK\n' + localContent(c));
    await waitFor(() => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => serverContent(s).includes(m)) && pending(c) === 0, 'server A B C');
    await settle(s, c);
    expect(marks(s, c, ['A-MARK', 'B-MARK', 'C-MARK'])).toEqual(once(['A-MARK', 'B-MARK', 'C-MARK']));
  });

  it('13: WHEN a live change is delivered twice more THEN it is once everywhere and the client sends nothing', async () => {
    const s = await startServer();
    const c = await synced(s);
    s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
    const a = log(s)[log(s).length - 1];
    await waitFor(() => localContent(c).includes('A-MARK'), 'C got A');
    const n0 = s.received.length;
    deliverToAll(s, a);
    deliverToAll(s, a);
    await settle(s, c);
    expect({ ...marks(s, c, ['A-MARK']), sent: sentMods(s, n0) }).toEqual({ ...once(['A-MARK']), sent: 0 });
  });

  it('14: WHEN C missed A and B, applies B, then gets A THEN each is once everywhere and the client sends nothing', async () => {
    const s = await startServer();
    const c = await synced(s);
    const n0 = s.received.length;
    let a: Record<string, unknown> = {};
    let b: Record<string, unknown> = {};
    missed(s, () => {
      s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
      a = log(s)[log(s).length - 1];
      s.serverChange('note', 'n1', withB(s));
      b = log(s)[log(s).length - 1];
    });
    deliverToAll(s, b);
    await waitFor(() => localContent(c).includes('B-MARK'), 'C applied B');
    deliverToAll(s, a);
    await settle(s, c);
    expect({ ...marks(s, c, ['A-MARK', 'B-MARK']), sent: sentMods(s, n0) }).toEqual({ ...once(['A-MARK', 'B-MARK']), sent: 0 });
  });

  it('15: WHEN C has an unsent edit, missed A and B, applies B, then gets A THEN A, B and C are once everywhere', async () => {
    const s = await startServer();
    const c = await synced(s);
    let a: Record<string, unknown> = {};
    let b: Record<string, unknown> = {};
    missed(s, () => {
      s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
      a = log(s)[log(s).length - 1];
      s.serverChange('note', 'n1', withB(s));
      b = log(s)[log(s).length - 1];
    });
    edit(c, 'C-MARK\n' + BASE);
    deliverToAll(s, b);
    await waitFor(() => localContent(c).includes('B-MARK'), 'C applied B');
    deliverToAll(s, a);
    await waitFor(() => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => serverContent(s).includes(m)) && pending(c) === 0, 'server A B C');
    await settle(s, c);
    expect(marks(s, c, ['A-MARK', 'B-MARK', 'C-MARK'])).toEqual(once(['A-MARK', 'B-MARK', 'C-MARK']));
  });

  it('16: WHEN a change the ghost already holds arrives THEN a different in-flight change is not acknowledged', () => ackCase(false));
  it('17: WHEN a change the ghost already holds arrives THEN this client\'s own in-flight change is acknowledged', () => ackCase(true));

  it('18: WHEN the same ahead change is delivered twice while the ghost is behind and C has an unsent edit THEN A, B and C are once everywhere', async () => {
    const s = await startServer();
    const c = await synced(s);
    let b: Record<string, unknown> = {};
    missed(s, () => {
      s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000));
      s.serverChange('note', 'n1', withB(s));
      b = log(s)[log(s).length - 1];
    });
    edit(c, 'C-MARK\n' + BASE);
    s.versionReplyDelayMs = 300;
    deliverToAll(s, b);
    deliverToAll(s, b);
    await waitFor(() => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => serverContent(s).includes(m)) && pending(c) === 0, 'server A B C');
    await settle(s, c);
    expect(marks(s, c, ['A-MARK', 'B-MARK', 'C-MARK'])).toEqual(once(['A-MARK', 'B-MARK', 'C-MARK']));
  });
});
