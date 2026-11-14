/**
 * #560 ( follow-up): a first edit in a session is sent at once, even when the catch-up reply
 * never comes; only an offline edit held at start-up waits for the catch-up, or for its fallback when no
 * reply comes, and then goes out once. Proven on main 3e6dc4e8 (probe, 6 Nov): dropped
 * reply, in-session edit on the server after ~31 ms; held offline edit after ~4031 ms (the 4 s fallback).
 * The held edit must not go earlier: a send before the catch-up is the #706 loss.
 *
 * Time is scaled 1:10 by wrapping whenCatchUpApplied, as in catchup-fallback-held-edit.test.ts: a call
 * with fallback on gives up 400 ms after a successful auth. Calls with fallback off pass through unchanged.
 * The tests read "the fallback has ended" from that 400 ms timer alone (fallbackEnded), never from the
 * library's 'ready': the library emits 'ready' on any `c:` reply, the held edit's own acknowledgement
 * included, so a held edit sent too early would otherwise end its own wait and pass.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { fallbackEnded } = vi.hoisted(() => ({
  /** Resolves 400 ms after the bucket's next successful auth: the 4 s fallback, scaled 1:10. A timer only. */
  fallbackEnded: (client: unknown, bucketName = 'note'): Promise<void> => {
    const buckets = ((client ?? {}) as { buckets?: Array<{ name?: string; channel?: { message?: { on(e: string, f: (d: string) => void): unknown } } }> }).buckets ?? [];
    const message = buckets.find((b) => b?.name === bucketName)?.channel?.message;
    return new Promise<void>((resolve) =>
      message?.on('auth', (data: string) => {
        try {
          JSON.parse(data);
        } catch {
          setTimeout(resolve, 400); // a plain-string auth reply is a success
        }
      })
    );
  },
}));

vi.mock('../../src/core/simperium-reconnect-fix', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/simperium-reconnect-fix')>();
  return {
    ...real,
    whenCatchUpApplied: (client: unknown, bucketName: string, fallback = true): Promise<void> => {
      if (!fallback) return real.whenCatchUpApplied(client, bucketName, false);
      return Promise.race([real.whenCatchUpApplied(client, bucketName, false), fallbackEnded(client, bucketName)]);
    },
  };
});

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const FIRST = 'FIRST\nline2';
const OFF = 'OFFLINE\nline2';
const OFFLINE_URL = 'ws://127.0.0.1:9';

type Built = ReturnType<typeof buildStore>;
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

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
/** Polls like waitFor, but returns false at the bound instead of throwing, so the test fails by its assertion. */
async function settle(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
}
function openAt(dataDir: string, url: string): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}
function stop(b: Built): void {
  const i = open.indexOf(b);
  if (i >= 0) open.splice(i, 1);
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
}
const localContent = (b: Built): string =>
  String((b.store.getState().data.notes.get('n1' as never) as { content?: string } | undefined)?.content ?? '');
const serverContent = (s: FakeSimperiumServer): string => String(s.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const read = (dir: string, name: string): string => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
};
const stateContent = (dir: string): string => {
  try {
    const s = JSON.parse(read(dir, 'state.json')) as { data: { notes: { __map?: Array<[string, { content?: string }]> } } };
    return String(new Map(s.data.notes.__map ?? []).get('n1')?.content ?? '');
  } catch {
    return '';
  }
};
/** The `c:` change messages for n1 the server received from index `from` on, and their ccids. */
const changesFor = (s: FakeSimperiumServer, from: number): string[] =>
  s.received.slice(from).flatMap((m) => {
    const i = m.indexOf(':c:');
    if (i < 0) return [];
    try {
      const c = JSON.parse(m.slice(i + 3)) as { id?: string; ccid?: string };
      return c.id === 'n1' ? [String(c.ccid)] : [];
    } catch {
      return [];
    }
  });

/** Synced at BASE, then (optionally) an offline edit OFF saved; the restart's catch-up reply never comes. */
async function restartWithoutCatchUp(offline: boolean): Promise<{ server: FakeSimperiumServer; c: Built; from: number }> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'snote-560-'));
  dirs.push(dir);
  const a = openAt(dir, server.url);
  await waitFor(() => localContent(a) === BASE && stateContent(dir) === BASE && read(dir, 'ghosts-note.json').includes('n1'), 10000, () => 'first sync');
  stop(a);
  if (offline) {
    const b = openAt(dir, OFFLINE_URL);
    b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF } } as never);
    await waitFor(() => stateContent(dir) === OFF && read(dir, 'unsynced.json').includes('n1'), 10000, () => 'offline save');
    stop(b);
  }
  server.dropEmptyCatchUpReply = true;
  const from = server.received.length;
  return { server, c: openAt(dir, server.url), from };
}

describe('#560: a first edit does not wait for a catch-up reply that never comes', () => {
  it('1: WHEN the restart catch-up reply never comes and the user makes the first edit of the session THEN the server holds that edit before the catch-up fallback ends, from exactly one change message', async () => {
    const { server, c, from } = await restartWithoutCatchUp(false);
    let gaveUp = false;
    void fallbackEnded(c.store.client).then(() => (gaveUp = true)); // the (scaled) fallback the held edits wait for, as a timer
    expect(localContent(c)).toBe(BASE); // the note is in the store from state.json at once
    c.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: FIRST } } as never);
    let early = false;
    const arrived = await settle(() => {
      if (serverContent(server) !== FIRST) return false;
      early = !gaveUp;
      return true;
    }, 2500);
    expect({ arrived, early, asked: server.received.slice(from).some((m) => m.includes(':cv:')) }).toEqual({ arrived: true, early: true, asked: true });
    expect(changesFor(server, from)).toHaveLength(1);
  }, 15000);

  it('2: WHEN an offline edit is held at start-up and the restart catch-up reply never comes THEN once the fallback has ended the server holds the offline edit, from exactly one change message with one ccid', async () => {
    const { server, c, from } = await restartWithoutCatchUp(true);
    let gaveUp = false;
    void fallbackEnded(c.store.client).then(() => (gaveUp = true)); // the (scaled) fallback the held edit waits for, as a timer
    let late = false;
    const arrived = await settle(() => {
      if (serverContent(server) !== OFF) return false;
      late = gaveUp;
      return true;
    }, 2500);
    expect({ arrived, late }).toEqual({ arrived: true, late: true });
    const ccids = changesFor(server, from);
    expect(ccids).toHaveLength(1);
    expect(new Set(ccids).size).toBe(1);
  }, 15000);
});
