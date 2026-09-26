/**
 * T73: login calls for the root screen; saver stopped before logout wipes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { loginCalls } from '../../src/cli/login-calls';
import { buildStore } from '../../src/cli/main';

vi.setConfig({ testTimeout: 15000 });

const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('T73 login-calls', () => {
  let server: FakeSimperiumServer;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
  });

  it('1: WHEN loginCalls(server.url, "test-app").passwordLogin("a@b.co", "correct-horse") is called THEN it resolves test-token', async () => {
    const token = await loginCalls(server.url, 'test-app').passwordLogin(
      'a@b.co',
      'correct-horse'
    );
    expect(token).toBe('test-token');
  });

  it('2: WHEN the same is called with the password "nope" THEN it rejects and the message contains invalid login', async () => {
    await expect(
      loginCalls(server.url, 'test-app').passwordLogin('a@b.co', 'nope')
    ).rejects.toThrow(/invalid login/);
  });

  it('3: WHEN requestCode("a@b.co") and then completeLogin("a@b.co", "ABC123") from the same object are called THEN the first resolves and the second resolves test-token; with the code WRONG1 it rejects and the message contains 401', async () => {
    const calls = loginCalls(server.url, 'test-app');
    await expect(calls.requestCode('a@b.co')).resolves.toBeUndefined();
    const token = await calls.completeLogin('a@b.co', 'ABC123');
    expect(token).toBe('test-token');
    await expect(calls.completeLogin('a@b.co', 'WRONG1')).rejects.toThrow(/401/);
  });

  it('4: WHEN globalThis.fetch is a vi.fn() that resolves new Response("{}") and loginCalls(undefined, "x") is called THEN it returns the three functions requestCode, completeLogin, passwordLogin and fetch was not called', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const calls = loginCalls(undefined, 'x');

    expect(typeof calls.requestCode).toBe('function');
    expect(typeof calls.completeLogin).toBe('function');
    expect(typeof calls.passwordLogin).toBe('function');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('5: WHEN with that fetch mock loginCalls("wss://h.example:9", "x").requestCode("a@b.co") is called THEN the first argument of the one fetch call starts with https://h.example:9/account/request-login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await loginCalls('wss://h.example:9', 'x').requestCode('a@b.co');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstArg = String(fetchMock.mock.calls[0][0]);
    expect(firstArg.startsWith('https://h.example:9/account/request-login')).toBe(true);
  });

  it('6: WHEN a buildStore store has loaded note1, then gets EDIT_NOTE (content edited) and right after it { type: "REALLY_LOG_OUT" } THEN onLogout was called exactly once and 700 ms later state.json does not exist in dir', async () => {
    server.seedBucket('test-app', 'note', [
      {
        id: 'note1',
        data: {
          content: 'First',
          creationDate: Date.now(),
          deleted: 0,
          modificationDate: Date.now(),
          systemTags: [],
          tags: [],
        },
      },
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t73-'));
    let stopSaving: (() => void) | undefined;
    try {
      const onLogout = vi.fn(() =>
        fs.rmSync(path.join(dir, 'state.json'), { force: true })
      );
      const built = buildStore(
        { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
        { email: 'test@example.com', token: 'test-token' },
        onLogout
      );
      stopSaving = built.stopSaving;

      await waitFor(() => built.store.getState().data.notes.get('note1' as never)?.content === 'First');

      built.store.dispatch({
        type: 'EDIT_NOTE',
        noteId: 'note1' as never,
        changes: { content: 'edited' },
      });
      built.store.dispatch({ type: 'REALLY_LOG_OUT' });

      await waitFor(() => onLogout.mock.calls.length === 1);
      await new Promise((r) => setTimeout(r, 700));

      expect(onLogout).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(path.join(dir, 'state.json'))).toBe(false);
      stopSaving = undefined;
    } finally {
      stopSaving?.();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
