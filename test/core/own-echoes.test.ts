/**
 * T526 — the owed-ack tracker (`trackOwnEchoes`) on a fake note channel
 * built only from `EventEmitter` (node:events).
 *
 * The tracker touches exactly: `client.buckets[i].name` and `.channel`,
 * `channel.message.prependListener`, `channel.localQueue.sent`,
 * `channel.localQueue.on` and `channel.on`. The file
 * `sent-changes.json` is written BEFORE `trackOwnEchoes` runs (it reads
 * the record once at open); the seed happens synchronously inside the
 * `c` emit, so every assertion right after the emit is deterministic.
 *
 * Lines 3-4 pin the seeding rule (never over a change the library has
 * in flight; seeded when nothing is in flight); line 5 pins that after
 * `stop` nothing rewrites `sent-changes.json`; line 6 pins the module
 * carries no late-echo parking and no re-read of the record.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { trackOwnEchoes } from '../../src/core/own-echoes';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t526-'));
  dirs.push(dir);
  return dir;
}

interface InFlightEntry {
  id: string;
  ccid?: string;
}

/**
 * Fake channel: the minimum the tracker touches, per the brief's proven
 * shape. `sent`, `acknowledged` and `settle` write the record
 * synchronously, so the file is current the moment an emit returns.
 */
function fakeChannel(inFlight: Record<string, InFlightEntry> = {}) {
  const message = new EventEmitter();
  const localQueue = Object.assign(new EventEmitter(), { sent: inFlight });
  const channel = Object.assign(new EventEmitter(), { message, localQueue });
  const client = { buckets: [{ name: 'note', channel }] };
  return { client, message, localQueue, channel };
}

function seedRecord(dir: string, entries: Record<string, string>): void {
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify(entries));
}

/** A `c` message echoing `ccid` for note `id`, as the server sends it. */
function echoMessage(id: string, ccid: string): string {
  return JSON.stringify([
    { id, ccids: [ccid], sv: 1, ev: 2, o: 'M', v: {} },
  ]);
}

const readSentFile = (dir: string): string =>
  readFileSync(join(dir, 'sent-changes.json'), 'utf8');

describe('T526 the owed-ack tracker on a fake note channel', () => {
  it("3: WHEN sent-changes.json maps n1 to `echo-ccid`, the channel has n1 in flight with ccid `inflight-ccid`, and a c message echoing `echo-ccid` for n1 arrives THEN the in-flight n1 entry still has ccid `inflight-ccid`", () => {
    const dir = freshDir();
    seedRecord(dir, { n1: 'echo-ccid' });
    const { client, message, localQueue } = fakeChannel({
      n1: { id: 'n1', ccid: 'inflight-ccid' },
    });
    const tracker = trackOwnEchoes(client, dir);
    // The echo matches the loaded record entry, but `echoes` skips ids
    // the library has in flight, so the library's own entry is kept.
    message.emit('c', echoMessage('n1', 'echo-ccid'));
    expect((localQueue.sent['n1'] as InFlightEntry).ccid).toBe('inflight-ccid');
    tracker.stop();
  });

  it("4: WHEN sent-changes.json maps n1 to `echo-ccid`, nothing is in flight for n1, and a c message echoing `echo-ccid` for n1 arrives THEN the in-flight n1 entry has ccid `echo-ccid`", () => {
    const dir = freshDir();
    seedRecord(dir, { n1: 'echo-ccid' });
    const { client, message, localQueue } = fakeChannel({});
    const tracker = trackOwnEchoes(client, dir);
    // GUARD: an echo with nothing in flight is still seeded so the
    // library acknowledges it instead of applying it a second time.
    message.emit('c', echoMessage('n1', 'echo-ccid'));
    expect((localQueue.sent['n1'] as InFlightEntry).ccid).toBe('echo-ccid');
    tracker.stop();
  });

  it('5: WHEN snote has synced n1, stopSaving() is called, sent-changes.json is deleted, and n1 is edited to line1\\nline2\\nLATE THEN the server\'s n1 is exactly line1\\nline2\\nLATE and sent-changes.json does not exist', async () => {
    const server = new (await import('../fake-simperium/server')).FakeSimperiumServer();
    await server.start();
    const dir = freshDir();
    try {
      server.seedBucket('test-app', 'note', [
        {
          id: 'n1',
          data: {
            content: 'line1\nline2',
            creationDate: 1000,
            deleted: false,
            modificationDate: 2000,
            systemTags: [],
            tags: [],
          },
          version: 1,
        },
      ]);
      const { buildStore } = await import('../../src/cli/main');
      const { pendingCount } = await import('../../src/core/simperium-reducer');
      const { store, stopSaving } = buildStore(
        { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
        { email: 'store1@example.com', token: 'store1-token' },
        () => {}
      );
      const localN1 = () =>
        store.getState().data.notes.get('n1' as never)?.content as
          | string
          | undefined;
      const pending = () => pendingCount(store.getState().simperium);
      const serverN1 = () =>
        String(server.getObject('test-app', 'note', 'n1')?.data.content ?? '');
      // Synced with nothing pending.
      const syncedAt = Date.now();
      while (!(localN1() === 'line1\nline2' && pending() === 0)) {
        if (Date.now() - syncedAt > 10000) throw new Error('never synced');
        await new Promise((r) => setTimeout(r, 25));
      }
      // stopSaving ONLY — no end, no stopSync: the client keeps syncing.
      stopSaving();
      rmSync(join(dir, 'sent-changes.json'), { force: true });
      store.dispatch({
        type: 'EDIT_NOTE' as never,
        noteId: 'n1' as never,
        changes: { content: 'line1\nline2\nLATE' } as never,
      });
      // One wait condition for all three asserted values.
      const want = () =>
        serverN1() === 'line1\nline2\nLATE' &&
        pending() === 0 &&
        !existsSync(join(dir, 'sent-changes.json'));
      const started = Date.now();
      while (!want()) {
        if (Date.now() - started > 15000) {
          throw new Error(
            `server: ${JSON.stringify(serverN1())}, pending: ${pending()}, ` +
              `sent-changes.json exists: ${existsSync(join(dir, 'sent-changes.json'))}`
          );
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(serverN1()).toBe('line1\nline2\nLATE');
      expect(pending()).toBe(0);
      expect(existsSync(join(dir, 'sent-changes.json'))).toBe(false);
      (store.client as unknown as { end?: () => void })?.end?.();
      store.stopSync?.();
    } finally {
      server.stop();
    }
  }, 20000);

  it("6: WHEN src/core/own-echoes.ts is read as text THEN it contains no `parked`, no `setTimeout` and no `loadSentChanges`", () => {
    const src = readFileSync('src/core/own-echoes.ts', 'utf8');
    expect(src).not.toContain('parked');
    expect(src).not.toContain('setTimeout');
    expect(src).not.toContain('loadSentChanges');
  });
});
