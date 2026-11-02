/**
 * #337c (, R1) — a change sent after the connection authenticated but before
 * 'ready' is not sent a second time by the resend at 'ready'; a change sent on an
 * earlier connection still is. On the real service the server acknowledges in
 * about 0.2 s, so the change is still unacknowledged when the deferred resend
 * fires 10 ms after 'ready'; the copy was answered 409 (no data effect, but a
 * repeated ccid on the wire). Server tests 1 to 3 use the fake server's
 * `sendDelayMs` (server replies arrive late, as live); tests 4 to 6 drive the
 * wrapper with a stub channel whose `message` and `localQueue` are emitters.
 */
import { EventEmitter } from 'node:events';
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { installSimperiumReconnectFix } from '../../src/core/simperium-reconnect-fix';
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

function act(b: Built, a: 'pin' | 'trash' | 'tag'): void {
  const noteId = 'n1' as never;
  const d = (x: unknown) => b.store.dispatch(x as never);
  if (a === 'pin') d({ type: 'PIN_NOTE', noteId, shouldPin: true });
  if (a === 'trash') d({ type: 'TRASH_NOTE', noteId });
  if (a === 'tag') d({ type: 'ADD_NOTE_TAG', noteId, tagName: 'work' });
}

type Sent = { ccid: string; v: Record<string, unknown> };

/** every change frame the client sent for n1 */
function n1Frames(server: FakeSimperiumServer): Sent[] {
  const out: Sent[] = [];
  for (const f of server.received) {
    if (!f.startsWith('0:c:{')) continue;
    const c = JSON.parse(f.slice(4));
    if (c.id === 'n1' && c.ccid) out.push({ ccid: c.ccid, v: c.v ?? {} });
  }
  return out;
}
const n1Sends = (server: FakeSimperiumServer): string[] => n1Frames(server).map((f) => f.ccid);

describe('#337c a change sent on the current connection is not re-sent at ready', () => {
  for (const a of ['pin', 'trash', 'tag'] as const)
    for (const delay of [20, 200]) {
      it(`${a}-d${delay}: WHEN n1 has an offline edit from an earlier session, ${a} is pressed after the restart and every server reply arrives ${delay} ms late THEN no change frame for n1 is sent twice (no repeated ccid) and the server holds the offline edit and the ${a}`, async () => {
        const server = await startServer();
        const dir = await syncedDir(server);
        editOffline(dir, 'A-OFFLINE-EDIT\nline2');
        server.sendDelayMs = delay;
        const b = openA(dir, server);
        act(b, a);
        await waitFor(
          () => {
            const o = server.getObject(APP_ID, 'note', 'n1')?.data as Record<string, unknown> | undefined;
            const done = a === 'pin' ? JSON.stringify(o?.systemTags).includes('pinned') : a === 'trash' ? o?.deleted === true : JSON.stringify(o?.tags).includes('work');
            return String(o?.content) === 'A-OFFLINE-EDIT\nline2' && done && pending(b) === 0;
          },
          10000,
          () => `server has the edit and the ${a}, pending 0 (sends ${JSON.stringify(n1Sends(server))}, pending ${pending(b)})`
        );
        await new Promise((r) => setTimeout(r, 1000));
        const sends = n1Sends(server);
        expect(sends.length).toBeGreaterThanOrEqual(1);
        expect(new Set(sends).size).toBe(sends.length);
        if (a === 'tag') {
          const o = server.getObject(APP_ID, 'note', 'n1')?.data as Record<string, unknown>;
          expect((o.tags as string[]).filter((t) => t === 'work')).toHaveLength(1);
        }
      }, 25000);
    }
});

/** A stub channel: `message` and `localQueue` are emitters, as in the vendored Channel. */
function stubChannel() {
  const emitted: unknown[] = [];
  const message = new EventEmitter();
  const localQueue = Object.assign(new EventEmitter(), {
    sent: {} as Record<string, unknown>,
    start() {},
    processQueue() {},
    resendSentChanges(this: { sent: Record<string, unknown> }) {
      for (const id of Object.keys(this.sent)) emitted.push(this.sent[id]);
    },
  });
  const channel = { message, localQueue, networkQueue: { queueFor: () => ({ on() {} }) } };
  installSimperiumReconnectFix({ buckets: [{ channel }] });
  /** processQueue's step: the change becomes `sent` and goes out (the channel's socket write is the 'send' listener) */
  const send = (change: { id: string }) => {
    localQueue.sent[change.id] = change;
    localQueue.emit('send', change);
  };
  const auth = () => message.emit('auth', 'note:auth:store1@example.com');
  return { emitted, localQueue, send, auth };
}

describe('#337c the resend re-sends what went out on an earlier connection, never what went out on this one', () => {
  it('4: WHEN a change is sent after the connection authenticated and resendSentChanges is then requested THEN it is not re-emitted and sent still holds it', async () => {
    const { emitted, localQueue, send, auth } = stubChannel();
    const a = { id: 'a', ccid: 'ca' };
    auth();
    send(a);
    localQueue.resendSentChanges();
    await new Promise((r) => setTimeout(r, 100));
    expect(emitted).toEqual([]);
    expect(localQueue.sent.a).toBe(a);
  });

  it('5: WHEN a change is sent, the connection drops and a new connection authenticates, and resendSentChanges is requested THEN the change is re-emitted (a change sent just before a drop is never lost)', async () => {
    const { emitted, localQueue, send, auth } = stubChannel();
    const a = { id: 'a', ccid: 'ca' };
    auth();
    send(a);
    auth(); // the reconnect
    localQueue.resendSentChanges();
    await new Promise((r) => setTimeout(r, 100));
    expect(emitted).toEqual([a]);
    expect(localQueue.sent.a).toBe(a);
  });

  it('6: WHEN one change went out on the old connection and another on the new one THEN only the old one is re-emitted, and an entry never sent through the queue (no stamp) is re-emitted too', async () => {
    const { emitted, localQueue, send, auth } = stubChannel();
    const old = { id: 'old', ccid: 'c1' };
    const fresh = { id: 'fresh', ccid: 'c2' };
    const loaded = { id: 'loaded', ccid: 'c3' };
    auth();
    send(old);
    localQueue.sent.loaded = loaded; // present in `sent` without a 'send' on this channel instance
    auth();
    send(fresh);
    localQueue.resendSentChanges();
    await new Promise((r) => setTimeout(r, 100));
    expect(emitted).toEqual([old, loaded]);
    expect(Object.keys(localQueue.sent).sort()).toEqual(['fresh', 'loaded', 'old']);
  });
});
