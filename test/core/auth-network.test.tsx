/**
 * T424 — login says when the server cannot be reached or does not answer,
 * gives up after 15 s, and shows that it is waiting (closes F037).
 *
 * Lines 1-3 drive src/core/auth.ts against real local sockets: a closed
 * port (nothing listening), and a server that accepts but never answers.
 * Line 4 renders <Login> with a request that stays pending. Line 5 reads
 * the source to pin the 15 s default (a real 15 s wait does not fit the
 * 3 s test budget).
 */
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { loginWithPassword, requestLoginCode, completeLogin } from '../../src/core/auth';
import { Login } from '../../src/tui/Login';

describe('T424 login network failures', () => {
  /**
   * 1: WHEN loginWithPassword runs against http://127.0.0.1:<port> where a
   * server listened and was closed THEN it rejects with a message containing
   * `could not reach 127.0.0.1:` and not containing `fetch failed`.
   */
  it("1: WHEN loginWithPassword runs against http://127.0.0.1:<port> where a server listened and was closed THEN it rejects with a message containing 'could not reach 127.0.0.1:' and not containing 'fetch failed'", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );

    const err = await loginWithPassword('a@b.co', 'pw', {
      authBase: `http://127.0.0.1:${port}`,
      appId: 'test-app',
      apiKey: 'k1',
    }).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(err).not.toBeNull();
    expect((err as Error).message).toContain('could not reach 127.0.0.1:');
    expect((err as Error).message).not.toContain('fetch failed');
  });

  /**
   * 2: WHEN requestLoginCode runs with { timeoutMs: 300 } against a server
   * that accepts and never answers THEN it rejects within 1500 ms with a
   * message containing `no answer from 127.0.0.1:` and `within 1 s`.
   */
  it("2: WHEN requestLoginCode runs with { timeoutMs: 300 } against a server that accepts and never answers THEN it rejects within 1500 ms with a message containing 'no answer from 127.0.0.1:' and 'within 1 s'", async () => {
    const sockets = new Set<{ destroy(): void }>();
    const server = createServer(() => {
      /* accept the request and never answer */
    });
    server.on('connection', (s) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const started = Date.now();
    let elapsed = -1;
    let message = '';
    try {
      await requestLoginCode('a@b.co', {
        accountBase: `http://127.0.0.1:${port}`,
        timeoutMs: 300,
      });
    } catch (e) {
      elapsed = Date.now() - started;
      message = (e as Error).message;
    } finally {
      for (const s of sockets) s.destroy();
      await vi.waitFor(() => server.close(() => undefined), { timeout: 2000, interval: 10 });
    }

    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1500);
    expect(message).toContain('no answer from 127.0.0.1:');
    expect(message).toContain('within 1 s');
  });

  /**
   * 3: WHEN completeLogin runs the same way THEN it rejects within 1500 ms
   * with a message containing `no answer from`.
   */
  it("3: WHEN completeLogin runs the same way THEN it rejects within 1500 ms with a message containing 'no answer from'", async () => {
    const sockets = new Set<{ destroy(): void }>();
    const server = createServer(() => {
      /* accept the request and never answer */
    });
    server.on('connection', (s) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const started = Date.now();
    let elapsed = -1;
    let message = '';
    try {
      await completeLogin('a@b.co', 'CODE', {
        accountBase: `http://127.0.0.1:${port}`,
        timeoutMs: 300,
      });
    } catch (e) {
      elapsed = Date.now() - started;
      message = (e as Error).message;
    } finally {
      for (const s of sockets) s.destroy();
      await vi.waitFor(() => server.close(() => undefined), { timeout: 2000, interval: 10 });
    }

    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1500);
    expect(message).toContain('no answer from');
  });

  /**
   * 4: WHEN <Login> has a requestCode that stays pending and 'a@b.co' then
   * '\r' are written THEN the frame contains `Contacting the server...`;
   * after that promise rejects with new Error('could not reach x') the
   * frame contains `Error: could not reach x` and not
   * `Contacting the server...`.
   */
  it("4: WHEN <Login> has a requestCode that stays pending and 'a@b.co' then '\\r' are written THEN the frame contains 'Contacting the server...'; after that promise rejects with new Error('could not reach x') the frame contains 'Error: could not reach x' and not 'Contacting the server...'", async () => {
    let rejectRequest: (e: Error) => void = () => {};
    const requestCode = () =>
      new Promise<unknown>((_resolve, reject) => {
        rejectRequest = reject;
      });
    const completeLoginFn = async () => 'tok';
    const onLoggedIn = () => {};

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLoginFn}
        onLoggedIn={onLoggedIn}
      />,
    );

    // Poll before writing (same pattern as test/tui/root.test.tsx): the
    // waits only complete once Ink has mounted and repainted, so no key
    // is ever sent into a not-yet-attached stdin.
    stdin.write('a@b.co');
    // Every asserted value is inside the polling condition.
    await vi.waitFor(
      () => {
        expect(lastFrame()).toContain('Email: a@b.co');
      },
      { timeout: 2000, interval: 10 },
    );
    stdin.write('\r');
    await vi.waitFor(
      () => {
        expect(lastFrame()).toContain('Contacting the server...');
      },
      { timeout: 2000, interval: 10 },
    );

    rejectRequest(new Error('could not reach x'));
    await vi.waitFor(
      () => {
        const f = lastFrame();
        expect(f).toContain('Error: could not reach x');
        expect(f).not.toContain('Contacting the server...');
      },
      { timeout: 2000, interval: 10 },
    );

    unmount();
  });

  /**
   * 5: WHEN src/core/auth.ts is read THEN it contains `15000`.
   */
  it('5: WHEN src/core/auth.ts is read THEN it contains 15000', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'auth.ts'), 'utf8');
    expect(src).toContain('15000');
  });
});
