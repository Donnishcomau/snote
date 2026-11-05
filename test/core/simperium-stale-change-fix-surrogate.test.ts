/**
 * #555 (-01): a lone surrogate in another device's text must not crash snote through the
 * stale-change wrapper (src/core/simperium-stale-change-fix.ts), and no text may be lost or doubled.
 * The surrogate arrives as a replace op (a delta cannot carry one). No fixed sleeps: every wait is on a condition.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'SMOKE-CONFLICT-x\nbody from conflict-real.py\n';
type Built = ReturnType<typeof buildStore>;
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
const rejections: string[] = [];
const onRej = (r: unknown) => { rejections.push(String((r as Error)?.message ?? r)); };

afterEach(async () => {
  vi.restoreAllMocks();
  process.off('unhandledRejection', onRej);
  for (const b of open.splice(0)) {
    b.stopSaving();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, label: string, ms = 2500): Promise<void> {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timed out: ' + label);
    await new Promise((r) => setTimeout(r, 20));
  }
}
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
  return { c, dir: d };
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
async function synced(s: FakeSimperiumServer, content = BASE): Promise<Built> {
  const { c } = openC(s);
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
// Test-only access to the note channel (onBeforeNetworkChange).
type NoteChannel = {
  on(e: string, f: (...a: never[]) => void): void;
  listenerCount(e: string): number;
  message: { prependListener(e: string, f: (d: string) => void): void };
};
const noteChannel = (b: Built) =>
  (b.store as unknown as { client: { buckets: Array<{ name: string; channel: NoteChannel }> } }).client.buckets.find((x) => x.name === 'note')!.channel;
const SUR = 'A-\uD800-MARK';
// probe-only: a lone surrogate cannot travel in a delta, so A is sent as a replace op ('r'), which a server or another client can send
function serverReplace(srv: FakeSimperiumServer, id: string, data: Record<string, unknown>): void {
  const S = srv as unknown as { storage: Map<string, Map<string, { cv: number; cvString: string; log: unknown[]; entries: Map<string, { version: number; data: Record<string, unknown>; history: unknown[] }> }>>; channelBuckets: Map<number, string>; connections: Set<{ ws: { readyState: number; OPEN: number } | null }>; send(ws: unknown, m: string): void };
  const bucket = S.storage.get(APP_ID)!.get('note')!; const entry = bucket.entries.get(id)!;
  entry.history.push({ version: entry.version, data: { ...entry.data } }); entry.version++; entry.data = data; bucket.cv++; bucket.cvString = String(bucket.cv);
  let ch = 0; for (const [n, name] of S.channelBuckets) if (name === 'note') ch = n;
  const b = { id, o: 'M', v: { content: { o: 'r', v: data.content } }, sv: entry.version - 1, ev: entry.version, cv: bucket.cvString, ccids: ['probe-' + entry.version], clientid: 'server' };
  bucket.log.push(b);
  for (const c of S.connections) if (c.ws && c.ws.readyState === c.ws.OPEN) S.send(c.ws, `${ch}:c:[${JSON.stringify(b)}]`);
}
function hookBefore(c: Built): string[] {
  const ch = noteChannel(c) as unknown as { onBeforeNetworkChange: (...a: unknown[]) => Promise<unknown> };
  const errs: string[] = [];
  const orig = ch.onBeforeNetworkChange.bind(ch);
  ch.onBeforeNetworkChange = (...a: unknown[]) => orig(...a).catch((e: Error) => { errs.push(e.message); throw e; });
  return errs;
}
// The fake server's own rebase diffs the surrogate text too and throws on C's change (test fixture, not snote): swallow it,
// so these tests judge what snote does. A lone surrogate may come back as U+FFFD; A's marker may not go.
function guardServer(s: FakeSimperiumServer): void {
  const o = s as unknown as { handleChange(...a: unknown[]): void };
  const h = o.handleChange.bind(s);
  o.handleChange = (...a: unknown[]) => { try { h(...a); } catch { /* fixture only */ } };
}
// #570: every `e:` (version) reply is held until the server receives C's change, instead of a fixed 600 ms delay, so C
// still edits while the version fetch for B is in flight; a release with nothing held is reported as a rejection.
function holdVersionReplies(s: FakeSimperiumServer): void {
  const o = s as unknown as { send(ws: unknown, m: string): void };
  const send = o.send.bind(s);
  const held: Array<[unknown, string]> = [];
  let holding = true;
  o.send = (ws, m) => (holding && /^\d+:e:/.test(m) ? void held.push([ws, m]) : send(ws, m));
  const push = s.received.push.bind(s.received);
  s.received.push = (...m: string[]) => {
    const n = push(...m);
    if (holding && m.some((x) => x.includes('C-MARK'))) {
      holding = false;
      if (held.length === 0) rejections.push('#570: no version reply was held when C reached the server');
      for (const [w, x] of held.splice(0)) send(w, x);
    }
    return n;
  };
}
// A, B and C each once in the local note
const aOnce = (t: string) => (t.match(/A-[^\n]-MARK/g) ?? []).length;
async function allOnce(s: FakeSimperiumServer, c: Built, errs: string[]): Promise<void> {
  const ok = () => [localContent(c)].every((t) => count(t, 'B-MARK') === 1 && count(t, 'C-MARK') === 1 && aOnce(t) === 1);
  await waitFor(ok, 'A, B and C once in the local note', 2400).catch((e) => { throw new Error(`${e.message}: ${JSON.stringify({ errs, rejections, local: localContent(c), server: serverContent(s) })}`); });
}
describe('#555 a lone surrogate in the gap never crashes the stale-change wrapper', () => {
  it('1: WHEN C has an unsent edit, its ghost is behind and B (sv2) carries A with a lone surrogate THEN nothing rejects and A, B and C are each once', async () => {
    process.on('unhandledRejection', onRej); rejections.length = 0;
    const s = await startServer();
    guardServer(s);
    const c = await synced(s);
    const errs = hookBefore(c);
    missed(s, () => serverReplace(s, 'n1', noteData(BASE + '\n' + SUR + '\n', 3000)));
    edit(c, 'C-MARK\n' + BASE);
    s.serverChange('note', 'n1', noteData(serverContent(s).replace('\n' + SUR + '\n', '\nB-MARK\n\n' + SUR + '\n'), 3001));
    await allOnce(s, c, errs);
    expect({ errs, rejections }).toEqual({ errs: [], rejections: [] });
  });
  it('2: WHEN C edits while the version fetch for B is in flight and A holds a lone surrogate THEN nothing rejects and A, B and C are each once', async () => {
    process.on('unhandledRejection', onRej); rejections.length = 0;
    const s = await startServer();
    guardServer(s);
    const c = await synced(s);
    const errs = hookBefore(c);
    missed(s, () => serverReplace(s, 'n1', noteData(BASE + '\n' + SUR + '\n', 3000)));
    holdVersionReplies(s);
    const n0 = s.received.length;
    s.serverChange('note', 'n1', noteData(serverContent(s).replace('\n' + SUR + '\n', '\nB-MARK\n\n' + SUR + '\n'), 3001));
    await waitFor(() => s.received.slice(n0).some((m) => /e:n1\.2$/.test(m)), 'version request out');
    edit(c, 'C-MARK\n' + localContent(c));
    await allOnce(s, c, errs);
    expect({ errs, rejections }).toEqual({ errs: [], rejections: [] });
  });
  it('3: (control, normal text) WHEN the same shape holds plain A THEN A, B and C are each once, nothing rejects', async () => {
    process.on('unhandledRejection', onRej); rejections.length = 0;
    const s = await startServer();
    const c = await synced(s);
    const errs = hookBefore(c);
    missed(s, () => s.serverChange('note', 'n1', noteData(BASE + '\nA-MARK\n', 3000)));
    holdVersionReplies(s);
    const n0 = s.received.length;
    s.serverChange('note', 'n1', noteData(serverContent(s).replace('\nA-MARK\n', '\nB-MARK\n\nA-MARK\n'), 3001));
    await waitFor(() => s.received.slice(n0).some((m) => /e:n1\.2$/.test(m)), 'version request out');
    edit(c, 'C-MARK\n' + localContent(c));
    await waitFor(() => [serverContent(s), localContent(c)].every((t) => ['A-MARK', 'B-MARK', 'C-MARK'].every((m) => count(t, m) === 1)) && pending(c) === 0, 'A, B and C once', 2400);
    expect({ errs, rejections }).toEqual({ errs: [], rejections: [] });
  });
  it('4: WHEN the repair itself throws too THEN nothing rejects and the library result lands (B and C kept)', async () => {
    process.on('unhandledRejection', onRej); rejections.length = 0;
    const s = await startServer();
    guardServer(s);
    const c = await synced(s);
    const errs = hookBefore(c);
    missed(s, () => serverReplace(s, 'n1', noteData(BASE + '\n' + SUR + '\n', 3000)));
    const sent = noteData(serverContent(s).replace('\n' + SUR + '\n', '\nB-MARK\n\n' + SUR + '\n'), 3001);
    edit(c, 'C-MARK\n' + BASE);
    // the repair must fail too: any replace() on a string holding a surrogate throws from here on
    const real = String.prototype.replace;
    vi.spyOn(String.prototype, 'replace').mockImplementation(function (this: string, ...a: unknown[]) {
      if (/[\ud800-\udfff]/.test(this)) throw new Error('repair failed');
      return (real as (...x: unknown[]) => string).apply(this, a);
    } as never);
    s.serverChange('note', 'n1', sent);
    await waitFor(() => ['B-MARK', 'C-MARK'].every((m) => count(localContent(c), m) === 1), 'B and C once in the local note', 2400);
    expect({ errs, rejections }).toEqual({ errs: [], rejections: [] });
  });
});
