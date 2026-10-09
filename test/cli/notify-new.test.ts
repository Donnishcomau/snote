/**
 * T374: `snote --notify-new` asks a running snote to open a new note, and a
 * running snote listens for it. CLI send path + buildStore's watchNewRequests.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { main, buildStore } from '../../src/cli/main';
import { onNewRequest } from '../../src/core/new-request';

// Poll a condition with a 10 ms step so a late timer only makes a test
// slower, never red. EVERY asserted value sits inside the poll condition.
const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

const sleepAlive = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe('T374 --notify-new', () => {
  let dir: string;
  let logged: string[];
  let io: { log: (text: string) => void };
  let child: ChildProcess | undefined;
  let server: FakeSimperiumServer | undefined;
  let stopSaving: (() => void) | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-notify-'));
    logged = [];
    io = { log: (text) => logged.push(text) };
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    child?.kill();
    child = undefined;
    if (server) {
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          s.stop();
          resolve();
        }, 100);
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Fixture auth.json: {"email":"a@b.c","token":"t"} at the data-dir root.
  const writeAuth = (): void => {
    fs.writeFileSync(
      path.join(dir, 'auth.json'),
      JSON.stringify({ email: 'a@b.c', token: 't' }),
    );
  };

  // Fixture lock owner: a live `sleep` child whose pid is in the account
  // folder's instance.lock (the account folder is `<dir>/a@b.c`).
  const lockLiveChild = (acct: string): string => {
    fs.mkdirSync(acct, { recursive: true });
    child = spawn('sleep', ['30'], { stdio: 'ignore' });
    child.unref();
    fs.writeFileSync(path.join(acct, 'instance.lock'), String(child.pid));
    return String(child.pid);
  };

  it("1: WHEN main(['--notify-new','--data-dir',dir], io) runs with auth.json and a live-pid lock in `<dir>/a@b.c/` THEN it resolves `0`, `logged` is empty and `<dir>/a@b.c/new-note.request` exists", async () => {
    writeAuth();
    const acct = path.join(dir, 'a@b.c');
    lockLiveChild(acct);

    const code = await main(['--notify-new', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged).toEqual([]);
    expect(fs.existsSync(path.join(acct, 'new-note.request'))).toBe(true);
  });

  it("2: WHEN it runs with auth.json but no lock file THEN it resolves `3`, `logged` is empty and `<dir>/a@b.c` has no `new-note.request`", async () => {
    writeAuth();
    const acct = path.join(dir, 'a@b.c');
    fs.mkdirSync(acct);

    const code = await main(['--notify-new', '--data-dir', dir], io);

    expect(code).toBe(3);
    expect(logged).toEqual([]);
    expect(fs.readdirSync(acct)).not.toContain('new-note.request');
  });

  it("3: WHEN it runs with no auth.json THEN it resolves `3`, `logged` is empty and `fs.readdirSync(dir)` is still empty (nothing created)", async () => {
    const code = await main(['--notify-new', '--data-dir', dir], io);

    expect(code).toBe(3);
    expect(logged).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("4: WHEN main(['--notify-new','--help'], io) runs THEN it resolves `0`, `logged` has 1 entry containing `--notify-new`, and no entry contains `error: unknown option`", async () => {
    const code = await main(['--notify-new', '--help'], io);

    expect(code).toBe(0);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('--notify-new');
    expect(logged.some((l) => l.includes('error: unknown option'))).toBe(false);
  });

  // Fixture for 5/6: buildStore against the fake server with a listener
  // subscribed and a fresh `new-note.request` written in its dir.
  const buildWithFreshRequest = async (): Promise<{ calls: () => number; requestPath: string }> => {
    server = new FakeSimperiumServer();
    await server.start();

    let n = 0;
    onNewRequest(() => {
      n += 1;
    });

    const requestPath = path.join(dir, 'new-note.request');
    fs.writeFileSync(requestPath, JSON.stringify({ v: 1, t: Date.now() }));

    const built = buildStore(
      {
        dataDir: dir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
        newRequestPollMs: 20,
      },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stopSaving = built.stopSaving;
    return { calls: () => n, requestPath };
  };

  it("5: WHEN buildStore runs with `newRequestPollMs: 20`, `onNewRequest(listener)` is subscribed and a fresh `new-note.request` is written in its dir THEN, polled, `listener` was called `1` time and the file is gone", async () => {
    const { calls, requestPath } = await buildWithFreshRequest();

    await waitFor(() => calls() === 1 && !fs.existsSync(requestPath));
    expect(calls()).toBe(1);
    expect(fs.existsSync(requestPath)).toBe(false);
  });

  it("6: WHEN the `stopSaving` returned by that `buildStore` has run and a fresh `new-note.request` is written again THEN after 200 ms `listener` is still at `1` call and the file still exists", async () => {
    const { calls, requestPath } = await buildWithFreshRequest();

    // Consume the fixture's request first (both values inside the poll).
    await waitFor(() => calls() === 1 && !fs.existsSync(requestPath));

    const stop = stopSaving!;
    stopSaving = undefined;
    stop();

    fs.writeFileSync(requestPath, JSON.stringify({ v: 1, t: Date.now() }));
    await sleepAlive(200);
    expect(calls()).toBe(1);
    expect(fs.existsSync(requestPath)).toBe(true);
  });
});
