/**
 * #706 (0.2.11 P1): an offline edit held at start-up and handed off after the 4 s catch-up
 * give-up goes out against the old ghost; the server's merged copy must reach the note. Real-service trial (6 Nov): 1 of 6 runs
 * lost an edit. TL repro: the live-service server model ('rebase'), the other device changed the
 * note while this machine was offline, the catch-up reply landed after the 4 s fallback of
 * whenCatchUpApplied: the client never took in the other device's line and its next edit
 * removed that line from the server (5/5 on main 2e4f50f9 and on 0.2.10 e8380c5e).
 *
 * Time is scaled 1:10 by wrapping whenCatchUpApplied: a call with fallback on gives up 400 ms
 * after a successful auth (the 4 s fallback), and the catch-up replies 500, 800 and 1500 ms late
 * (5, 8 and 15 s on the live service). Calls with fallback off are passed through unchanged.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../src/core/simperium-reconnect-fix', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/simperium-reconnect-fix')>();
  return {
    ...real,
    whenCatchUpApplied: (client: unknown, bucketName: string, fallback = true): Promise<void> => {
      if (!fallback) return real.whenCatchUpApplied(client, bucketName, false);
      const buckets = ((client ?? {}) as { buckets?: Array<{ name?: string; channel?: { message?: { on(e: string, f: (d: string) => void): unknown } } }> }).buckets ?? [];
      const message = buckets.find((b) => b?.name === bucketName)?.channel?.message;
      const authed = new Promise<void>((resolve) =>
        message?.on('auth', (data: string) => {
          try {
            JSON.parse(data);
          } catch {
            setTimeout(resolve, 400); // a plain-string auth reply is a success: the 4 s fallback, scaled 1:10
          }
        })
      );
      return Promise.race([real.whenCatchUpApplied(client, bucketName, false), authed]);
    },
  };
});

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const OFF = 'line1\nline2\nOFF';
const OTHER = 'line0\nline1\nline2';
const BOTH = 'line0\nline1\nline2\nOFF';
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
function openAt(dataDir: string, url: string, noteEditDelayMs = 10): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs }, { email: EMAIL, token: TOKEN }, () => {});
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

/** Synced at BASE, an offline edit OFF saved, the other device's OTHER on the server, then a restart whose catch-up is `delayMs` late. */
async function restartWithLateCatchUp(model: 'reject' | 'rebase', delayMs: number, noteEditDelayMs = 10): Promise<{ server: FakeSimperiumServer; c: Built; dir: string }> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.staleSvModel = model;
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'snote-cfh-'));
  dirs.push(dir);
  const a = openAt(dir, server.url);
  await waitFor(() => localContent(a) === BASE && stateContent(dir) === BASE && read(dir, 'ghosts-note.json').includes('n1'), 10000, () => 'first sync');
  stop(a);
  const b = openAt(dir, OFFLINE_URL);
  b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF } } as never);
  await waitFor(() => stateContent(dir) === OFF && read(dir, 'unsynced.json').includes('n1'), 10000, () => 'offline save');
  stop(b);
  const cur = server.getObject(APP_ID, 'note', 'n1')!.data;
  server.serverChange('note', 'n1', { ...cur, content: OTHER, modificationDate: 2500 });
  server.catchUpDelayMs = delayMs;
  return { server, c: openAt(dir, server.url, noteEditDelayMs), dir };
}

describe('#706: a held offline edit sent after the catch-up give-up keeps the other device\'s change', () => {
  const late = [500, 800, 1500].flatMap((ms) => (['rebase', 'reject'] as const).map((model) => [model, ms] as const));
  it.each(late)(
    `1 (%s, %i ms): WHEN the catch-up reply is late THEN the store, state.json and the server all end at exactly ${JSON.stringify(BOTH)}`,
    async (model, ms) => {
      const { server, c, dir } = await restartWithLateCatchUp(model, ms);
      await waitFor(() => serverContent(server) === BOTH, 10000, () => `server ${JSON.stringify(serverContent(server))}`);
      await settle(() => localContent(c) === BOTH && stateContent(dir) === BOTH, 3000);
      expect(localContent(c)).toBe(BOTH);
      expect(stateContent(dir)).toBe(BOTH);
      expect(serverContent(server)).toBe(BOTH);
    },
    20000
  );

  it.each([500, 1500])(`1b (rebase, %i ms, editor delay 1500 ms): WHEN \`TYPED\` is typed after the held edit is sent and before its merged reply THEN the store, state.json and the server all end at exactly ${JSON.stringify(BOTH + '\nTYPED')}`, async (ms) => {
    const { server, c, dir } = await restartWithLateCatchUp('rebase', ms, 1500);
    // typed the moment the held edit goes out: the merged reply comes back inside the 1500 ms editor delay
    const buckets = (c.store.client as unknown as { buckets: Array<{ name: string; channel: { localQueue: { once(e: string, f: () => void): unknown } } }> }).buckets;
    buckets.find((b) => b.name === 'note')!.channel.localQueue.once('send', () => c.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF + '\nTYPED' } } as never));
    await settle(() => serverContent(server) === BOTH + '\nTYPED' && localContent(c) === BOTH + '\nTYPED' && stateContent(dir) === BOTH + '\nTYPED', 6000);
    expect(localContent(c)).toBe(BOTH + '\nTYPED');
    expect(stateContent(dir)).toBe(BOTH + '\nTYPED');
    expect(serverContent(server)).toBe(BOTH + '\nTYPED');
  }, 20000);

  it.each([500, 800, 1500])(`2 (rebase, %i ms): WHEN the note gains \`NEXT\` after that THEN the server holds exactly ${JSON.stringify(BOTH + '\nNEXT')}`, async (ms) => {
    const { server, c } = await restartWithLateCatchUp('rebase', ms);
    await waitFor(() => serverContent(server) === BOTH, 10000, () => `server ${JSON.stringify(serverContent(server))}`);
    await settle(() => localContent(c) === BOTH, 3000);
    c.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: localContent(c) + '\nNEXT' } } as never);
    await waitFor(() => serverContent(server).includes('NEXT'), 10000, () => `server ${JSON.stringify(serverContent(server))}`);
    expect(serverContent(server)).toBe(BOTH + '\nNEXT');
  }, 20000);


  it(`3 (rebase, 1500 ms): WHEN \`MID\` is typed while the merged reply is on its way THEN the store, state.json and the server all end at exactly ${JSON.stringify(BOTH + '\nMID')}`, async () => {
    const { server, c, dir } = await restartWithLateCatchUp('rebase', 1500);
    server.versionReplyDelayMs = 300;
    await waitFor(() => server.received.some((m) => /"o":"M"/.test(m) && m.includes('OFF')), 10000, () => 'held edit sent');
    c.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: OFF + '\nMID' } } as never);
    await waitFor(() => serverContent(server).includes('MID'), 10000, () => `server ${JSON.stringify(serverContent(server))}`);
    await settle(() => localContent(c) === BOTH + '\nMID' && stateContent(dir) === BOTH + '\nMID', 3000);
    expect(localContent(c)).toBe(BOTH + '\nMID');
    expect(stateContent(dir)).toBe(BOTH + '\nMID');
    expect(serverContent(server)).toBe(BOTH + '\nMID');
  }, 20000);

  it(`4 (reject, 500 ms, hostile 'c' frames): WHEN malformed change replies and an error reply naming the held edit's ccid reach the #710 listener while the held edit is sent THEN it throws nothing and the store, state.json and the server end at exactly ${JSON.stringify(BOTH)}`, async () => {
    const { server, c, dir } = await restartWithLateCatchUp('reject', 500);
    const channel = (c.store.client as unknown as { buckets: Array<{ name: string; channel: { localQueue: { once(e: string, f: (ch: { ccid?: string }) => void): unknown }; message: { listeners(e: string): Array<(d: string) => void> } } }> }).buckets.find((b) => b.name === 'note')!.channel;
    const ours = channel.message.listeners('c').filter((l) => String(l).includes('ackSeen'));
    expect(ours).toHaveLength(1);
    const thrown: unknown[] = [];
    channel.localQueue.once('send', (sentChange) => {
      for (const frame of ['{}', '"x"', '[null]', '[{"id":"__proto__","ccids":[null]}]', JSON.stringify([{ id: 'n1', error: 409, ccids: [sentChange.ccid] }])]) {
        try {
          ours[0](frame);
        } catch (e) {
          thrown.push(e);
        }
      }
    });
    await waitFor(() => serverContent(server) === BOTH, 10000, () => `server ${JSON.stringify(serverContent(server))}`);
    await settle(() => localContent(c) === BOTH && stateContent(dir) === BOTH, 3000);
    expect(thrown).toEqual([]);
    expect(localContent(c)).toBe(BOTH);
    expect(stateContent(dir)).toBe(BOTH);
    expect(serverContent(server)).toBe(BOTH);
  }, 20000);
});
