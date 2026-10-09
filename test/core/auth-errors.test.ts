/**
 * Tests for src/core/auth.ts — error text bound to one line of 200 chars (T423).
 *
 * A local node:http server on 127.0.0.1 port 0 answers with any status and
 * body so we can pin how the thrown message looks for each auth function.
 */
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  requestLoginCode,
  completeLogin,
  loginWithPassword,
} from '../../src/core/auth';

describe('auth error messages are bounded (F100)', () => {
  let server: Server;
  let base: string;
  let status = 500;
  let contentType = 'text/html';
  let body = '';

  beforeEach(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(status, { 'Content-Type': contentType });
        res.end(body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  /**
   * 1: WHEN loginWithPassword gets status 500 with body `<html>\n<body>` plus
   * `x` repeated 5000 times THEN it rejects with a message that starts with
   * `500 <html> <body>x`, has length `204` and contains no `\n`.
   */
  it('1: WHEN loginWithPassword gets status 500 with html body plus 5000 x THEN message starts with 500 <html> <body>x, has length 204 and contains no \\n', async () => {
    status = 500;
    contentType = 'text/html';
    body = `<html>\n<body>${'x'.repeat(5000)}`;

    const err = await loginWithPassword('a@b.co', 'pw', {
      authBase: base,
      appId: 'test-app',
      apiKey: 'k1',
    }).catch((e: unknown) => e as Error);

    expect((err as Error).message.startsWith('500 <html> <body>x')).toBe(true);
    expect((err as Error).message.length).toBe(204);
    expect((err as Error).message).not.toContain('\n');
  });

  /**
   * 2: WHEN requestLoginCode gets the same reply THEN its message also starts
   * with `500 <html> <body>x` and has length `204`.
   */
  it('2: WHEN requestLoginCode gets the same reply THEN message starts with 500 <html> <body>x and has length 204', async () => {
    status = 500;
    contentType = 'text/html';
    body = `<html>\n<body>${'x'.repeat(5000)}`;

    const err = await requestLoginCode('a@b.co', {
      accountBase: base,
    }).catch((e: unknown) => e as Error);

    expect((err as Error).message.startsWith('500 <html> <body>x')).toBe(true);
    expect((err as Error).message.length).toBe(204);
  });

  /**
   * 3: WHEN completeLogin gets status 400 with JSON
   * `{ "message": "<p>\n" + "y" repeated 5000 times }` THEN its message starts
   * with `400 <p> y` and has length `204`.
   */
  it('3: WHEN completeLogin gets status 400 with json message <p> newline plus 5000 y THEN message starts with 400 <p> y and has length 204', async () => {
    status = 400;
    contentType = 'application/json';
    body = JSON.stringify({ message: `<p>\n${'y'.repeat(5000)}` });

    const err = await completeLogin('a@b.co', 'CODE1', {
      accountBase: base,
    }).catch((e: unknown) => e as Error);

    expect((err as Error).message.startsWith('400 <p> y')).toBe(true);
    expect((err as Error).message.length).toBe(204);
  });

  /**
   * 4: GUARD. WHEN loginWithPassword gets status 401 with body
   * `invalid login` THEN its message is exactly `401 invalid login`.
   */
  it('4: WHEN loginWithPassword gets status 401 with body invalid login THEN message is exactly 401 invalid login', async () => {
    status = 401;
    contentType = 'text/plain';
    body = 'invalid login';

    const err = await loginWithPassword('a@b.co', 'pw', {
      authBase: base,
      appId: 'test-app',
      apiKey: 'k1',
    }).catch((e: unknown) => e as Error);

    expect((err as Error).message).toBe('401 invalid login');
  });
});
