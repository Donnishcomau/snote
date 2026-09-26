/**
 * T302 Fake server: a remove for a note it no longer has must not be
 * broadcast (two clients ping-pong forever).
 *
 * A remote remove makes simperium's Bucket.onChannelRemove call
 * bucket.remove(id), which queues one more remove (the ghost store's
 * `get` resolves a version-0 placeholder for a missing id). The fake
 * server must answer such a remove for an id it no longer holds with
 * error 412 to the sender ONLY — no broadcast, no cv bump — so two
 * connected clients cannot bounce the remove back and forth forever.
 *
 * Each acceptance line becomes one `it()`.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const TOKEN = 'test-token';

const TEST_TIMEOUT = 10_000;

function noteData(content: string): Record<string, unknown> {
  const now = Date.now();
  return {
    content,
    creationDate: now,
    deleted: 0,
    modificationDate: now,
    systemTags: [],
    tags: [],
  };
}

/** Poll every 20 ms up to `timeoutMs`; throws on timeout. */
async function pollUntil(
  cond: () => boolean,
  timeoutMs: number,
  label: string
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * Open a raw WS client and run the init handshake on channel 0 for the
 * given bucket until the server's `auth` reply arrives.
 */
async function openChannel(
  url: string,
  channel: number,
  bucketName: string
): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timeout waiting for auth on channel ${channel}`)),
      3000
    );
    const handler = (data: WebSocket.RawData) => {
      if (data.toString().startsWith(`${channel}:auth:`)) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
    ws.send(
      `${channel}:init:${JSON.stringify({
        token: TOKEN,
        app_id: APP_ID,
        name: bucketName,
      })}`
    );
  });
  return ws;
}

/**
 * Fixture for the raw-protocol lines: server seeded with `existing1`
 * plus two raw WS connections (A and B) inited on channel 0 → note.
 * `framesA` / `framesB` record every frame each client receives;
 * `removeFrames(id)` filters `c:` frames mentioning that id.
 */
async function rawFixture() {
  const server = new FakeSimperiumServer();
  const { url } = await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'existing1', data: noteData('Original content'), version: 1 },
  ]);

  const framesA: string[] = [];
  const framesB: string[] = [];
  const wsA = await openChannel(url, 0, 'note');
  wsA.on('message', (d: WebSocket.RawData) => framesA.push(d.toString()));
  const wsB = await openChannel(url, 0, 'note');
  wsB.on('message', (d: WebSocket.RawData) => framesB.push(d.toString()));

  const removeFrames = (frames: string[], id: string): string[] =>
    frames.filter((f) => f.includes(':c:') && f.includes(`"id":"${id}"`));

  return { server, url, wsA, wsB, framesA, framesB, removeFrames };
}

async function closeRaw(f: {
  server: FakeSimperiumServer;
  wsA: WebSocket;
  wsB: WebSocket;
}): Promise<void> {
  f.wsA.close();
  f.wsB.close();
  await new Promise((r) => setTimeout(r, 100));
  f.server.stop();
  await new Promise((r) => setTimeout(r, 50));
}

describe('T302 remove for a missing id', () => {
  it('1: WHEN a connected client sends a `-` change for an id the bucket does not hold THEN that client receives a `c:` message containing "error":412 and a second connected client receives no message for that id within 500 ms', async () => {
    const f = await rawFixture();
    try {
      const ccid = 'ccid-missing-1';
      f.wsA.send(
        `0:c:${JSON.stringify({ o: '-', id: 'ghostly', ccid })}`
      );

      // The sender gets the 412 acknowledgement. Poll on it so the
      // assertion only runs once the frame has actually arrived.
      await pollUntil(
        () =>
          f.framesA.some(
            (fr) =>
              fr.startsWith('0:c:') &&
              fr.includes(`"ccid":"${ccid}"`) &&
              fr.includes('"error":412')
          ),
        2000,
        '412 error for ghostly on client A'
      );
      const sent412 = f.framesA.filter(
        (fr) => fr.includes('"error":412') && fr.includes('"id":"ghostly"')
      );
      expect(sent412.length).toBeGreaterThanOrEqual(1);

      // The second client must receive NOTHING for that id within 500 ms.
      await new Promise((r) => setTimeout(r, 500));
      expect(f.removeFrames(f.framesB, 'ghostly')).toEqual([]);

      // The server counted the remove.
      expect(f.server.removesReceived.get('ghostly')).toBe(1);
    } finally {
      await closeRaw(f);
    }
  }, TEST_TIMEOUT);

  it('2: WHEN a connected client sends a `-` change for an id the bucket holds THEN the entry is gone and the second connected client receives a `c:` message with "o":"-" for that id (unchanged behaviour)', async () => {
    const f = await rawFixture();
    try {
      const ccid = 'ccid-present-2';
      f.wsA.send(
        `0:c:${JSON.stringify({ o: '-', id: 'existing1', ccid })}`
      );

      // The second client receives the remove broadcast.
      await pollUntil(
        () =>
          f.framesB.some(
            (fr) =>
              fr.startsWith('0:c:') &&
              fr.includes('"o":"-"') &&
              fr.includes('"id":"existing1"')
          ),
        2000,
        'remove broadcast for existing1 on client B'
      );
      const bcast = f.framesB.filter(
        (fr) => fr.includes('"o":"-"') && fr.includes('"id":"existing1"')
      );
      expect(bcast.length).toBeGreaterThanOrEqual(1);

      // The entry is gone from the bucket.
      expect(f.server.getObject(APP_ID, 'note', 'existing1')).toBeUndefined();

      // The server counted the remove (unchanged behaviour).
      expect(f.server.removesReceived.get('existing1')).toBe(1);
    } finally {
      await closeRaw(f);
    }
  }, TEST_TIMEOUT);

  it('3: WHEN two buildStore clients A and B are connected to the same server and A dispatches DELETE_NOTE_FOREVER for a synced note n1 THEN after 2000 ms the server holds no n1, both clients\' pendingCount is 0, and removesReceived.get("n1") is at most 3', async () => {
    const server = new FakeSimperiumServer();
    await server.start();

    const dirA = mkdtempSync(join(tmpdir(), 'snote-t302-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'snote-t302-b-'));
    const a = buildStore(
      { dataDir: dirA, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
      { email: 'a@example.com', token: TOKEN },
      () => {}
    );
    const b = buildStore(
      { dataDir: dirB, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
      { email: 'b@example.com', token: TOKEN },
      () => {}
    );

    try {
      // Create n1 on A and let it sync to the server.
      a.store.dispatch({
        type: 'CREATE_NOTE_WITH_ID' as never,
        noteId: 'n1' as never,
        note: noteData('hello') as never,
      } as never);
      await pollUntil(
        () => server.getObject(APP_ID, 'note', 'n1') !== undefined,
        4000,
        'n1 created on server'
      );

      // Let the remove settle for 2000 ms (the ping-pong loop, if any,
      // would still be running by now; with the fix it stops).
      a.store.dispatch({
        type: 'DELETE_NOTE_FOREVER' as never,
        noteId: 'n1' as never,
      } as never);
      await new Promise((r) => setTimeout(r, 2000));

      // All values asserted here are inside the polled condition.
      const settled = () =>
        server.getObject(APP_ID, 'note', 'n1') === undefined &&
        pendingCount(a.store.getState().simperium) === 0 &&
        pendingCount(b.store.getState().simperium) === 0 &&
        (server.removesReceived.get('n1') ?? 0) <= 3;
      await pollUntil(settled, 4000, 'remove of n1 settles without ping-pong');

      expect(server.getObject(APP_ID, 'note', 'n1')).toBeUndefined();
      expect(pendingCount(a.store.getState().simperium)).toBe(0);
      expect(pendingCount(b.store.getState().simperium)).toBe(0);
      expect(server.removesReceived.get('n1') ?? 0).toBeLessThanOrEqual(3);
    } finally {
      a.stopSaving();
      b.stopSaving();
      a.store.stopSync?.();
      b.store.stopSync?.();
      await new Promise((r) => setTimeout(r, 100));
      server.stop();
      await new Promise((r) => setTimeout(r, 50));
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
