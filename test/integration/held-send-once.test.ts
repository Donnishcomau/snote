/**
 * #337 — a change held until the start-up catch-up is applied is sent
 * once. On the real service it left twice with the same ccid (the server applied
 * it once and answered the copy 409, then an extra modificationDate-only change
 * followed). The deferred `resendSentChanges` in simperium-reconnect-fix.ts
 * re-emitted a `sent` entry that `processQueue` had created after the resend was
 * requested. Mirrors the real sequence: an edit from an earlier offline session,
 * a pin, trash or tag pressed after the restart before the catch-up reply (the
 * fake answers the catch-up at once, so the held change is sent inside the 10 ms
 * retry window of the deferred resend, as on the real service).
 */
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

describe('#337 a change held until the catch-up is sent once', () => {
  for (const a of ['pin', 'trash', 'tag'] as const) {
    it(`${a}: WHEN n1 has an offline edit from an earlier session and ${a} is pressed after the restart before the catch-up reply THEN once the server holds the edit and the ${a} and pendingCount is 0, no ccid appears twice among the change frames sent for n1, at most one of them touches a key other than modificationDate${a === 'tag' ? ', and the server holds the tag work exactly once' : ''}`, async () => {
      const server = await startServer();
      server.catchUpDelayMs = 0;
      const dir = await syncedDir(server);
      editOffline(dir, 'A-OFFLINE-EDIT\nline2');
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
      // one bounded sleep to let a late duplicate land
      await new Promise((r) => setTimeout(r, 1000));
      const frames = n1Frames(server);
      const sends = frames.map((f) => f.ccid);
      expect(sends.length).toBeGreaterThanOrEqual(1);
      expect(new Set(sends).size).toBe(sends.length);
      const touching = frames.filter((f) => Object.keys(f.v).some((k) => k !== 'modificationDate'));
      expect(touching.length).toBeLessThanOrEqual(1);
      if (a === 'tag') {
        const o = server.getObject(APP_ID, 'note', 'n1')?.data as Record<string, unknown>;
        expect((o.tags as string[]).filter((t) => t === 'work')).toHaveLength(1);
      }
    }, 20000);
  }
});

describe('#337 the deferred resend re-emits only what was in flight when it was requested', () => {
  it('4: WHEN resendSentChanges is requested with sent {a}, a change b is then added to sent before the deferred call runs THEN only a is re-emitted and, after the call, sent still holds the same a and b objects', async () => {
    const a = { id: 'a', ccid: 'ca' };
    const b = { id: 'b', ccid: 'cb' };
    const emitted: unknown[] = [];
    const localQueue = {
      sent: { a } as Record<string, unknown>,
      start() {},
      processQueue() {},
      resendSentChanges(this: { sent: Record<string, unknown> }) {
        for (const id of Object.keys(this.sent)) emitted.push(this.sent[id]);
      },
    };
    const channel = { localQueue, networkQueue: { queueFor: () => ({ on() {} }) } };
    installSimperiumReconnectFix({ buckets: [{ channel }] });
    localQueue.resendSentChanges();
    localQueue.sent.b = b; // sent by processQueue after the resend was requested
    await new Promise((r) => setTimeout(r, 100));
    expect(emitted).toEqual([a]);
    expect(localQueue.sent.a).toBe(a);
    expect(localQueue.sent.b).toBe(b);
    expect(Object.keys(localQueue.sent).sort()).toEqual(['a', 'b']);
  });
});
