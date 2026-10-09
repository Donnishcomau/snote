/**
 * T483 — a slow but working server is not punished: the request waits the
 * full timeout, and one timer decides.
 *
 * Line 1 answers a password login after 600 ms with the default timeout and
 * expects the token back (the old 300 ms connect probe aborted such replies).
 * Line 2 is a guard: a server that never answers still rejects with
 * `no answer from` quickly when the timeout is small. Line 3 reads the
 * source to pin that the probe is gone.
 */
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { loginWithPassword } from '../../src/core/auth';

describe('T483 slow but working server', () => {
  /**
   * 1: WHEN a local server answers the password login with a valid token
   * after `600` ms and the default timeout is used THEN loginWithPassword
   * resolves with that token.
   */
  it("1: WHEN a local server answers the password login with a valid token after 600 ms and the default timeout is used THEN loginWithPassword resolves with that token", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'slow-token', userid: 'u1' }));
      }, 600);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const token = await loginWithPassword('a@b.co', 'pw', {
        authBase: `http://127.0.0.1:${port}`,
        appId: 'test-app',
        apiKey: 'k1',
      });
      expect(token).toBe('slow-token');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /**
   * 2: WHEN a local server never answers and the timeout is `200` ms THEN
   * the call rejects with a message containing `no answer from` within
   * 1000 ms.
   */
  it("2: WHEN a local server never answers and the timeout is 200 ms THEN the call rejects with a message containing 'no answer from' within 1000 ms", async () => {
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
      await loginWithPassword('a@b.co', 'pw', {
        authBase: `http://127.0.0.1:${port}`,
        appId: 'test-app',
        apiKey: 'k1',
        timeoutMs: 200,
      });
    } catch (e) {
      elapsed = Date.now() - started;
      message = (e as Error).message;
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1000);
    expect(message).toContain('no answer from');
  });

  /**
   * 3: WHEN src/core/auth.ts is read THEN it does not contain
   * `CONNECT_PROBE_AFTER_MS` and does not contain `connect(`.
   */
  it('3: WHEN src/core/auth.ts is read THEN it does not contain CONNECT_PROBE_AFTER_MS and does not contain connect(', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'auth.ts'), 'utf8');
    expect(src).not.toContain('CONNECT_PROBE_AFTER_MS');
    expect(src).not.toContain('connect(');
  });
});
