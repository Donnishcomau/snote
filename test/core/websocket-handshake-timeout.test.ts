/**
 * #196: a sync server that
 * accepts the connection and never answers the websocket upgrade must not leave
 * snote waiting for the whole session. The timeout is HANDSHAKE_TIMEOUT_MS; these
 * tests inject a short one through the provider's second argument.
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach, beforeAll } from 'vitest';

import { connectionWord } from '../../src/core/connection-word';
import { makeStore, waitForNotes } from '../../src/core/store';
import { HANDSHAKE_TIMEOUT_MS, hasOpenSocket, snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { FakeSimperiumServer } from '../fake-simperium/server';

type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void; client?: unknown };
type Timer = { reconnectionTimer: { interval: (attempt: number) => number } };

const APP_ID = 'test-app';
const SHORT_MS = 100;
const noteData = { content: 'Original a', creationDate: 1_000, modificationDate: 1_000, deleted: 0, systemTags: [], tags: [] };

/** Files under `dir` (recursively, .ts and .tsx) that open a websocket outside src/core/websocket-provider.ts. */
function socketBypasses(dir: string, root: string = dir): string[] {
  const hits: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { hits.push(...socketBypasses(path, root)); continue; }
    if (!/\.tsx?$/.test(name) || path.endsWith(join('core', 'websocket-provider.ts'))) continue;
    if (/new\s+(W3CWebSocket|w3cwebsocket|WebSocket)\s*\(|from\s+'websocket'|require\('websocket'\)/.test(readFileSync(path, 'utf8'))) hits.push(path.slice(root.length + 1));
  }
  return hits;
}

describe('#196 the websocket upgrade has a timeout', () => {
  let server: FakeSimperiumServer | undefined;
  let store: SyncStore | undefined;

  // The first makeStore pays the module load cost; take it here, not inside the 3 s of test 1.
  beforeAll(async () => {
    const warm = new FakeSimperiumServer();
    await warm.start();
    const s = syncStore(warm.url, HANDSHAKE_TIMEOUT_MS);
    for (let i = 0; i < 160 && !s.getState().simperium.connected; i++) await new Promise((r) => setTimeout(r, 50));
    s.stopSync?.();
    warm.stop();
  }, 15000);

  afterEach(() => {
    store?.stopSync?.();
    store = undefined;
    server?.stop();
    server = undefined;
  });

  function syncStore(url: string, handshakeMs: number = SHORT_MS): SyncStore {
    const s = makeStore({
      sync: {
        appId: APP_ID, token: 'test-token', username: 'test@example.com', noteEditDelayMs: 10,
        clientOptions: { url, websocketClientProvider: (u: string) => snoteWebsocketProvider(u, handshakeMs) } as never,
      },
    }) as SyncStore;
    (s.client as Timer).reconnectionTimer.interval = () => 20;
    return s;
  }

  it('1: WHEN the sync server accepts every connection and never answers the upgrade THEN snote gives up on each one and the store retries: at least `2` handshakes within 2 s, at most `1` TCP connection open, `hasOpenSocket()` false and the word `connecting`', async () => {
    server = new FakeSimperiumServer();
    server.silentUpgrades = 1000;
    const { url } = await server.start();
    store = syncStore(url);
    await expect
      .poll(() => ({
        retried: server!.handshakeHeaders.length >= 2,
        open: server!.openSockets.size <= 1,
        socket: hasOpenSocket(),
        word: connectionWord(store!.getState().simperium, hasOpenSocket()),
      }), { timeout: 2000 })
      .toEqual({ retried: true, open: true, socket: false, word: 'connecting' });
  });

  it('2: WHEN the first reconnect upgrade goes unanswered, a note is edited meanwhile and the next attempt is answered THEN the store is `connected` and the server holds the edit `edited while hung` after exactly `1` change frame for that note', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(APP_ID, 'note', [{ id: 'a', data: noteData, version: 1 }]);
    store = syncStore(server.url, 600);
    await waitForNotes(store, 2500);
    server.silentUpgrades = 1;
    server.dropClient('test@example.com');
    await expect.poll(() => ({ n: server!.handshakeHeaders.length, connected: store!.getState().simperium.connected }), { timeout: 2000 }).toEqual({ n: 2, connected: false });
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'a' as never, changes: { content: 'edited while hung' } });
    await expect
      .poll(() => ({
        connected: store!.getState().simperium.connected,
        content: server!.getObject(APP_ID, 'note', 'a')?.data.content,
        frames: server!.received.filter((m) => m.includes(':c:') && m.includes('"id":"a"')).length,
      }), { timeout: 2000 })
      .toEqual({ connected: true, content: 'edited while hung', frames: 1 });
  });

  it('3: WHEN the server answers the upgrade normally THEN the first attempt connects at once, with `1` handshake and the word `connected`, under the named `HANDSHAKE_TIMEOUT_MS` of between `5000` and `60000` ms', async () => {
    expect(typeof HANDSHAKE_TIMEOUT_MS).toBe('number');
    expect(HANDSHAKE_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(HANDSHAKE_TIMEOUT_MS).toBeLessThanOrEqual(60000);
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(APP_ID, 'note', [{ id: 'a', data: noteData, version: 1 }]);
    store = syncStore(server.url, HANDSHAKE_TIMEOUT_MS);
    await expect
      .poll(() => ({ n: server!.handshakeHeaders.length, word: connectionWord(store!.getState().simperium, hasOpenSocket()) }), { timeout: 2500 })
      .toEqual({ n: 1, word: 'connected' });
  });

  it('4: WHEN every file under src/ is scanned for opening a websocket THEN the list outside `src/core/websocket-provider.ts` is empty, and a scratch directory with a bypass is reported as `scratch.ts`', () => {
    expect(socketBypasses('src')).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-ws-guard-'));
    try {
      writeFileSync(join(dir, 'scratch.ts'), "import { w3cwebsocket } from 'websocket';\nexport const s = new w3cwebsocket('ws://x');\n");
      expect(socketBypasses(dir)).toEqual(['scratch.ts']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(readFileSync('src/core/websocket-provider.ts', 'utf8')).toContain('HANDSHAKE_TIMEOUT_MS');
  });
});
