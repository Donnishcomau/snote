/**
 * Issue #30 L5b (#933 review, fix 2): the running snote's side of the bar's update ask is wired. buildStore starts an
 * update-ask watcher on its own dir whose callback is openUpdateAskFromBar, and its stopSaving stops that watcher; the
 * watcher also answers on the folder's change event alone, without its poll. watchNewRequests is wrapped (the real one
 * runs) so the test can see which callback buildStore passed and whether the stop it returned ran.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { UPDATE_ASK_FILE, watchNewRequests } from '../../src/core/new-request';
import { openUpdateAskFromBar } from '../../src/tui/update-ask';

type Seen = { onRequest: () => void; calls: number; stops: number };
const seen = vi.hoisted(() => ({ asks: [] as Seen[] }));

vi.mock('../../src/core/new-request', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/new-request')>();
  return {
    ...real,
    watchNewRequests: (dir: string, onRequest: () => void, opts?: { pollMs?: number; staleMs?: number; file?: string }): (() => void) => {
      if (opts?.file !== real.UPDATE_ASK_FILE) return real.watchNewRequests(dir, onRequest, opts);
      const w: Seen = { onRequest, calls: 0, stops: 0 };
      seen.asks.push(w);
      const stop = real.watchNewRequests(dir, () => { w.calls += 1; onRequest(); }, opts);
      return () => { w.stops += 1; stop(); };
    },
  };
});

describe('issue #30 L5b the running snote listens for the bar update ask', () => {
  let dir: string;
  let server: FakeSimperiumServer | undefined;
  let stop: (() => unknown) | undefined;
  const reqPath = (): string => path.join(dir, UPDATE_ASK_FILE);
  const gone = (): boolean => { try { fs.lstatSync(reqPath()); return false; } catch { return true; } };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-askwire-'));
    seen.asks.length = 0;
  });

  afterEach(async () => {
    stop?.();
    stop = undefined;
    if (server) {
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => { setTimeout(() => { s.stop(); resolve(); }, 100); });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('10: WHEN buildStore runs with `newRequestPollMs: 20` THEN it starts one update-ask watcher whose callback is `openUpdateAskFromBar`; a symlink named `update-ask.request` is swept, a fresh regular `update-ask.request` written after that is gone and calls it `1` time, and `stopSaving` stops that watcher `1` time', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10, newRequestPollMs: 20 },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stop = built.stopSaving;
    expect(seen.asks.map((w) => w.onRequest === openUpdateAskFromBar)).toEqual([true]);
    fs.symlinkSync(path.join(dir, 'elsewhere'), reqPath());
    await expect.poll(gone, { timeout: 1200 }).toBe(true);
    fs.writeFileSync(reqPath(), '1');
    await expect.poll(() => ({ gone: gone(), calls: seen.asks[0].calls }), { timeout: 1200 }).toEqual({ gone: true, calls: 1 });
    const stopSaving = built.stopSaving;
    stop = undefined;
    stopSaving();
    expect({ calls: seen.asks[0].calls, stops: seen.asks[0].stops }).toEqual({ calls: 1, stops: 1 });
  });

  it('11: WHEN the update-ask watcher runs with `pollMs: 60000` (no poll inside the test) THEN a symlink named `update-ask.request` is swept and a fresh regular `update-ask.request` written after that is gone and calls it `1` time, both on the folder change event alone', async () => {
    let calls = 0;
    stop = watchNewRequests(dir, () => (calls += 1), { pollMs: 60_000, file: UPDATE_ASK_FILE });
    fs.symlinkSync(path.join(dir, 'elsewhere'), reqPath());
    await expect.poll(gone, { timeout: 1200 }).toBe(true);
    fs.writeFileSync(reqPath(), '1');
    await expect.poll(() => ({ gone: gone(), calls }), { timeout: 1200 }).toEqual({ gone: true, calls: 1 });
  });
});
